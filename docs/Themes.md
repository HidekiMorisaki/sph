# Theme foundation

The built-in `default` theme is the only theme currently supplied and preserves the established appearance. There is no personal theme selector, theme database field or theme settings API. Theme identity and light/dark mode are separate concepts.

## Application and extension

- `frontend/src/lib/themes/appearance.ts` validates the allowed theme ID and `light` / `dark`, applying them through `html[data-ui-theme]` / `html[data-theme]`. Unknown values fall back to `default` / `dark`.
- The top-right light/dark toggle retains the browser storage key `theme`. It restores the mode before the initial paint and still works when storage is unavailable. User-specific state is not written to a shared SSR store.
- `default.css` defines the existing semantic variables (`--text`, `--surface`, `--action-primary`, etc.) and additional `--sph-*` tokens. `tokens.json` records their values and consumers; `widget-token-names.json` is the allowlist passed to widget iframes.
- Additional bundled themes would override `:root[data-ui-theme="theme-id"]`, optionally combined with `[data-theme="dark"]`. Registration, types and validation must be updated together. Personal settings do not import arbitrary CSS or external URLs.
- Themes cover colors, radii, shadows, fonts and spacing. They must not change structure, breakpoints, table widths or minimum interaction areas. Preserve user-selected colors that carry data meaning. Review licenses before introducing fonts or other assets.

New UI uses the corresponding semantic variables and `--sph-*` tokens. Dimension tokens preserve the current appearance. Check all consumers when changing a value; introduce a semantic token when a separate meaning is needed.

## Widgets and installation

Iframes receive only defaults and allowlisted host tokens. SDK context retains the existing mode/color variables and adds `themeId` / `themeTokens`. Mode changes update context without recreating the Worker. Official 1.0.1 CSS includes fallbacks for older hosts.

For fresh installations, m0046 seeds exactly seven current official 1.0.1 releases. Initial master setup enables all seven. Old official definitions and their seed/placement migration blocks are not bundled. Existing catalogue updates follow the compatibility and permission-preservation rules in [Widgets](Widgets.md); fresh-install seed generation is not an existing-environment upgrade procedure.

Run `node scripts/build-widget-catalogue.mjs --check` and `node scripts/build-widget-seed.mjs --check` from the product root to check synchronization. Seed generation with `--write` changes only fresh-install SQL and does not connect to a database.
