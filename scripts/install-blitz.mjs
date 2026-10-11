#!/usr/bin/env node
import { randomBytes } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';

const ENDPOINT = 'https://mcp.blitz.cloud/cli';
const REPOSITORY = 'HidekiMorisaki/sph';
const PROTOCOL = '2025-06-18';
const ADMIN_FIELDS = [
  'USERNAME', 'PASSWORD', 'EMPLOYEE_CODE', 'FIRST_NAME', 'LAST_NAME',
  'BIRTH_DATE', 'GENDER', 'EMAIL', 'HIRED_AT', 'EMPLOYMENT_TYPE',
  'BRANCH', 'DISPLAY_LANGUAGE'
];
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
    return content;
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

async function main() {
  const branchOption = process.argv.indexOf('--branch');
  if (branchOption !== -1 && (!process.argv[branchOption + 1] || process.argv.length !== 4)) throw new Error('Usage: node scripts/install-blitz.mjs [--branch BRANCH]');
  if (branchOption === -1 && process.argv.length !== 2) throw new Error('Usage: node scripts/install-blitz.mjs [--branch BRANCH]');
  const branch = branchOption === -1 ? 'main' : process.argv[branchOption + 1];
  if (!/^[A-Za-z0-9][A-Za-z0-9._/-]{0,120}$/.test(branch) || branch.includes('..')) throw new Error('Invalid branch name.');
  const prompt = terminal();
  let client;
  try {
    process.stdout.write('SPH on blitz.cloud. Create an account, connect GitHub code access, and make an API key on https://dashboard.blitz.cloud/ai first.\n');
    const account = await prompt.ask('blitz.cloud account name (the part before .blitz.cloud)', { valid: value => /^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])$/.test(value) });
    const address = await prompt.ask('App subdomain', { fallback: 'sph', valid: value => /^[a-z0-9](?:[a-z0-9-]{0,28}[a-z0-9])?$/.test(value) });
    const app = address;
    const origin = `https://${address}.${account}.blitz.cloud`;
    const key = await prompt.ask('blitz.cloud API key (hidden)', { secret: true });
    client = new Blitz(key);
    await client.connect();
    const existing = await client.call('apps_list', {});
    const resume = existing.includes(`${address}.${account}.blitz.cloud`);
    if (!resume) {
      process.stdout.write(`Creating ${origin} from ${REPOSITORY}, branch ${branch}. The first build may wait for its database and settings.\n`);
      await client.call('apps_deploy_github', { repo: REPOSITORY, branch, name: 'SPH', address });
    } else {
      const details = await client.call('apps_get', { app });
      if (!details.includes(REPOSITORY) && !details.includes(`github.com/${REPOSITORY}`)) {
        throw new Error(`An app already uses ${origin}, but its source is not ${REPOSITORY}.`);
      }
      process.stdout.write(`Resuming ${origin}. Existing data and encryption settings will be kept.\n`);
    }
    const updateProps = client.tools.get('apps_update')?.inputSchema?.properties || {};
    const nightlyField = ['autoUpdate', 'automaticUpdates', 'nightlyUpdates', 'autoUpdates'].find(name => Object.hasOwn(updateProps, name));
    if (nightlyField) await client.call('apps_update', { app, [nightlyField]: false });
    else process.stdout.write('Turn off nightly updates in the app Settings page before using it.\n');
    const database = `sph-${address}`;
    const databases = await client.call('dbs_list', {});
    if (!databases.includes(database)) await client.call('dbs_create', { engine: 'postgresql', name: database });
    const connectArgs = { app };
    connectArgs[client.field('dbs_connect', ['database', 'db', 'databaseName', 'dbId', 'databaseId'])] = database;
    await client.call('dbs_connect', connectArgs);
    await client.call('env_set', { app, name: 'APP_ORIGIN', value: origin }, true);
    const settings = await client.call('env_list', { app });
    if (!settings.includes('IT_ASSET_CREDENTIAL_ENCRYPTION_KEY')) {
      await client.call('env_set', { app, name: 'IT_ASSET_CREDENTIAL_ENCRYPTION_KEY',
        value: randomBytes(32).toString('base64url') }, true);
    }
    const labels = {
      USERNAME: 'Administrator username', PASSWORD: 'Administrator password (12+ characters, upper/lowercase and digit)',
      EMPLOYEE_CODE: 'Employee code (10–64 letters/digits)', FIRST_NAME: 'First name', LAST_NAME: 'Last name',
      BIRTH_DATE: 'Birth date (YYYY-MM-DD)', GENDER: 'Gender (female/male/unspecified)',
      EMAIL: 'Email address', HIRED_AT: 'Hire date (YYYY-MM-DD)',
      EMPLOYMENT_TYPE: 'Employment type', BRANCH: 'Branch name', DISPLAY_LANGUAGE: 'Language (en/ja)'
    };
    for (const field of ADMIN_FIELDS) {
      const value = await prompt.ask(labels[field], { secret: field === 'PASSWORD',
        fallback: field === 'DISPLAY_LANGUAGE' ? 'ja' : '',
        valid: field === 'GENDER' ? value => ['female', 'male', 'unspecified'].includes(value) :
          field === 'DISPLAY_LANGUAGE' ? value => ['en', 'ja'].includes(value) :
          field === 'EMPLOYEE_CODE' ? value => /^[A-Za-z0-9]{10,64}$/.test(value) :
          field === 'PASSWORD' ? value => value.length >= 12 && /[a-z]/.test(value) && /[A-Z]/.test(value) && /\d/.test(value) : undefined });
      await client.call('env_set', { app, name: `INITIAL_ADMIN_${field}`, value }, true);
    }
    process.stdout.write('Settings saved. Starting a build and waiting for /v1/health.\n');
    await client.call('builds_start', { app });
    await waitForHealth(origin);
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

main().catch(error => {
  process.stderr.write(`${error.message}\nNo database or app was deleted. Correct the issue and rerun this installer to resume.\n`);
  process.exitCode = 1;
});
