# ISBN camera scanning

In the book registration form, select **Scan with camera** next to the ISBN.
Allow camera access and show the complete ISBN barcode. On phones, the rear
camera is preferred. When multiple cameras are available, choose one in the
scanner. A checksum-valid 978/979 EAN-13 must be detected twice consecutively
before it is entered. Other EAN codes, including Japanese price codes, are
ignored. Multiple codes in one frame are examined for an ISBN.

A successful scan closes the scanner, stops the camera, fills the ISBN and
starts the existing bibliographic lookup. Review a lookup result before applying
it and saving. Scanning an editable existing book fills the ISBN without running
the registration-only lookup. Imported bibliographic fields remain read-only.

Close, Escape, leaving the page, hiding the browser tab, capture interruption,
or a startup failure stops capture. Closing while permission is pending also
stops a stream that resolves later. Retry is available after recoverable errors.
Video frames are decoded in the browser and are neither uploaded nor saved.
Only the ISBN goes to the existing `/v1/book-lookup` endpoint. No API, DB or
permission model changes are introduced.

## Connection requirements

Camera access requires a secure context and browser permission. A trusted HTTPS
URL works on a PC or smartphone. HTTP localhost/loopback is an exception **on the
device running the browser**: PC `http://localhost:3000` can use its camera, but
a phone visiting `http://192.168.x.x:3000` cannot use live camera capture.
A decoding library does not bypass this browser restriction. A valid HTTPS
setup trusted by the phone is needed for LAN live scanning; configure that
separately for the actual LAN hostname. No certificates, hosts, or gateway TLS
settings are changed by this feature. Manual ISBN entry remains available.

## Browser library and redistribution

Quagga2 **1.12.1** is included as the **unchanged official browser distribution**
in `frontend/static/vendor/quagga2-1.12.1/quagga.min.js`. It is loaded from the
same origin only when scanning starts. The distribution has no CDN dependency
and runs with workers disabled. Node-only optional packages from the npm package
are not included. `package.json` and `package-lock.json` are unchanged.

The reviewed browser source map contains Quagga2, gl-matrix 3.4.4, Lodash
4.17.21, Babel runtime helpers 7.28.4 (including the regenerator attribution),
and webpack 4.44.2 bootstrap. Versions were cross-checked with the official
package and upstream lock at commit `c124025c6c72dc2cdcee0e4af8fb0705711c021a`.
All applicable MIT texts and copyright notices, including the Underscore
attribution in Lodash, accompany the distribution in `LICENSES.txt`. Package
source and SHA-256 are recorded in `source.json`. No fonts, sample photographs,
test images, Node image codecs or other npm dependencies are copied.

These files are served under `/vendor/quagga2-1.12.1/` and included in the
production frontend image through the built static assets. When updating,
review the **actual browser bundle**, source map modules, upstream license
texts, additional notices and redistribution obligations again; the top-level
MIT label alone is insufficient.

Official sources:

- https://registry.npmjs.org/@ericblade/quagga2/-/quagga2-1.12.1.tgz
- https://github.com/ericblade/quagga2/tree/c124025c6c72dc2cdcee0e4af8fb0705711c021a
- https://registry.npmjs.org/gl-matrix/-/gl-matrix-3.4.4.tgz
- https://registry.npmjs.org/lodash/-/lodash-4.17.21.tgz
- https://registry.npmjs.org/@babel/runtime/-/runtime-7.28.4.tgz
- https://registry.npmjs.org/webpack/-/webpack-4.44.2.tgz
- https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia

## Verification

`node development/tools/with-local-database.mjs development/tests/frontend/verify-startup-readiness-docker.mjs --local --isbn-camera --release-history`

The command uses the rebuilt normal product at localhost:3000 and the saved
local credentials. Chromium receives a generated synthetic EAN-13 video through
its virtual camera. Camera permission/capture, frame decoding, ISBN input,
focus, stop/cancel and desktop/phone-sized layouts are exercised. Denied
permission and insecure-context UI paths are explicitly simulated and distinct
from the successful capture checks. It does not create book records. The video
fixture contains no real camera data. This verifies browser integration, not
physical PC camera quality or an actual iPhone; verify those on the target
devices through HTTPS before relying on recognition accuracy.
