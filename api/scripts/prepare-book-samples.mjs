// Generate the installer's Node-compatible copies from the same sources as the API.
// No third-party source/data is copied; runtime image libraries already belong to the API.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { transpileModule, ScriptTarget, ModuleKind } from 'typescript';

const names = ['book-isbn', 'book-cover', 'openbd-book-lookup', 'openbd-book-cover'];
const destination = new URL('./generated-book-sources/', import.meta.url);
const check = process.argv.includes('--check');
if (!check) await mkdir(destination, { recursive: true });
for (const name of names) {
 const source = await readFile(new URL(`../src/lib/server/api/${name}.ts`, import.meta.url), 'utf8');
 const output = transpileModule(source, { compilerOptions: { target: ScriptTarget.ES2022, module: ModuleKind.ES2022 }, fileName: `${name}.ts` }).outputText;
 const code = '// Generated from api/src/lib/server/api; do not edit.\n' + output.replace(/from '(\.\/[^']+)'/g, (_, path) => {
  if (!names.includes(path.slice(2))) throw new Error('Unsupported installer book source import.');
  return `from '${path}.mjs'`;
 });
 const file = new URL(`${name}.mjs`, destination);
 if (check) {
  if (await readFile(file, 'utf8').catch(() => null) !== code) throw new Error('Installer book sources are missing or stale. Run npm run prepare.');
 } else await writeFile(file, code);
}
