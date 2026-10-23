# Gateway runtime license record

The gateway builds the unchanged official Caddy v2.11.7 `cmd/caddy/main.go`
entry point with Go 1.26.10 and the existing 147 runtime modules. Only x/net
changes from v0.59.0 to v0.60.0. `gateway/go.mod` and `gateway/go.sum` retain
exact selections and source checksums; the static build keeps the upstream
`nobadger,nomysql,nopgx` tags and `time/tzdata` import. The Go builder image is
pinned by digest, and automatic toolchain replacement is disabled.

The CA certificate bundle still comes from the exact official Alpine image
pinned in `gateway/Dockerfile`. Alpine utilities and shared libraries are not
copied into the scratch runtime. The final image includes this directory
under `/licenses`. Caddy uses Apache License 2.0; Go and x/net retain their
BSD-style license text. The CA data comes from Alpine's
`ca-certificates` 20261020-r0 (MPL-2.0 and MIT).

[`THIRD_PARTY_NOTICES.txt`](THIRD_PARTY_NOTICES.txt) retains the versioned
license and notice text taken from the exact Go module source archives, Caddy,
Go, and the CA data's stated licenses. [`manifest.json`](manifest.json) records
each component's version, source archive URL, source filename, and SHA-256 of
the original notice file. The original module archives remain available at
those URLs. The CA data's source archive is available at its recorded URL;
its SHA-512 is
`d28eb01751b1a914ffb5d8cb99e662f0a35a95148c21dcf98de1ab3108b54db9714a99472d07715023867f4f76a21f2a79a2bc1c7e9876ce5167fdd865ad2dd7`.
The MPL-2.0 text was obtained from
<https://www.mozilla.org/en-US/MPL/2.0/>. The MIT text was obtained from the
SPDX license text repository. No upstream license or notice text has been
edited; section headings in the bundle identify the source of each text.

When changing the binary, modules, toolchain or pinned image, repeat the runtime inventory, inspect the
actual versioned source archives and license obligations, and regenerate this
record before distributing the new image.
