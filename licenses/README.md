# Third-party licenses

Keep each third-party component's applicable license text, copyright notices,
NOTICE files, and any required source-availability information with its distributed
copy. A package's SPDX identifier alone is not a replacement for those notices.

The PDF font's existing files are kept together under
[`frontend/static/fonts/`](../frontend/static/fonts/), including `OFL.txt` and the
source/transformation description. This directory is reserved for consolidated
notices accompanying distributed artifacts; it is not a completed notice bundle.

The repository reorganization does not resolve the outstanding license audit
findings, including jsPDF's embedded materials, missing upstream license texts,
and obligations for bundled code or images. Do not treat this layout or the
presence of this document as a statement of complete license compliance.

The frontend's Node.js development type definitions are pinned to `@types/node`
22.20.5, with `undici-types` 6.21.0. Their original MIT license texts, copyright
notices, registry sources, and package integrity values are retained under
[`node-types/`](node-types/). They are development dependencies; production
dependency installation excludes them.
