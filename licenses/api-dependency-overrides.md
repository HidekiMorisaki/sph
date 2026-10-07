# API dependency override licenses

The API lockfile pins the following packages through npm overrides. Verify the resolved versions whenever the lockfile changes.

| Package | Registry source | Included license | Redistribution obligation |
| --- | --- | --- | --- |
| `deepmerge-ts@8.0.2` | [npm tarball](https://registry.npmjs.org/deepmerge-ts/-/deepmerge-ts-8.0.2.tgz) | `package/LICENSE`, BSD 3-Clause, © 2021 Rebecca Stevens | Retain the copyright notice, license conditions and disclaimer in source and binary distributions. Do not use contributor names for endorsement without permission. |
| `mysql2@3.24.5` | [npm tarball](https://registry.npmjs.org/mysql2/-/mysql2-3.24.5.tgz) | `package/License`, MIT, © 2016 Andrey Sidorov and contributors | Include the copyright and permission notice in copies or substantial portions. |
| `sql-escaper@1.5.2` | [npm tarball](https://registry.npmjs.org/sql-escaper/-/sql-escaper-1.5.2.tgz) | `package/LICENSE`, MIT, © 2026 Weslley Araújo, Andrey Sidorov, Douglas Wilson, and contributors | Include the copyright and permission notice in copies or substantial portions. |

The API production image installs its packages with `npm ci --omit=dev`. Each of these packages and its original license file was verified under `/app/node_modules/` in the built image. Keep those license files with the image and review any future distribution format that extracts or bundles package code separately. `sql-escaper` has no runtime dependencies; the other packages added no new runtime dependencies beyond it in this lockfile update.
