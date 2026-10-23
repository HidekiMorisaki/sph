# SPH PDF subset

Derived from official jsPDF 4.2.1. See `source-manifest.json` for immutable input
and file hashes, `LICENSE` for the upstream MIT terms, and
`../../static/licenses/jspdf-SPH-NOTICES.txt` for retained component notices.
Original selected files retain their comments. Changes to core and declarations
are marked in those files. No encryption, MD5/RC4, HTML/SVG/image conversion,
external font loading, or AcroForm implementation is included.

Reproduce with `python development/tools/build-pdf-vendor.py <official-archive>`
from the parent workspace. The generator refuses an unreviewed archive hash.
Ordinary installations use these committed sources and require no Python.
