# Gateway runtime license record

The gateway builds the official Caddy v2.11.7 entry point with Go 1.26.11.
`gateway/go.mod` and `gateway/go.sum` pin the selected sources. go-jose/v4 is
updated to v4.1.6. Because upstream has no v3 release fixing CVE-2026-116587,
`gateway/patches/go-jose-v3-jwk.go` backports the v4.1.6 private RSA modulus and
prime-size/product checks into v3.0.5. The changed file carries a modification
notice. Its original and modified SHA-256 values, upstream URL and advisory are
in the adjacent JSON record; Docker rejects either unexpected input or output.
The original v3 Apache 2.0 and embedded Go JSON BSD notices remain in the notice
bundle. The added v4.1.6 originals are recorded separately in the manifest.

The build keeps `nobadger,nomysql,nopgx`, `time/tzdata`, pinned Go, and disabled
automatic toolchain upgrades. A version-only scanner still identifies v3.0.5;
that warning is not hidden. The downstream RSA checks are verified against
valid 2048-bit private keys and oversized modulus/prime inputs in both versions.

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

The 2026-11-14 update selects x/net 0.62.0, x/crypto 0.59.0, chi 5.5.0,
compress 1.20.4 and their required x/sync, x/sys, x/term and x/text versions.
All exact-version original/nested notices and patent grants are retained in
`security-updates-2026-11-14.txt`; their archive/notice hashes and sources are in
`manifest.json`. Original baseline notices remain as historical attribution.
The Go standard-library and patent originals are the adjacent 1.26.11 files.
