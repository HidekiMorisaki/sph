// Release gate for the source-only Git distribution; not an image-license audit.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root));
const json = async path => JSON.parse(await read(path));
const hash = value => createHash('sha256').update(value).digest('hex');
const files = execFileSync('git', ['ls-files', '-z'], { cwd: fileURLToPath(root), encoding: 'utf8' }).split('\0').filter(Boolean);
assert.ok(files.length);
for (const file of files) {
 assert.ok(!/(?:^|\/)(?:node_modules|build|\.svelte-kit|\.runtime|TEMP)(?:\/|$)/.test(file), 'Excluded distribution content: ' + file);
 assert.ok(!/(?:^|\/)\.env$|\.(?:dump|pem|key)$/.test(file), 'Private distribution content: ' + file);
}
await import('../frontend/scripts/verify-distribution.mjs');
const scanner = await json('frontend/static/vendor/quagga2-1.12.1/source.json');
assert.equal(hash(await read('frontend/static/vendor/quagga2-1.12.1/' + scanner.file.split('/').at(-1))), scanner.sha256);
const scannerNotices = (await read('frontend/static/vendor/quagga2-1.12.1/LICENSES.txt')).toString();
for (const name of ['Quagga2', 'gl-matrix', 'Lodash', 'Underscore', 'regenerator', 'webpack']) assert.ok(scannerNotices.toLowerCase().includes(name.toLowerCase()), 'Scanner notice: ' + name);
const font = await json('frontend/static/fonts/source.json');
assert.equal(hash(await read('frontend/static/fonts/' + font.distributedFile)), font.sha256);
assert.equal((await read('frontend/static/fonts/COPYRIGHT.txt')).toString().trim(), font.copyright);
assert.ok((await read('frontend/static/fonts/OFL.txt')).toString().includes('SIL OPEN FONT LICENSE Version 1.1'));
assert.ok((await read('frontend/static/licenses/gentelella-MIT.txt')).toString().includes('Copyright'));
const supplemental = await json('licenses/npm-supplemental-manifest.json');
for (const path of ['api/licenses/npm-SUPPLEMENTAL-NOTICES.txt', 'frontend/static/licenses/npm-SUPPLEMENTAL-NOTICES.txt']) assert.equal(hash(await read(path)), supplemental.noticeSha256);
for (const project of ['api', 'frontend']) {
 const manifest = await json(project + '/licenses/distribution-manifest.json');
 for (const packageName of ['node_modules/is-module', 'node_modules/pg-types', 'node_modules/pgpass']) {
  if (project === 'frontend' && packageName !== 'node_modules/is-module') continue;
  assert.ok(manifest.entries.some(entry => entry.package === packageName && /readme/i.test(entry.file)), 'README grant omitted: ' + packageName);
 }
 assert.ok(manifest.entries.some(entry => entry.package === 'node_modules/typescript' && entry.file === 'ThirdPartyNoticeText.txt'), 'TypeScript notice omitted');
}
console.log('Source-only distribution verified: installed dependencies/builds excluded; original PDF/scanner/font grants and supplemental notices retained. Built images are outside this release scope.');
