// Preserve original notices for installed build/server modules and browser output.
// Does not infer a license from an SPDX label or manufacture missing upstream text.
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const check = process.argv.includes('--check');
for (const project of ['api', 'frontend']) {
 const lock = JSON.parse(await readFile(join(root, project, 'package-lock.json'), 'utf8'));
 const entries = [], missing = [];
 for (const [location, pkg] of Object.entries(lock.packages).sort(([a], [b]) => a.localeCompare(b, 'en'))) {
  if (!location) continue;
  const folder = join(root, project, location);
  let names; try { names = await readdir(folder, { withFileTypes: true }); } catch { continue; } // Other-platform optional archives are not copied.
  const files = names.filter(n => n.isFile() && /^(?:(?:licen[cs]e|copying|notice|copyright)(?:[._-]|$)|third.?party.*(?:notice|licen[cs]e))/i.test(n.name)).map(n => n.name).sort();
  // Some official archives put the complete grant and copyright in README.
  // A label such as "MIT" alone is deliberately insufficient.
  for (const name of names.filter(n => n.isFile() && /^readme(?:\.|$)/i.test(n.name)).map(n => n.name)) {
   const original = await readFile(join(folder, name), 'utf8');
   const section = original.slice(original.search(/^#{1,3}\s+licen[cs]e\b/im));
   if (/^#{1,3}\s+licen[cs]e\b/im.test(original) && /Copyright/i.test(section) && /Permission is hereby granted/i.test(section) && /THE SOFTWARE IS PROVIDED/i.test(section)) files.push(name);
  }
  if (!files.length) { missing.push(location + '@' + pkg.version); continue; }
  for (const name of files) {
   const text = await readFile(join(folder, name), 'utf8');
   entries.push({ package: location, version: pkg.version, source: pkg.resolved, integrity: pkg.integrity, file: name, sha256: createHash('sha256').update(text).digest('hex'), text });
  }
 }
 const notice = 'Third-party notices for SPH ' + project + '\n\nThese are original notices for the installed build/server candidates; inclusion here does not mean every package is present in every browser chunk. Separately retained notices under licenses cover embedded and supplemental materials.\n\n' + entries.map(e => '===== ' + e.package + '@' + e.version + ' / ' + e.file + ' =====\nSource: ' + e.source + '\n\n' + e.text).join('\n\n');
 const output = project === 'frontend' ? join(root, project, 'static/licenses/THIRD_PARTY_NOTICES.txt') : join(root, project, 'licenses/npm-THIRD_PARTY_NOTICES.txt');
 const manifest = JSON.stringify({ project, packagesWithoutRootNotice: missing, entries: entries.map(({ text, ...e }) => e) }, null, 2) + '\n';
 const manifestPath = join(root, project, 'licenses/distribution-manifest.json');
 if (check) {
  if (await readFile(output, 'utf8') !== notice || await readFile(manifestPath, 'utf8') !== manifest) throw Error('Distribution notices differ: ' + project);
 } else { await writeFile(output, notice); await writeFile(manifestPath, manifest); }
 console.log(JSON.stringify({ project, retainedOriginalFiles: entries.length, packagesWithoutRootNotice: missing }));
}
