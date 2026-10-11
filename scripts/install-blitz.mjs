#!/usr/bin/env node
import { randomBytes } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { strongPassword, validDate } from './install-config.mjs';

const ENDPOINT = 'https://mcp.blitz.cloud/cli';
const REPOSITORY = 'HidekiMorisaki/sph';
const PROTOCOL = '2025-06-18';
const ADMIN_FIELDS = [
  'USERNAME', 'PASSWORD', 'EMPLOYEE_CODE', 'FIRST_NAME', 'LAST_NAME',
  'BIRTH_DATE', 'GENDER', 'EMAIL', 'HIRED_AT', 'EMPLOYMENT_TYPE',
  'BRANCH', 'DISPLAY_LANGUAGE', 'SAMPLE_DATA'
];
const defaults = JSON.parse(readFileSync(new URL('install-defaults.json', import.meta.url), 'utf8'));
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const parse = (body, id) => {
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
  throw new Error('blitz.cloud returned an unreadable response.');
};

class Blitz {
  constructor(key) { this.key = key; this.id = 0; this.session = ''; }
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
      if (retry === 5) throw new Error('blitz.cloud rate limit reached. Wait and rerun the installer.');
      await pause((Number.isFinite(seconds) && seconds > 0 ? seconds : 60) * 1000);
    }
    if (response.status === 401 || response.status === 403) throw new Error('The API key was refused. Issue a new key in blitz.cloud → AI tools.');
    if (!response.ok) throw new Error(`blitz.cloud returned HTTP ${response.status}.`);
    if (method === 'initialize') this.session = response.headers.get('mcp-session-id') || '';
    const message = parse(await response.text(), id);
    if (message.error) throw new Error(message.error.message || 'blitz.cloud refused the request.');
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
    if (!this.tools.has(name)) throw new Error(`blitz.cloud does not offer ${name}.`);
    let result;
    try { result = await this.request('tools/call', { name, arguments: args }); }
    catch (error) { throw secret ? new Error(`${name} failed. Check the app in the blitz.cloud dashboard.`) : error; }
    const content = (result.content || []).filter(item => item.type === 'text').map(item => item.text).join('\n');
    if (result.isError) throw new Error(secret ? `${name} failed. Check the app in the blitz.cloud dashboard.` : content || `${name} failed.`);
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
    if (!field) throw new Error(`blitz.cloud changed ${tool}'s input. Check the current API documentation.`);
    return field;
  }
}

function terminal() {
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('Run the installer in an interactive terminal.');
  let hidden = false;
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
        process.stdout.write('Invalid value. Please try again.\n');
      }
    },
    close() { rl.close(); }
  };
}

export function partConfiguration(details) {
  let data;
  try { data = JSON.parse(details); } catch { return null; }
  const app = data?.result || data;
  const candidates = [app?.parts, app?.services, app?.app?.parts, app?.app?.services, app?.deployment?.parts];
  const parts = candidates.find(Array.isArray);
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

async function verifyParts(client, app) {
  const details = await client.call('apps_get', { app });
  if (!partConfiguration(details)) throw new Error('The deployment does not confirm frontend at /, v1 at /v1, and a pre-deploy migration. No administrator credentials were sent. The MCP tools cannot add parts to an existing app; create the multi-part app in the GitHub deployment wizard, then rerun this installer.');
  return details;
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

export async function collectAdministrator(prompt) {
  const language = await prompt.ask('Language (en/ja)', { fallback: 'ja', valid: value => Object.hasOwn(defaults, value) });
  const initial = defaults[language];
  const fields = {};
  fields.USERNAME = await prompt.ask('Administrator username', { fallback: 'admin', valid: value => value.length <= 64 && value.length > 0 });
  while (true) {
    const password = await prompt.ask('Administrator password (hidden)', { secret: true, valid: strongPassword });
    const confirmation = await prompt.ask('Confirm administrator password (hidden)', { secret: true });
    if (password === confirmation) { fields.PASSWORD = password; break; }
    process.stdout.write('Passwords did not match. Please try again.\n');
  }
  fields.FIRST_NAME = await prompt.ask('First name', { fallback: initial.firstName, valid: value => value.length <= 128 });
  fields.LAST_NAME = await prompt.ask('Last name', { fallback: initial.lastName, valid: value => value.length <= 128 });
  fields.BIRTH_DATE = await prompt.ask('Birth date (YYYY-MM-DD)', { fallback: '1990-01-01', valid: validDate });
  fields.GENDER = await prompt.ask('Gender (female/male/unspecified)', { fallback: 'unspecified', valid: value => ['female', 'male', 'unspecified'].includes(value) });
  fields.EMAIL = await prompt.ask('Email address', { fallback: 'system-admin@example.test', valid: value => value.length <= 255 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) });
  fields.EMPLOYEE_CODE = await prompt.ask('Employee code', { fallback: 'SYSTEMADMIN0001', valid: value => /^[A-Za-z0-9]{10,64}$/.test(value) });
  fields.HIRED_AT = await prompt.ask('Hire date (YYYY-MM-DD)', { fallback: new Date().toISOString().slice(0, 10), valid: validDate });
  fields.EMPLOYMENT_TYPE = await prompt.ask('Employment type (Regular/Contract/Part Time/Temporary)', { fallback: 'Regular', valid: value => ['Regular', 'Contract', 'Part Time', 'Temporary'].includes(value) });
  fields.BRANCH = await prompt.ask('Branch name', { fallback: initial.branch, valid: value => value.length <= 128 });
  fields.DISPLAY_LANGUAGE = language;
  fields.SAMPLE_DATA = await prompt.ask('Add fictional sample data? (yes/no)', { fallback: 'no', valid: value => ['yes', 'no'].includes(value) });
  return fields;
}

async function waitForHealth(origin) {
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const response = await fetch(`${origin}/v1/health`, { signal: AbortSignal.timeout(5000) });
      const result = await response.json();
      if (response.ok && result.status === 'success' && result.responseCode === 200) return;
    } catch { /* Build or wake-up is still in progress. */ }
    await pause(10000);
  }
  throw new Error('The app did not answer at /v1/health. Check the build, migration, and Parts paths in blitz.cloud.');
}

async function apiResponse(origin, path, options = {}) {
  const response = await fetch(`${origin}${path}`, { ...options, signal: AbortSignal.timeout(10000) });
  if (!response.headers.get('content-type')?.includes('application/json')) throw new Error(`${path} returned a non-JSON response. Check the v1 part and its /v1 route.`);
  const body = await response.json();
  if (body.responseCode !== response.status || !['success', 'error'].includes(body.status)) throw new Error(`${path} returned an invalid API response.`);
  return { response, body };
}

async function verifyAuthentication(origin, username, password) {
  const before = await apiResponse(origin, '/v1/auth/session');
  if (before.response.status !== 401 || before.body.error?.code !== 'AUTHENTICATION_REQUIRED') throw new Error('The unauthenticated session response was unexpected.');
  const login = await apiResponse(origin, '/v1/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ identifier: username, password }) });
  if (login.response.status !== 200 || login.body.data?.authenticated !== true) throw new Error('Administrator login failed. Check migration and the initial profile.');
  const cookie = login.response.headers.get('set-cookie')?.split(';', 1)[0];
  if (!cookie) throw new Error('Administrator login did not set a session cookie.');
  const session = await apiResponse(origin, '/v1/auth/session', { headers: { cookie } });
  if (session.response.status !== 200 || session.body.data?.user?.username !== username) throw new Error('Administrator session verification failed.');
  const logout = await apiResponse(origin, '/v1/auth/logout', { method: 'POST', headers: { cookie } });
  if (logout.response.status !== 200 || logout.body.data?.authenticated !== false) throw new Error('Administrator logout failed.');
  const after = await apiResponse(origin, '/v1/auth/session', { headers: { cookie } });
  if (after.response.status !== 401) throw new Error('The administrator session remained active after logout.');
}

async function main() {
  const branchOption = process.argv.indexOf('--branch');
  if (branchOption !== -1 && (!process.argv[branchOption + 1] || process.argv.length !== 4)) throw new Error('Usage: node scripts/install-blitz.mjs [--branch BRANCH]');
  if (branchOption === -1 && process.argv.length !== 2) throw new Error('Usage: node scripts/install-blitz.mjs [--branch BRANCH]');
  const branch = branchOption === -1 ? 'main' : process.argv[branchOption + 1];
  if (!/^[A-Za-z0-9][A-Za-z0-9._/-]{0,120}$/.test(branch) || branch.includes('..')) throw new Error('Invalid branch name.');
  const prompt = terminal();
  let client;
  try {
    process.stdout.write('SPH on blitz.cloud. Create the multi-part app in the GitHub deployment wizard, then make an API key on https://dashboard.blitz.cloud/ai.\n');
    const key = await prompt.ask('blitz.cloud API key (hidden)', { secret: true });
    client = new Blitz(key);
    await client.connect();
    const account = await prompt.ask('blitz.cloud account name (the part before .blitz.cloud)', { fallback: await accountName(client), valid: value => /^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])$/.test(value) });
    const address = await prompt.ask('App subdomain', { fallback: 'sph', valid: value => /^[a-z0-9](?:[a-z0-9-]{0,28}[a-z0-9])?$/.test(value) });
    const app = address;
    const origin = `https://${address}.${account}.blitz.cloud`;
    const existing = await client.call('apps_list', {});
    const resume = existing.includes(`${address}.${account}.blitz.cloud`);
    if (!resume) {
      throw new Error(`No app exists at ${origin}. Create it from ${REPOSITORY}, branch ${branch}, in the blitz.cloud GitHub deployment wizard. Set frontend at /, v1 at /v1, and migration as a pre-deploy step. Then rerun this installer.`);
    } else {
      const details = await client.call('apps_get', { app });
      if (!details.includes(REPOSITORY) && !details.includes(`github.com/${REPOSITORY}`)) {
        throw new Error(`An app already uses ${origin}, but its source is not ${REPOSITORY}.`);
      }
      process.stdout.write(`Resuming ${origin}. Existing data and encryption settings will be kept.\n`);
    }
    await verifyParts(client, app);
    const updateProps = client.tools.get('apps_update')?.inputSchema?.properties || {};
    const nightlyField = ['autoUpdate', 'automaticUpdates', 'nightlyUpdates', 'autoUpdates'].find(name => Object.hasOwn(updateProps, name));
    if (nightlyField) await client.call('apps_update', { app, [nightlyField]: false });
    else process.stdout.write('Turn off nightly updates in the app Settings page before using it.\n');
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
    const settings = await client.call('env_list', { app });
    if (!settings.includes('IT_ASSET_CREDENTIAL_ENCRYPTION_KEY')) {
      await client.call('env_set', { app, name: 'IT_ASSET_CREDENTIAL_ENCRYPTION_KEY',
        value: randomBytes(32).toString('base64url') }, true);
    }
    const admin = await collectAdministrator(prompt);
    for (const field of ADMIN_FIELDS) await client.call('env_set', { app, name: `INITIAL_ADMIN_${field}`, value: admin[field] }, true);
    process.stdout.write('Settings saved. Starting a build and waiting for /v1/health.\n');
    await client.call('builds_start', { app });
    await waitForHealth(origin);
    await verifyParts(client, app);
    await verifyAuthentication(origin, admin.USERNAME, admin.PASSWORD);
    for (const field of ADMIN_FIELDS) {
      await client.call('env_delete', { app, name: `INITIAL_ADMIN_${field}`, confirm: true }, true);
    }
    await waitForHealth(origin);
    process.stdout.write(`SPH is ready at ${origin}. Sign in with the administrator account you entered.\n`);
  } finally {
    prompt.close();
    await client?.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    process.stderr.write(`${error.message}\nNo database or app was deleted. Correct the issue and rerun this installer to resume.\n`);
    process.exitCode = 1;
  });
}
