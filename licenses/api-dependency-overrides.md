# API dependency override licenses

The API lockfile pins the following packages through npm overrides. Verify the resolved versions whenever the lockfile changes.

| Package | Registry source | Included license | Redistribution obligation |
| --- | --- | --- | --- |
| `fast-uri@3.1.9` | [npm tarball](https://registry.npmjs.org/fast-uri/-/fast-uri-3.1.9.tgz) | `package/LICENSE`, BSD 3-Clause, Gary Court and the Fastify team | Retain the complete original notice and disclaimer; do not imply contributor endorsement. No runtime dependencies. |
| `deepmerge-ts@8.0.2` | [npm tarball](https://registry.npmjs.org/deepmerge-ts/-/deepmerge-ts-8.0.2.tgz) | `package/LICENSE`, BSD 3-Clause, © 2021 Rebecca Stevens | Retain the copyright notice, license conditions and disclaimer in source and binary distributions. Do not use contributor names for endorsement without permission. |
| `mysql2@3.24.6` | [npm tarball](https://registry.npmjs.org/mysql2/-/mysql2-3.24.6.tgz) | `package/License`, MIT, © 2016 Andrey Sidorov and contributors; `package/typings/mysql/LICENSE.txt`, ISC, © 2016 Felix Frederick Becker | Include the copyright and permission notice in copies or substantial portions. |
| `sql-escaper@1.5.2` | [npm tarball](https://registry.npmjs.org/sql-escaper/-/sql-escaper-1.5.2.tgz) | `package/LICENSE`, MIT, © 2026 Weslley Araújo, Andrey Sidorov, Douglas Wilson, and contributors | Include the copyright and permission notice in copies or substantial portions. |

The API production image installs exact reviewed lockfile entries with
`node /vendor/npm/install.mjs --omit=dev --omit=optional`. The Docker toolchain
uses the committed extractor and Node task runner described in
[`vendor/npm/README.md`](../vendor/npm/README.md); npm, Corepack and Yarn are
removed from the images. Local source development uses the separate preparation
and npm instructions in that document.
An image-build assertion rejects Prisma CLI and @prisma/dev in that runtime;
the independent migration/build toolchain remains a separate license-review
boundary. Keep original licenses with any installed packages and review formats
that extract or bundle code separately. `sql-escaper` and `fast-uri` have no runtime
dependencies. Excluding optional peers does not approve redistribution of the
migration/build image or resolve the historical license residuals.

The mysql2 3.24.6 archive integrity and both original license texts are retained in
[`api/licenses/dependency-mysql2.txt`](../api/licenses/dependency-mysql2.txt),
which is also copied into the API and migration images.

The fast-uri 3.1.9 original notice, exact archive integrity and upstream revision
are retained in `api/licenses/dependency-fast-uri.txt` and copied into API and
migration images. The override fixes GHSA-w74x-v6f9-j3xg without changing major
versions or introducing further runtime dependencies.
