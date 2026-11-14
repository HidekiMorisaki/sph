# PostgreSQL runtime security rebuild

PostgreSQL remains 16.16 on the digest-pinned Alpine 3.24 image. No schema or
migration changes are made. gosu 1.19 is rebuilt from the original source using
Go 1.26.11. SPH changes only its module selection to moby/sys/user 0.4.1,
which bounds passwd/group parsing; x/sys remains 0.1.0. The exact go.mod/go.sum
are retained under `gosu/`. No gosu or module executable source is modified.
Their Apache 2.0/BSD/patent originals and Go's license/patent originals are
retained in `gosu-1.19.txt`. The build checks module integrity and verifies the
version and privilege change to nobody. The original database entry point is
preserved.

libxml2 retains ABI 2.13.9 and Alpine's legacy/zlib/lzma options. The build keeps
Alpine's CVE-2026-6732 parser fix and applies official commit
`d1686f91dbda141a752200419d35639fd6b38340` for CVE-2026-86140. Both patched C
source hashes are checked before compilation. Only the rebuilt shared library
is copied into the database image. Source URLs/archive and patch digests are in
`security-rebuild-sources.json`; original MIT text and dict.c/list.c exceptions
are in `libxml2-2.13.9.txt`. The committed patches mark the source modification;
no source grant or copyright has been replaced with an SPDX label.

The original libxml2 package version remains visible to package scanners.
Docker Scout 1.27.0 also retains an old-base gosu/Go record at the same file path
alongside the replacement binary. Runtime verification must compare the actual
binary hashes and Go version with the specific image digest. Do not suppress
unrelated findings. The XML boundary harness must pass the patched source and
fail against the original source; PostgreSQL XML/xpath and a complete private
backup restore must pass before normal-local container recreation.

The additional runtime originals and exact source hashes are recorded in
`runtime-manifest.json`. zlib is 1.4, krb5-libs 1.22.3 and libxslt 1.1.43-r4.
The full common review and redistribution boundary are in
`../../licenses/runtime/README.md`. No unavailable OpenSSL update is claimed.
