# Widget SDK v1

System administrators can edit custom HTML/CSS/JavaScript in Development → Widgets (`/widget-editor`). The page and draft/validation APIs enforce that restriction on the server. No application rebuild is needed. Drafts belong only to their author; saving also requires the corresponding development operation. These rights are separate from ordinary widget use.

## Authoring and distribution

1. Start a new draft or import JSON. Set widget ID/version and edit name, provider, author, sizes and license in Definition.
2. Edit HTML, CSS and JavaScript. Save stores a private draft, including unfinished code. Only one draft exists per author/ID/version; deleted combinations are not reusable, so use a new version.
3. Run starts the preview. Change language, mode and declared size to inspect behavior/errors; Stop ends it. Editing does not execute code automatically.
4. Export JSON creates a validated catalogue for distribution at a public HTTPS URL. An administrator registers that source in System settings, reviews the code/capabilities/license and approves the release.
5. Users add approved widgets to My Page. Change the version for every release change; replacing the same version is rejected. Update catalogue covers official and external widgets, preserves allowed/stopped state, and upgrades compatible placements. Any incompatible placement's settings/storage/capabilities holds back the entire widget. New IDs are registered disabled. See [Widgets](Widgets.md).

JSON import opens the first definition of a multi-widget catalogue. Draft conflicts retain editor content; export JSON or copy code before reloading. Export uses the ID/version currently entered at the top of the editor.

See [the calculator example](examples/widget-calculator-sdk.json). Editable sources for all seven official widgets are in the product-root `api/widgets/official/`. With development dependencies installed, `node scripts/build-widget-catalogue.mjs` builds the catalogue, including TypeScript helper logic in its JavaScript. Recipients do not need TypeScript, Svelte or npm.

## Definition format

Catalogue `schemaVersion` is 2, with up to 100 widgets. Definitions use `schemaVersion: 2`, `view: [{"type":"runtime"}]`, `capabilities: []`, and `settings: {}`. `runtime` contains `sdkVersion: 1` and string `html`, `css`, `javascript` fields. Metadata includes name, provider, license, `sizes` and `sizeLayouts`; author and description are optional. Size IDs use ASCII `rowsxcolumns`. The manifest version 2 and SDK runtime version 1 are distinct.

A definition is bounded to 256 KiB UTF-8; each HTML/CSS/JavaScript string is at most 131,072 UTF-16 units. External catalogues are bounded to 4 MiB. Rendered HTML is limited to 2,000 nodes, depth 40 and 65,536 UTF-16 units. SDK messages are at most 128 KiB UTF-8 and 200 per second; a patch has at most 256 items and up to eight storage requests may be in flight. Each author has at most 100 drafts; draft HTTP bodies are limited to 512 KiB.

## SDK

JavaScript runs in a Worker without a DOM. Neither `document` nor SPH cookies is available. The SDK supplies the `sph` global. External module imports, scripts, CDNs and network requests are unavailable; bundle required logic into the JavaScript.

```js
sph.ready(context => {
  let value = 0;
  sph.ui.on('plus', 'click', () => {
    sph.ui.patch([{ id: 'result', text: String(++value) }]);
  });
});
```

| Call | Behavior |
| --- | --- |
| `sph.ready(async context => {})` | Register one initialization callback |
| `sph.context()` | Get the current context as a Promise |
| `sph.ui.measure(id)` | Get clientWidth/clientHeight/scrollWidth/scrollHeight as a Promise |
| `sph.ui.html(html)` | Replace widget content with allowed HTML |
| `sph.ui.patch([{id, text}])` | Update text without HTML interpretation |
| `sph.ui.patch([{id, value}])` | Update an input/textarea/select string value |
| `sph.ui.patch([{id, attribute, attributeValue}])` | Update an allowed attribute; null removes it |
| `sph.ui.on(id, event, callback, keys?)` | Subscribe to click/input/change/keydown; replace an existing registration for the same ID/event |
| `sph.ui.on('$context','change',callback)` | Receive language/mode/configuration/width context changes |
| `sph.expand(html?)` | Show a full-text snapshot in a shared modal without resetting the original state |
| `sph.records.list(options?)` | List private instance records; default 100, with limit/offset/sortBy/sortOrder |
| `sph.records.get(key)` | Get one record |
| `sph.records.create(key, values)` | Create a record |
| `sph.records.update(key, revision, values)` | Update only on matching revision |
| `sph.records.delete(key, revision)` | Logically delete only on matching revision |

Events contain `id,event,value,checked,key,repeat`. A key array in the fourth keydown argument suppresses browser defaults only for those keys; Ctrl/Meta/Alt combinations are not intercepted. Registering a container also receives its descendants' events.

Context includes `language`, `timeZone`, `theme`, `configuration`, `size`, `width`, `height`, `scale`, `compact`, `expanded` and `preview`, without employee ID/session information. Update only the necessary display when context changes. Preview storage resets on each run and does not write real placements/records.

`compact` includes phone and compact touch-landscape layouts. The host normalizes visible standard text to 16px, labels/help to 14px and times/results to 18px, limiting excess cell-scale enlargement. Expanded content inherits the original card scale.

A `<button data-copy="result">` requests copying the specified element's text through the host only on an actual user click. Clipboard reading is unavailable.

Patchable attributes are `class,disabled,aria-label,aria-pressed,transform,d,checked`. HTML is restricted to ordinary display elements, labels, inputs, buttons, tables and drawing SVG. Scripts, iframes, link navigation, event attributes, external references and SVG foreignObject are rejected. CSS applies only inside the isolated document; CSP blocks external images/fonts/imports.

Colors include `--text`, `--surface`, `--surface-secondary`, `--border`, `--primary`, `--primary-bg`, `--muted` and `--danger`, following host mode changes. Widgets cannot change content/styles outside their iframe.

Theme context also includes `themeId` (currently `default`) and `themeTokens` (allowlisted `--sph-*` values). `theme` continues to mean light/dark mode; previews may choose a different mode from the host. Use fallback values such as `var(--sph-radius-6px,6px)` for color/radius/spacing/font/shadow tokens, including compatibility with older hosts. Non-allowlisted values are not applied to the iframe. See [Themes](Themes.md).

## Configuration and private storage

`configuration` reuses storage field definitions: provide `fields`, `titleField`, `listFields` and `operations`, with every operation false. SPH generates the placement's settings form and passes initial/saved values as `context.configuration`. A string `title` supplements the card name.

`storage` uses the shared record contract in [Widget storage](Widget_Storage.md). Only the placement owner may read its records. Writes/deletion require both definition operations and user operation permissions, within host limits. On conflicts, refetch or retain input and offer retry.

The add dialog can edit fields from `initialRecords`. Existing-placement settings also edit the initial record when there is exactly one. Multi-record widgets provide their list/editor through the SDK.

## Draft REST API and extensions

Private `/v1/employees/me/widget-drafts` supports GET/POST; `/{id}` supports GET/PUT/DELETE. Save bodies are `{widgetCode,version,content:{metadata,html,css,javascript},revision?}`. Updates/deletion require the retrieved revision; deletion is logical. Lists use common sortBy/sortOrder/offset/limit. Every operation checks ownership and permissions on the server.

`POST /v1/widget-validations` validates one definition and requires draft-read permission. Success/failure uses the standard JSON/HTTP contract. The runtime SDK cannot call these arbitrary APIs.

Future business-API/external-service integration requires named SDK operations, declarations, administrator approval and server-side permission/target-scope checks. The current SDK rejects such requests. It cannot ask the parent to fetch arbitrary URLs or pre-authorize unimplemented permissions.

An unresponsive Worker stops after approximately five seconds and offers retry; background-page suspension is excluded. Existing 60-second approval rechecks destroy the runtime of a stopped release. Worker/browser isolation does not guarantee OS CPU/memory quotas. Approval must review source, licenses and bundled notices.
