# PostgreSQL runtime security rebuild

PostgreSQL remains 16.15 on the digest-pinned Alpine 3.24 image. No schema or
migration changes are made. gosu 1.19 is rebuilt from the original source using
Go 1.26.10, with unchanged moby/sys/user 0.1.0 and x/sys 0.1.0 dependencies.
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

Image redistribution remains outside the source-only release scope.
