# Gateway runtime license record

The gateway image copies only the static Caddy executable and the Mozilla CA
certificate bundle from the official `caddy:2.11.7-alpine` image pinned in
`gateway/Dockerfile`. Alpine utilities and libraries from the source image are
not present in the distributed gateway image. The Caddy binary reports Go
1.26.8 and 147 versioned Go modules. The upstream Caddy license is Apache
License 2.0; the Go standard library uses the BSD-style Go license. The CA
certificate data is derived from the Alpine `ca-certificates` 20260909-r0
source, whose package metadata lists MPL-2.0 and MIT.

[`THIRD_PARTY_NOTICES.txt`](THIRD_PARTY_NOTICES.txt) retains the versioned
license and notice text taken from the exact Go module source archives, Caddy,
Go, and the CA data's stated licenses. [`manifest.json`](manifest.json) records
each component's version, source archive URL, source filename, and SHA-256 of
the original notice file. The original module archives remain available at
those URLs. The CA data's source archive is available at its recorded URL;
its SHA-512 is
`d235529da679f14e2e8df4175bc8189507add1382fe0ef8493824b07a49763a2a3af8201f43d30a0260eb8357a10bb0d7054d9b012abf3b74ecf889551cf0dd7`.
The MPL-2.0 text was obtained from
<https://www.mozilla.org/en-US/MPL/2.0/>. The MIT text was obtained from the
SPDX license text repository. No upstream license or notice text has been
edited; section headings in the bundle identify the source of each text.

When changing the pinned image, repeat the runtime inventory, inspect the
actual versioned source archives and license obligations, and regenerate this
record before distributing the new image.
