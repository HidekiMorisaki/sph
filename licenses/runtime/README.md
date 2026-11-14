# Runtime source and license record

The v0.8.0 security baseline pins Node 22.23.5, PostgreSQL 16.16 and Go 1.26.11
on Alpine 3.24. Exact image indexes are pinned in the Dockerfiles. The adjacent
manifest identifies the versioned upstream originals, source archive hashes and
notice hashes reviewed before adoption. Node's complete embedded-component
license text is identical to the 22.23.4 text; package managers remain excluded.
Go's BSD notice and patent grant are unchanged and retained verbatim.

Alpine changes reviewed for this update include apk-tools/libapk 3.0.9 (GPLv2),
zlib 1.4 (zlib license), krb5-libs 1.22.3 (complete upstream notices, including
embedded licenses), libxslt 1.1.43-r4 (original libxslt/libexslt X11 grants) and
tzdata 2026f (public-domain data). Alpine-release 3.24.4 changes the version
metadata; the virtual .postgresql-rundeps package contains no software payload.
Alpine's source packaging and security patch provenance are available from
https://gitlab.alpinelinux.org/alpine/aports/-/tree/3.24-stable/main/ .
The krb5/libxslt source archives match the official packaging SHA-512 values.

The Kerberos notices include the RSA Data Security, Inc. MD4 Message Digest
Algorithm and RSA Data Security, Inc. MD5 Message-Digest Algorithm attribution;
the complete original texts are retained. Kerberos is a trademark of MIT and is
mentioned here solely to identify the upstream component. This product includes
software developed by the University of California, Berkeley and its contributors.
This product includes software developed by the NetBSD Foundation, Inc. and its
contributors. No upstream name is used to endorse this product.

No upstream documentation is incorporated beyond applicable legal notices.
The source-only distribution boundary remains unchanged: build images, installed
OS packages and generated executables are not published. The original licenses
and source URLs remain available for local builds. Publishing images would need
a separate full distribution review, including copyleft corresponding-source
requirements; this record does not authorize image publication.

OpenSSL remains the available Alpine 3.5.9-r0 baseline. The November 10 upstream
advisory schedules fixed releases for December 1; no unavailable 3.5.10 or
3.5.9-r1 package is claimed. Record remaining findings in the final diagnosis.
