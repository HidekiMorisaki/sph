# Third-party licenses

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
These notices accompany the API, frontend, migration and blitz.cloud images.

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

A source tag is not approval to redistribute every locally built image. Original
license texts remain unconfirmed for the toolchain candidates listed in that
supplemental manifest, including @prisma/dev. A Dockerfile or lockfile reference
is distinct from copying those packages into a distributed archive. Before
publishing migration/development/cloud images or an archive containing installed
dependencies, resolve those candidates and the historical embedded-bundle review.
Do not replace missing original grants with SPDX labels or guessed copyright text.
