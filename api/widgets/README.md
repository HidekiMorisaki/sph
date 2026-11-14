# SPH official widget catalogue (SDK v2)

`catalogue.json` contains the seven official v1.0.1 definitions, including their sandboxed HTML/CSS/JavaScript runtimes. It is distributed under the repository MIT license. Include the root LICENSE when reusing it. It contains no employee data.

Generate the catalogue with `node scripts/build-widget-catalogue.mjs` from the product root. Generate the fresh-install m0046 seed with `node scripts/build-widget-seed.mjs --write`; both tools support `--check`. No v1.0.0 official definitions are bundled.

Companies can publish their own JSON catalogue at a public HTTPS URL and register it in **System settings → Widgets**. See [the authoring and API contract](../../docs/Widgets.md). External definitions require administrator review.
