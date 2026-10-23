#!/usr/bin/env node
import { randomBytes } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { strongPassword, validDate } from './install-config.mjs';
import { blitzText } from './install-blitz-i18n.mjs';

const ENDPOINT = 'https://mcp.blitz.cloud/cli';
const REPOSITORY = 'HidekiMorisaki/sph';
const PROTOCOL = '2025-06-18';
const ADMIN_FIELDS = [
  'USERNAME', 'PASSWORD', 'EMPLOYEE_CODE', 'FIRST_NAME', 'LAST_NAME',
  'BIRTH_DATE', 'GENDER', 'EMAIL', 'HIRED_AT', 'EMPLOYMENT_TYPE',
  'BRANCH', 'DISPLAY_LANGUAGE', 'SAMPLE_DATA'
];
const defaults = JSON.parse(readFileSync(new URL('install-defaults.json', import.meta.url), 'utf8'));
let activeLanguage = 'en';
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const parse = (body, id, text) => {
  if (body.trimStart().startsWith('{') || body.trimStart().startsWith('[')) {
    const parsed = JSON.parse(body);
    return Array.isArray(parsed) ? parsed.find(message => message.id === id) : parsed;
  }
  for (const event of body.split(/\r?\n\r?\n/)) {
    const data = event.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
    if (!data) continue;
    const message = JSON.parse(data);
    if (message.id === id) return message;
  }
  throw new Error(text('unreadable'));
};

class Blitz {
  constructor(key, text) { this.key = key; this.text = text; this.id = 0; this.session = ''; }
  async request(method, params) {
    const id = ++this.id;
    const headers = {
      'Content-Type': 'application/json', Accept: 'application/json, text/event-stream',
      Authorization: `Bearer ${this.key}`
    };
    if (this.session) {
      headers['Mcp-Session-Id'] = this.session;
      headers['Mcp-Protocol-Version'] = PROTOCOL;
    }
    let response;
    for (let retry = 0; retry < 6; retry++) {
      response = await fetch(ENDPOINT, { method: 'POST', headers,
        body: JSON.stringify({ jsonrpc: '2.0', id, method, params }) });
      if (response.status !== 429) break;
      const seconds = Number(response.headers.get('retry-after'));
      if (retry === 5) throw new Error(this.text('rateLimit'));
      await pause((Number.isFinite(seconds) && seconds > 0 ? seconds : 60) * 1000);
    }
    if (response.status === 401 || response.status === 403) throw new Error(this.text('keyRejected'));
    if (!response.ok) throw new Error(this.text('http', response.status));
    if (method === 'initialize') this.session = response.headers.get('mcp-session-id') || '';
    const message = parse(await response.text(), id, this.text);
    if (message.error) throw new Error(this.text('refused'));
    return message.result;
  }
  async connect() {
    await this.request('initialize', { protocolVersion: PROTOCOL, capabilities: {},
      clientInfo: { name: 'sph-installer', version: '1.0.0' } });
    await fetch(ENDPOINT, { method: 'POST', headers: {
      'Content-Type': 'application/json', Accept: 'application/json, text/event-stream',
      Authorization: `Bearer ${this.key}`, 'Mcp-Session-Id': this.session,
      'Mcp-Protocol-Version': PROTOCOL
    }, body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) });
    const result = await this.request('tools/list', {});
    this.tools = new Map(result.tools.map(tool => [tool.name, tool]));
  }
  async call(name, args, secret = false) {
    if (!this.tools.has(name)) throw new Error(this.text('missingTool', name));
    let result;
    try { result = await this.request('tools/call', { name, arguments: args }); }
    catch (error) { throw secret ? new Error(this.text('toolFailed', name)) : error; }
    if (result.isError) throw new Error(this.text('toolFailed', name));
    const content = (result.content || []).filter(item => item.type === 'text').map(item => item.text).join('\n');
    return result.structuredContent ? JSON.stringify(result.structuredContent) : content;
  }
  async close() {
    if (!this.session) return;
    await fetch(ENDPOINT, { method: 'DELETE', headers: {
      Authorization: `Bearer ${this.key}`, 'Mcp-Session-Id': this.session
    } }).catch(() => {});
  }
  field(tool, options) {
    const properties = this.tools.get(tool)?.inputSchema?.properties || {};
    const field = options.find(name => Object.hasOwn(properties, name));
    if (!field) throw new Error(this.text('changedInput', tool));
    return field;
  }
}

function terminal() {
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('Run the installer in an interactive terminal. / 対話型ターミナルでインストーラーを実行してください。');
  let hidden = false;
  let invalidMessage = 'Invalid value. Please try again. / 入力内容が条件に合いません。再入力してください。';
  const output = new Writable({ write(chunk, encoding, next) { if (!hidden) process.stdout.write(chunk); next(); } });
  output.isTTY = true;
  output.columns = process.stdout.columns;
  const rl = createInterface({ input: process.stdin, output, terminal: true });
  return {
    async ask(label, { secret = false, fallback = '', valid = value => value.length > 0 } = {}) {
      while (true) {
        if (secret) process.stdout.write(`${label}: `);
        hidden = secret;
        let value;
        try { value = (await rl.question(secret ? '' : `${label}${fallback ? ` [${fallback}]` : ''}: `)).trim() || fallback; }
        finally { hidden = false; if (secret) process.stdout.write('\n'); }
        if (valid(value)) return value;
        process.stdout.write(`${invalidMessage}\n`);
      }
    },
    setLanguage(language) { invalidMessage = blitzText(language)('input.invalid'); },
    close() { rl.close(); }
  };
}

export function partConfiguration(details) {
  let data;
  try { data = JSON.parse(details); } catch { return null; }
  const app = data?.result || data;
  const explicit = [app?.parts, app?.app?.parts, app?.deployment?.parts].find(Array.isArray);
  const services = [app?.services, app?.app?.services].find(items => Array.isArray(items) && items.some(part =>
    ['frontend', 'v1', 'migration'].includes(part?.name || part?.service || part?.id)));
  const parts = explicit || services;
  if (!parts) return null;
  const byName = new Map(parts.map(part => [part.name || part.service || part.id, part]));
  const frontend = byName.get('frontend');
  const api = byName.get('v1');
  const migration = byName.get('migration');
  const route = part => part?.path || part?.route || part?.publicPath;
  const enabled = part => part && part.enabled !== false && part.disabled !== true;
  const predeploy = part => ['step', 'predeploy', 'pre-deploy'].includes(part?.type || part?.phase) || part?.runBeforeDeploy === true || part?.beforeDeploy === true;
  return Boolean(enabled(frontend) && enabled(api) && enabled(migration) && route(frontend) === '/' && route(api) === '/v1' && predeploy(migration));
}

function partDiagnostic(details) {
  let data;
  try { data = JSON.parse(details); } catch {
    return {
      format: 'text',
      markers: Object.fromEntries(['frontend', 'v1', '/v1', 'migration', 'before', 'parts'].map(word => [word, details.includes(word)]))
    };
  }
  const app = data?.result || data;
  const candidates = [app?.parts, app?.services, app?.app?.parts, app?.app?.services, app?.deployment?.parts];
  return {
    format: 'json',
    arrays: candidates.map((parts, index) => ({
      location: index,
      count: Array.isArray(parts) ? parts.length : null,
      entries: Array.isArray(parts) ? parts.map(part => ({
        name: ['frontend', 'v1', 'migration'].includes(part?.name || part?.service) ? part.name || part.service : 'other',
        path: ['/', '/v1', '/api'].includes(part?.path || part?.route || part?.publicPath) ? part.path || part.route || part.publicPath : 'other',
        type: ['step', 'predeploy', 'pre-deploy', 'worker'].includes(part?.type || part?.phase) ? part.type || part.phase : 'other'
      })) : undefined
    }))
  };
}

async function verifyParts(client, app, prompt, text, manuallyConfirmed = false) {
  const details = await client.call('apps_get', { app });
  const configured = partConfiguration(details);
  if (configured === false) throw new Error(text('partsMissing'));
  if (configured === null && !manuallyConfirmed) {
    process.stdout.write(`${text('verifyParts')}\n`);
    const answer = await prompt.ask(text('verifyPrompt'));
    if (answer !== 'VERIFY') throw new Error(text('verifyFailed'));
    return true;
  }
  return manuallyConfirmed || configured === true;
}

async function accountName(client) {
  for (const tool of ['account_get', 'profile_get', 'usage_get']) {
    if (!client.tools.has(tool)) continue;
    let info;
    try { info = await client.call(tool, {}); } catch { continue; }
    let data;
    try { data = JSON.parse(info); } catch { continue; }
    const name = data?.account?.slug || data?.account?.name || data?.slug || data?.accountName;
    if (typeof name === 'string' && /^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])$/.test(name)) return name;
  }
  return '';
}

export async function collectAdministrator(prompt, language) {
  const text = blitzText(language);
  const initial = defaults[language];
  const fields = {};
  fields.USERNAME = await prompt.ask(text('username'), { fallback: 'admin', valid: value => value.length <= 64 && value.length > 0 });
  while (true) {
    const password = await prompt.ask(text('password'), { secret: true, valid: strongPassword });
    const confirmation = await prompt.ask(text('confirmPassword'), { secret: true });
    if (password === confirmation) { fields.PASSWORD = password; break; }
    process.stdout.write(`${text('passwordMismatch')}\n`);
  }
  fields.FIRST_NAME = await prompt.ask(text('firstName'), { fallback: initial.firstName, valid: value => value.length <= 128 });
  fields.LAST_NAME = await prompt.ask(text('lastName'), { fallback: initial.lastName, valid: value => value.length <= 128 });
  fields.BIRTH_DATE = await prompt.ask(text('birthDate'), { fallback: '1990-01-01', valid: validDate });
  fields.GENDER = await prompt.ask(text('gender'), { fallback: 'unspecified', valid: value => ['female', 'male', 'unspecified'].includes(value) });
  fields.EMAIL = await prompt.ask(text('email'), { fallback: 'system-admin@example.test', valid: value => value.length <= 255 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) });
  fields.EMPLOYEE_CODE = await prompt.ask(text('employeeCode'), { fallback: 'SYSTEMADMIN0001', valid: value => /^[A-Za-z0-9]{10,64}$/.test(value) });
  fields.HIRED_AT = await prompt.ask(text('hireDate'), { fallback: new Date().toISOString().slice(0, 10), valid: validDate });
  fields.EMPLOYMENT_TYPE = await prompt.ask(text('employmentType'), { fallback: 'Regular', valid: value => ['Regular', 'Contract', 'Part Time', 'Temporary'].includes(value) });
  fields.BRANCH = await prompt.ask(text('branch'), { fallback: initial.branch, valid: value => value.length <= 128 });
  fields.DISPLAY_LANGUAGE = language;
  fields.SAMPLE_DATA = await prompt.ask(text('samples'), { fallback: 'no', valid: value => ['yes', 'no'].includes(value) });
  return fields;
}

async function waitForHealth(origin, text) {
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const response = await fetch(`${origin}/v1/health`, { signal: AbortSignal.timeout(5000) });
      const result = await response.json();
      if (response.ok && result.status === 'success' && result.responseCode === 200) return;
    } catch { /* Build or wake-up is still in progress. */ }
    await pause(10000);
  }
  throw new Error(text('health'));
}

async function apiResponse(origin, path, text, options = {}) {
  const response = await fetch(`${origin}${path}`, { ...options, signal: AbortSignal.timeout(10000) });
  if (!response.headers.get('content-type')?.includes('application/json')) throw new Error(text('nonJson', path));
  const body = await response.json();
  if (body.responseCode !== response.status || !['success', 'error'].includes(body.status)) throw new Error(text('invalidApi', path));
  return { response, body };
}

async function verifyAuthentication(origin, username, password, text) {
  const before = await apiResponse(origin, '/v1/auth/session', text);
  if (before.response.status !== 401 || before.body.error?.code !== 'AUTHENTICATION_REQUIRED') throw new Error(text('session'));
  const login = await apiResponse(origin, '/v1/auth/login', text, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ identifier: username, password }) });
  if (login.response.status !== 200 || login.body.data?.authenticated !== true) throw new Error(text('login'));
  const cookie = login.response.headers.get('set-cookie')?.split(';', 1)[0];
  if (!cookie) throw new Error(text('cookie'));
  const session = await apiResponse(origin, '/v1/auth/session', text, { headers: { cookie } });
  if (session.response.status !== 200 || session.body.data?.user?.username !== username) throw new Error(text('sessionVerify'));
  const logout = await apiResponse(origin, '/v1/auth/logout', text, { method: 'POST', headers: { cookie } });
  if (logout.response.status !== 200 || logout.body.data?.authenticated !== false) throw new Error(text('logout'));
  const after = await apiResponse(origin, '/v1/auth/session', text, { headers: { cookie } });
  if (after.response.status !== 401) throw new Error(text('sessionActive'));
}

export async function selectLanguage(prompt) {
  const text = blitzText('en');
  process.stdout.write(`${text('menu')}\n`);
  const choice = await prompt.ask(text('menuPrompt'), { fallback: '1', valid: value => ['1', '2'].includes(value) });
  return choice === '1' ? 'en' : 'ja';
}

async function main() {
  const inspectParts = process.argv.includes('--inspect-parts');
  const branchOption = process.argv.indexOf('--branch');
  const argumentsWithoutInspect = process.argv.filter(argument => argument !== '--inspect-parts');
  if (branchOption !== -1 && (!process.argv[branchOption + 1] || argumentsWithoutInspect.length !== 4)) throw new Error('Usage: node scripts/install-blitz.mjs [--branch BRANCH] [--inspect-parts]');
  if (branchOption === -1 && argumentsWithoutInspect.length !== 2) throw new Error('Usage: node scripts/install-blitz.mjs [--branch BRANCH] [--inspect-parts]');
  const branch = branchOption === -1 ? 'main' : process.argv[branchOption + 1];
  if (!/^[A-Za-z0-9][A-Za-z0-9._/-]{0,120}$/.test(branch) || branch.includes('..')) throw new Error('Invalid branch name.');
  const prompt = terminal();
  let client;
  try {
    activeLanguage = await selectLanguage(prompt);
    prompt.setLanguage(activeLanguage);
    const text = blitzText(activeLanguage);
    process.stdout.write(`${text('intro')}\n`);
    const key = await prompt.ask(text('apiKey'), { secret: true });
    client = new Blitz(key, text);
    await client.connect();
    const account = await prompt.ask(text('account'), { fallback: await accountName(client), valid: value => /^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])$/.test(value) });
    const address = await prompt.ask(text('app'), { fallback: 'sph', valid: value => /^[a-z0-9](?:[a-z0-9-]{0,28}[a-z0-9])?$/.test(value) });
    const app = address;
    const origin = `https://${address}.${account}.blitz.cloud`;
    const existing = await client.call('apps_list', {});
    const resume = existing.includes(`${address}.${account}.blitz.cloud`);
    if (!resume) {
      throw new Error(text('noApp', origin, REPOSITORY, branch));
    } else {
      const details = await client.call('apps_get', { app });
      if (inspectParts) {
        process.stdout.write(`apps_get part diagnostics: ${JSON.stringify(partDiagnostic(details))}\n`);
        return;
      }
      if (!details.includes(REPOSITORY) && !details.includes(`github.com/${REPOSITORY}`)) {
        throw new Error(text('wrongSource', origin, REPOSITORY));
      }
      process.stdout.write(`${text('resume', origin)}\n`);
    }
    const manuallyConfirmedParts = await verifyParts(client, app, prompt, text);
    const updateProps = client.tools.get('apps_update')?.inputSchema?.properties || {};
    const nightlyField = ['autoUpdate', 'automaticUpdates', 'nightlyUpdates', 'autoUpdates'].find(name => Object.hasOwn(updateProps, name));
    if (nightlyField) await client.call('apps_update', { app, [nightlyField]: false });
    else process.stdout.write(`${text('nightly')}\n`);
    const existingSettings = await client.call('env_list', { app });
    if (!existingSettings.includes('DATABASE_URL')) {
      const database = `sph-${address}`;
      const databases = await client.call('dbs_list', {});
      if (!databases.includes(database)) await client.call('dbs_create', { engine: 'postgresql', name: database });
      const connectArgs = { app };
      connectArgs[client.field('dbs_connect', ['database', 'db', 'databaseName', 'dbId', 'databaseId'])] = database;
      await client.call('dbs_connect', connectArgs);
    }
    await client.call('env_set', { app, name: 'ORIGIN', value: origin }, true);
    // Session-aware SSR must reach /v1 through the blitz.cloud route; the Compose service name is not reachable here.
    await client.call('env_set', { app, name: 'API_INTERNAL_ORIGIN', value: origin }, true);
    // The API is reachable only through the platform's trusted ingress.
    await client.call('env_set', { app, name: 'ADDRESS_HEADER', value: 'X-Forwarded-For' }, true);
    await client.call('env_set', { app, name: 'XFF_DEPTH', value: '1' }, true);
    const settings = await client.call('env_list', { app });
    if (!settings.includes('IT_ASSET_CREDENTIAL_ENCRYPTION_KEY')) {
      await client.call('env_set', { app, name: 'IT_ASSET_CREDENTIAL_ENCRYPTION_KEY',
        value: randomBytes(32).toString('base64url') }, true);
    }
    const admin = await collectAdministrator(prompt, activeLanguage);
    for (const field of ADMIN_FIELDS) await client.call('env_set', { app, name: `INITIAL_ADMIN_${field}`, value: admin[field] }, true);
    process.stdout.write(`${text('saved')}\n`);
    await client.call('builds_start', { app });
    await waitForHealth(origin, text);
    await verifyParts(client, app, prompt, text, manuallyConfirmedParts);
    await verifyAuthentication(origin, admin.USERNAME, admin.PASSWORD, text);
    for (const field of ADMIN_FIELDS) {
      await client.call('env_delete', { app, name: `INITIAL_ADMIN_${field}`, confirm: true }, true);
    }
    await waitForHealth(origin, text);
    process.stdout.write(`${text('ready', origin)}\n`);
  } finally {
    prompt.close();
    await client?.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    process.stderr.write(`${error.message}\n${blitzText(activeLanguage)('stopped')}\n`);
    process.exitCode = 1;
  });
}
