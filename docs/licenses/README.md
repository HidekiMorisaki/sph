# Image processing dependencies

The API uses `pngjs` version 7.0.0 to decode and re-encode cropped PNG avatars.
The installed package has no runtime dependencies. Its MIT license and copyright
notice are preserved in [pngjs-7.0.0-LICENSE](pngjs-7.0.0-LICENSE).

Source: https://github.com/pngjs/pngjs/tree/v7.0.0
Package: https://www.npmjs.com/package/pngjs/v/7.0.0

Recheck the package license, included materials, and notices when updating it or
changing the distributed image.

## JPEG decoding

The API uses `jpeg-js` 0.4.4 to convert openBD JPEG covers to PNG, preserving
decoded pixels and dimensions. This package has no runtime dependencies.
The package's BSD license is in [jpeg-js-0.4.4-LICENSE](jpeg-js-0.4.4-LICENSE).
Its bundled decoder is copyright 2011 notmasteryet, under Apache 2.0; the
bundled encoder is copyright 2008 Adobe Systems Incorporated and ported by
Andreas Ritter (2009), under the BSD terms reproduced in
[the upstream README](jpeg-js-0.4.4-README.md).
The full [Apache 2.0 license](Apache-2.0-LICENSE) is also included.
All of these files are copied into the API image. Original headers in
`node_modules/jpeg-js` remain intact; this dependency is not modified.

Reviewed package: https://registry.npmjs.org/jpeg-js/-/jpeg-js-0.4.4.tgz
Official source: https://github.com/jpeg-js/jpeg-js/tree/v0.4.4
The package LICENSE, README, decoder/encoder headers and manifest were reviewed
on 2026-10-14. Do not use the contributors' names to endorse SPH.

## openBD bibliographic service

openBD is a remote data service, not an embedded software dependency.
Its usage conditions and operator responsibilities are documented in
[openBD usage](../OpenBD_Usage.md). Covers are cached as PNGs inside SPH;
they are not included in the software distribution.
