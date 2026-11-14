# Third-party licenses

## License exclusions and reviewed dependency changes

The four historical missing-grant candidates are excluded before installation,
including copies embedded in compiler/checker bundles. See
[`vendor/npm/README.md`](../vendor/npm/README.md) for compatible SPH helpers,
modified source hashes, preserved originals and the independent PostgreSQL CLI.
This resolves the adopted-code residuals by exclusion; no upstream grant has
been invented or inferred. Docker uses the fixed-lock extractor and Node task
runner described there, so no npm 12 candidate or npm runtime is introduced.
The source-only distribution boundary remains in force.


SvelteKit 3.2.0 supersedes the former Kit 2 backport with its original upstream
escaped cache-policy implementation. Its exact source is checked. The retained
SPH deepmerge 4.3.1 backport preserves its original MIT notice and records every
original/modified file hash in each
project's `licenses/security-patches.json`. The complete changes and original
notices are in `licenses/dependency-security-patches.txt` (also served by the
frontend under `/licenses/`). Preparation applies only the reviewed changes;
build/check rejects unpatched or unknown code. Version-based npm audit warnings
remain visible. These checks do not approve unrelated license residuals.

The Vite 8/Rolldown/esbuild build composition, exact native source notices,
standard-library originals and supported platform boundaries are documented in
[`build-native/README.md`](build-native/README.md).

Projects Markdown uses the explicitly approved `marked@18.1.2` parser in frontend
and API. Its complete official LICENSE includes both the Marked MIT grant and
the inherited John Gruber Markdown redistribution conditions. Original texts are
retained in each project's `licenses/marked-18.1.2.txt`, with a browser copy under
`frontend/static/licenses/`; `marked-18.1.2.json` records the official source and digest.
Build/check gates verify the pinned version and all original notice copies.

Code highlighting uses the separately approved code-only Highlight.js 11.12.0
subset in `frontend/vendor/highlightjs-11.12.0/`. Its manifest records the official
archive/integrity and each original/output file digest. The only runtime change
replaces the core CommonJS export with an ES-module export; all other core bytes
and all 193 language definitions are preserved. Original BSD-3-Clause notices are
retained in the subset and at `/licenses/highlightjs-11.12.0.txt`, linked from main
and Worker chunks. SPH provides its own colors; upstream themes/base16 resources
and external language plugins are excluded. This approval does not introduce
Shiki, Mermaid, PlantUML, Java, fonts, or their unreviewed embedded materials.

Projects attachment inspection uses the explicitly approved API dependency
`fflate@0.8.3`, already used by the frontend. Its official MIT text, copyright,
source URL and digest are retained in [`fflate-0.8.3/`](./fflate-0.8.3/).
It has no runtime package dependencies, but attributes embedded algorithms to
UZIP.js. Photopea's original 2018 MIT grant is pinned to its original license
commit and retained in both API image licenses and browser static licenses;
the provenance records its digest. The installed package retains its own LICENSE.
Both production builds verify these additional notices. This addition does not resolve the
unrelated historical license residuals described below.

Keep each third-party component's applicable license text, copyright notices,
NOTICE files, and any required source-availability information with its distributed
copy. A package's SPDX identifier alone is not a replacement for those notices.

The PDF font's existing files are kept together under
[`frontend/static/fonts/`](../frontend/static/fonts/), including `OFL.txt` and the
source/transformation description. This directory is reserved for consolidated
notices accompanying distributed artifacts. Browser chunks point to the original
module texts in `frontend/static/licenses/THIRD_PARTY_NOTICES.txt`.

The reviewed PDF subset is in `frontend/vendor/jspdf/`: only selected official
4.2.1 sources are retained. Encryption and its unlicensed MD5 implementation,
RC4, HTML/SVG/image converters and the upstream color/download adapters are not
distributed. SPH supplies independent local adapters. All selected original
comments, Adobe font-metric terms and modification notices are retained, with a
browser copy at `frontend/static/licenses/jspdf-SPH-NOTICES.txt`. Source hashes
and the pinned archive are recorded in the vendor manifest; the product build
checks these records. The npm jsPDF distribution is no longer installed in any
image. Noto Sans JP and its OFL/source records remain unchanged.

`scripts/build-third-party-notices.mjs` collects original installed package
notices into the frontend static files and API image notices. Its manifests
also identify packages without a root notice, which require the separately
retained parent/embedded/supplemental notices. This inventory is not a claim
that a root package license alone covers every embedded material. Historical
audit findings and the withheld svelte-check update must not be treated as
resolved merely because a notice collector succeeds.

The frontend's Node.js development type definitions are pinned to `@types/node`
22.20.5, with `undici-types` 6.21.0. Their original MIT license texts, copyright
notices, registry sources, and package integrity values are retained under
[`node-types/`](node-types/). They are development dependencies; production
dependency installation excludes them.

The public holiday data sources and usage are recorded in
[`holiday-data.md`](holiday-data.md).

The sidebar's `trending_up` SVG path comes from the Gentelella design sample
(`production/icons.html`). Its MIT license and copyright notice are included in
the distributed frontend at
[`frontend/static/licenses/gentelella-MIT.txt`](../frontend/static/licenses/gentelella-MIT.txt).

The API dependency override sources, exact versions, and redistribution conditions
are recorded in [`api-dependency-overrides.md`](api-dependency-overrides.md).

The gateway's pinned Caddy runtime, Go modules, and CA certificate notices are
recorded in [`caddy/`](caddy/README.md).

The Prisma 7.10.1 update, its changed transitive packages, exact registry sources,
integrities and original Apache 2.0 license are recorded in
[`api/licenses/prisma-7.10.1.txt`](../api/licenses/prisma-7.10.1.txt). The API and
migration images retain these notices alongside the installed packages.

The source-map-js 1.2.2 BSD notice and official archive source are retained in
[`api/licenses/source-map-js-1.2.2.txt`](../api/licenses/source-map-js-1.2.2.txt)
and [`frontend/licenses/source-map-js-1.2.2.txt`](../frontend/licenses/source-map-js-1.2.2.txt).
These notices accompany the API, frontend and migration images.

The sveltekit update notices and exact archive sources for frontend are retained in
[`frontend/licenses/dependency-sveltekit.txt`](../frontend/licenses/dependency-sveltekit.txt) and included in its images.

The svelte update notices and exact archive sources for api are retained in
[`api/licenses/dependency-svelte.txt`](../api/licenses/dependency-svelte.txt) and included in its images.

The svelte update notices and exact archive sources for frontend are retained in
[`frontend/licenses/dependency-svelte.txt`](../frontend/licenses/dependency-svelte.txt) and included in its images.

The postcss update notices and exact archive sources for api are retained in
[`api/licenses/dependency-postcss.txt`](../api/licenses/dependency-postcss.txt) and included in its images.

The postcss update notices and exact archive sources for frontend are retained in
[`frontend/licenses/dependency-postcss.txt`](../frontend/licenses/dependency-postcss.txt) and included in its images.

The Alpine zlib security rebuild's upstream license, source and patch are retained
in `api/licenses/zlib-1.3.2-r1.txt`, `frontend/licenses/zlib-1.3.2-r1.txt`, and
`db/licenses/zlib-1.3.2-r1.txt`, with copies inside the distributed images.
The Dockerfiles require at least the fixed Alpine revision; later compatible
security revisions are allowed by that minimum.

The vite-compatible update notices and exact archive sources for frontend are retained in
[`frontend/licenses/dependency-vite-compatible.txt`](../frontend/licenses/dependency-vite-compatible.txt) and included in its images.

The esbuild update notices and exact archive sources for frontend are retained in
[`frontend/licenses/dependency-esbuild.txt`](../frontend/licenses/dependency-esbuild.txt) and included in its images.

The esbuild update notices and exact archive sources for api are retained in
[`api/licenses/dependency-esbuild.txt`](../api/licenses/dependency-esbuild.txt) and included in its images.

The pg update notices and exact archive sources for api are retained in
[`api/licenses/dependency-pg.txt`](../api/licenses/dependency-pg.txt) and included in its images.

The mysql2 update notices and exact archive sources for api are retained in
[`api/licenses/dependency-mysql2.txt`](../api/licenses/dependency-mysql2.txt) and included in its images.

## v0.6.0 source release

The 2026-10-23 release distributes the Git source tree only. It does not distribute
node_modules, generated application builds, development caches, or built Docker
images. `node scripts/verify-source-distribution.mjs` checks that boundary and
the committed PDF, scanner and font notices/hashes before tagging the release.
Original package grants embedded in README files and TypeScript's
ThirdPartyNoticeText are retained by the notice collector. Supplemental original
texts at the published version's gitHead are recorded in
`npm-supplemental-manifest.json`, with copies in the API licenses and frontend
static licenses. Keep these originals with their corresponding components.

Original license texts remain unconfirmed for the historical candidates listed
in the supplemental manifest, including @prisma/dev; current prepared sources
exclude them. Source distribution retains the reviewed preparation code, original
notices and exclusion records. Do not replace missing original grants with SPDX
labels or guessed copyright text.

The scheduler uses the pinned FullCalendar Standard 6.1.22 plugins (no premium plugins), Luxon 3.7.2, rrule 2.8.1 and their reviewed dependencies. Exact archive sources, integrities and original notices, including python-dateutil and the embedded Closure modulo attribution, are in `api/licenses/scheduler.txt`, `frontend/licenses/scheduler.txt` and the browser copy `frontend/static/licenses/scheduler.txt`. Preserve all of these with corresponding builds.

The v0.8.0 runtime security update originals and exact sources are recorded in
[`runtime/`](runtime/README.md), including Node embedded-component notices,
PostgreSQL, Go, zlib and the changed Alpine runtime components.
