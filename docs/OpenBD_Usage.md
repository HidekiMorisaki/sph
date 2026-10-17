# openBD usage

Official sources reviewed on 2026-10-14:

- API and guidelines: https://openbd.jp/ and https://openbd.jp/spec/
- Service terms: https://openbd.jp/terms/
- Publisher consent terms (2024-03-15): https://www.hanmoto.com/permission-for-use/agreement
- Data coverage changes: https://openbd.jp/news/20230829.html

SPH uses the ISBN lookup to introduce books in its employee-facing library catalog.
Only language-specific lists of ISBN identifiers are bundled for optional installer
samples: 11 Japanese titles or 11 English-language titles, selected by the initial
display language. The English list includes information science, operations
research, engineering, botany and history. All 22 selected records had importable
covers when verified on 2026-10-14; future provider availability is not guaranteed.
When samples are selected, the installer retrieves current bibliographic records
and available covers from openBD using the same validation, size, timeout and
conversion rules as the API. It creates title introductions with zero copies,
loans or reservations. Failed lookups are skipped; failed cover imports retain
the title without an image. Warning markers and affected ISBNs are emitted only
after the installation transaction commits. Existing catalogs are not altered.
Books are fetched only during optional initial sample installation, not on a
normal startup, update, or administrator-only install.

The installer generates Node-compatible lookup/image modules from the API
TypeScript sources during npm prepare; npm run check verifies they are current.
Provider metadata and images are not bundled or sold as a dataset. Operators
must use this feature for book introduction in accordance with the service terms.
Some records are derived from NDL data. Coverage and publisher information can
differ from other catalogs, and records or cover URLs may be absent.

Imported title, author, publisher and ISBN fields are preserved as supplied by
openBD. They cannot be edited through SPH; additional local notes remain editable.
Before registration, the server checks the selected values against the provider.
Manual entry begins with blank bibliographic fields and has no openBD attribution.
When a record supplies a cover URL on `https://cover.openbd.jp/` for the same
ISBN, the API downloads it during registration or explicit source refresh.
Only bounded PNG/JPEG responses are accepted; redirects, foreign hosts, credentials,
queries and mismatched ISBN paths are rejected. JPEGs are decoded and encoded as
PNG without cropping, resizing, overlays or other changes to the pictured cover.
This is a format conversion to preserve the book introduction image, rather than
an editorial alteration. The publisher consent terms permit size corrections
that do not impair publisher intent; SPH retains the original dimensions.
The downloaded input is limited to 1 MB and 100–2000 pixels on each dimension;
converted PNGs may use up to 4 MB. Invalid, oversized or unavailable covers are
not imported. Registration still succeeds and offers retry/manual-upload guidance.

One PNG is stored on each bibliographic title. It can also be manually uploaded
and used with zero physical copies. A manual upload replaces the imported cover
and source refresh never overwrites it. The server records the cover origin and
source URL. Display uses only SPH's authenticated REST API and stored PNG data;
the browser never loads the provider's image URL. Book lists omit image bytes.

ISBN lookup also downloads an available cover through the authenticated REST API
for a temporary PNG preview beside the bibliographic candidate. The same URL,
size, format, dimension, timeout and concurrency limits apply. Missing, invalid
or unavailable covers display the local no-cover image; lookup still succeeds.
Preview bytes are not stored in the database or in the bibliographic lookup cache.
The browser never requests an external cover URL, and registration still retrieves
and validates the provider's current cover independently.

The catalog displays openBD attribution, a source URL and retrieval date. The
in-memory lookup cache expires after five minutes. Saved records are snapshots:
operators must keep them current using "Refresh openBD details" in the book detail
view, particularly before introducing a book and after provider corrections.
Source refresh also updates the stored openBD cover, clears it when the provider
no longer supplies one, and preserves it when an image download temporarily fails.
It reports the failure so operators can retry. A withdrawn source record clears
its imported cover and reports unavailability. Manual covers remain unchanged.
SPH does not run a background provider synchronization job.

If a record is withdrawn, refresh reports its unavailability instead of substituting
another provider. On an openBD removal request, operators must promptly stop using
the affected data: cancel active reservations, return outstanding loans, remove
copies and delete the title from the catalog. These are logical deletions and
exclude the records from ordinary access. Historical database data must not be
republished. Follow any additional provider instructions on retained copies.
Review current service and publisher conditions before enabling the feature and
when those conditions change. Do not use it for an incompatible purpose.

## English sample selection sources

Publisher catalogs were used to verify the English-language editions. Provider
metadata and images are fetched from openBD, rather than from publisher sites.

| ISBN | Publisher catalog |
| --- | --- |
| 9784798500119 | https://kup.or.jp/en/booklist/ss/1011.html |
| 9784798500553 | https://kup.or.jp/en/booklist/ss/1055.html |
| 9784798501529 | https://kup.or.jp/en/booklist/ss/1152.html |
| 9784798500560 | https://kup.or.jp/en/booklist/ss/1056.html |
| 9784873789781 | https://kup.or.jp/en/booklist/ss/978.html |
| 9784798500409 | https://kup.or.jp/en/booklist/ns/1040.html |
| 9784798500546 | https://kup.or.jp/en/booklist/ns/1054.html |
| 9784798502069 | https://kup.or.jp/en/booklist/ss/1206.html |
| 9784798501796 | https://kup.or.jp/en/booklist/ss/1179.html |
| 9784798502823 | https://kup.or.jp/en/booklist/ns/1282.html |
| 9784814002146 | https://www.kyoto-up.or.jp/books/9784814002146.html?lang=en |
