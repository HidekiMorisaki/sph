# Reviewed npm inputs and SPH compatibility sources

`prepare.mjs` downloads the exact npm archives in `manifest.json` as data,
verifies each registry SHA-512, and replaces only SHA-256 checked source ranges
before installation. It writes disposable packages under `generated/` (excluded
from Git and Docker contexts). No archive script or original compiler is run.
Generated packages preserve original licenses, add the SPH MIT license and
modification notice, and omit stale maps and lifecycle scripts.

The replacements preserve the adopted versions: Svelte 5.57.2, svelte-check
4.4.6 (frontend) / 4.7.6 (API) and Prisma 7.10.1. Vite 8.3.8 is a metadata-only
modified package: its unused Lightning CSS dependency is removed before
resolution, while all executable source hashes match the original npm archive.
The officially supported esbuild CSS minifier is selected after Kit configuration
for both SSR and client environments; CSS remains minified. See
[`licenses/build-native`](../../licenses/build-native/) for native-tool originals.
The obsolete CommonJS plugin from adapter-node 5 is no longer installed.
Svelte source imports and its bundled CommonJS compiler use SPH's ESTree-role
and UTF-16 location helpers. The checker bundle's reference helper is replaced too. `is-reference` and
`locate-character` are not installed. The unused helper in the compiler bundle
is removed. The SPH code is a compatible implementation; it does not supply or
claim a missing grant for the upstream helper packages.

Prisma's embedded development database dependency, dynamic imports and
startup-time state import are excluded. Embedded-server discovery returns no
servers. `prisma dev` fails explicitly; configured PostgreSQL generate,
validate, format, migrations and Studio remain available. `@prisma/dev` and
its PGlite subtree are not installed. This is a modified Prisma distribution,
not an upstream release; retain its Apache 2.0 text and SPH modification notice.

`verify.mjs` checks the modified installed source hashes, helper bytes, versions
and absence of the unresolved dependencies before compiler/checker/CLI tasks.
A version update requires a new archive and source-range review. Original
notices for retained packages are collected by `scripts/build-third-party-notices.mjs`;
the supplemental originals remain under `licenses/`. Never regenerate the
manifest from arbitrary installed code to bypass a mismatch.

## Installation

For local development, run `node vendor/npm/prepare.mjs` from the product root,
then `npm ci --ignore-scripts` and `npm run prepare` in each project. The
`.npmrc` files require installed local copies. Do not use `npm install` to
resolve the excluded upstream helpers back into this tree.

Docker removes npm/Corepack before installing any project dependencies.
`install.mjs` is a Linux-only extractor for the committed version-3 lockfile:
it fetches only registry.npmjs.org HTTPS archives with SHA-512 integrity, copies
only prepared local packages, filters OS/CPU/libc and omit flags (including
`devOptional`), preserves executable modes and creates local executable links.
Parents are installed before nested dependencies. It does not resolve versions,
read registry metadata or npm user configuration, or execute lifecycle scripts.
It is not a general package manager. `run.mjs` invokes only a declared project
task using its local executable directory. Keep these restrictions when updating
locks. The common tar reader rejects traversal, links, multiple roots, conflicting
duplicates, invalid header checksums and expansion beyond 256 MiB; identical
normalized duplicate entries in the pinned Rollup archive are accepted.

This replaces the proposed npm 12 toolchain update: its `@npmcli/agent@5.0.2`
and `proxy-agent-negotiate@1.1.0` lacked original grants in their archives and
corresponding official source revisions. No npm 12 code is adopted or executed.
The container build and runtime therefore do not depend on either npm version.
The host's package manager is outside the source distribution.
