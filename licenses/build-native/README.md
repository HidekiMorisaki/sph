# Native build-tool originals

Vite 8.3.8 uses its officially supported PostCSS transformer and esbuild CSS
minifier in SPH. Its generated package removes the unused Lightning CSS dependency
before resolution or installation; executable Vite source bytes are unchanged
and checked against the exact npm archive. CSS minification and source-map
capabilities remain available. This is a modified Vite package, not an upstream
unmodified package. Its own original LICENSE.md is retained in that package.

Lightning CSS and its unverified parcel_sourcemap/seahash/serde-detach subtree
are not installed. No missing copyright or grant is invented. The unused
CommonJS plugin from adapter-node 5 is no longer installed either.

The exact Rolldown 1.2.19 native-library Cargo lock was reviewed, including nested
original notice files. ROLLED-RUST-NOTICES.txt retains those originals; the
manifest records crate archive checksums and notice hashes. The collection is
overinclusive (including licensed development/platform dependencies), not a
claim that every crate is linked or shipped in every binary. Normal supported
execution is Linux Docker plus the verified Windows Node development tools.
macOS-native Node tooling is not qualified: its Apple SDK-derived objc2 framework
bindings need separate license verification before introduction. Docker on macOS
still builds/runs Linux images and does not install macOS native Node bindings.

The remaining missing-file cases were resolved before adoption: exact-version
async-scoped/typedmap README and siphasher COPYING explicitly offer Apache 2.0
and link its full official text, retained alongside those original declarations.
The base-encode author explicitly applies the immutable original notice to 0.3.1
in the linked owner response recorded in the manifest. UEFI-only r-efi and
dev-only testing_macros do not enter the supported native binaries.

Dual-license choices use a permissive option (Apache 2.0, MIT, CC0 or zlib as
applicable); GPL/LGPL alternatives are not selected. Original Unicode, BSD,
Boost and other additional conditions remain in their complete notices. Colored
is unmodified MPL 2.0 code: its exact complete source is available at the archive
URLs and checksums in manifest.json. The notices, including all author and
copyright statements, are retained verbatim. No native Rust source is modified.
The exact Rust 1.99.0 library copyright report from the checksum-verified official
binary distribution retains standard-library and embedded component notices.
Its LLVM/Unicode/platform-specific conditions are not replaced by a root label.

esbuild 0.28.2 was already selected by the previous Vite lock; it is now explicit
for Vite's supported CSS-minifier option. Original esbuild MIT, old x/sys BSD and
patent notices and Go 1.26.5 license/patent originals are retained. It runs only as
a build tool and does not serve application HTTP traffic. The runtime Go 1.26.11
requirement applies to Caddy/gosu; version-only scanner findings for a compiler
must be assessed against the actual used functionality, not hidden.

Only Git source is distributed. Installed native binaries, node_modules and build
images are not published. Keep these originals/source records when rebuilding;
image publication or additional native platforms need a separate distribution
review. See ../README.md for the source-distribution boundary.
