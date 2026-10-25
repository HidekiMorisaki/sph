# Tax-inclusive purchase amounts

New and edited IT assets, book copies and software contracts require a purchase
amount and currency. Zero is an explicit free transfer; missing data is not zero.
The UI offers the existing JPY/USD currencies. Decimal amounts have up to 14 whole
digits and two fractional digits; decimal JSON values must be strings to avoid
binary floating-point rounding. Safe integer JSON values, including 0, are also
accepted. Negative, exponent, missing, null and excessive-precision values fail
with 422 and field-level details. Currency is an uppercase three-letter code,
matching the existing contract API; existing currency values are retained.

## Storage and REST

Consolidated migration m0035 adds nullable `purchase_amount NUMERIC(16,2)` and
`purchase_currency VARCHAR(3)` to `it_assets` and `book_copies`. Paired-value and
nonnegative checks protect stored values. Existing unknown prices remain NULL.
The API requires both fields on registration and editor saves; legacy records
remain readable, assignable and returnable without inventing a purchase price.

- IT asset POST/PATCH use `purchaseAmount` and `purchaseCurrency`; GET and change
  history return those values. Amounts apply to one asset.
- Book-copy POST includes those fields in each `copies[]` row; PATCH requires
  both fields. GET/list/title-copy data includes the prices. Batch validation and
  transactions reject the entire batch if a row is invalid. The idempotency hash
  includes money, so a key cannot silently reuse a different price.
- Software-contract `amount`/`currency` retain their names and stored numbers.
  By operator decision, existing values now mean the tax-inclusive total for the
  contract, not a per-license price. Blank legacy amounts show “Not registered”;
  saving requires an explicit amount and currency.

Existing read/write operations and branch checks apply. The fields are additional
resource data; this change does not grant new roles or alter financial reporting,
list columns, currency conversion or tax calculations. UI defaults are blank.
Common book-copy inputs can be applied to every row and overridden per copy.
The bulk button explicitly says it applies purchase amount and currency to all
copies and occupies its own full row. The registered-book selector also occupies
a full row. Reference-price explanations and purchase-order linking help open
from label information icons using the shared InfoPopover. They are outside the
form flow, so changing loading/reference text does not resize the modal. Popovers
support click, keyboard activation, Escape, a close button and outside dismissal.

## Book price assistance

`GET /v1/book-titles/{id}/purchase-price` requires `books.read` and returns
`{amount,currency,sourceUrl}` in the standard envelope. Missing ISBN/price yields
NULL values; unavailable service yields 503 and rate limiting yields 429. A
per-employee limit of 10 priced-ISBN requests per minute and a bounded map apply.
Lookup uses the existing fixed-host, bounded, five-minute-cache openBD service.

Unqualified, undated ONIX PriceType 02/04 values (tax included) in JPY/USD are
eligible. For a domestic ISBN (9784 prefix), JPY PriceType 01/03 values may also
provide a reference estimate: source price times 1.10, rounded down to whole yen.
This is the current standard-rate estimate, not a historical tax calculation or
the actual purchase price. The form displays the source amount, 10% rate, result
and rounding rule, including in copy editors. USD/foreign-ISBN exclusive prices
and unclassified prices are not converted. Missing or rejected prices leave
mandatory manual inputs available. Prefer JPY and explicit inclusive prices
within the currency; reject conflicting preferred prices and overflow. Integer
arithmetic prevents floating-point rounding errors. Conflicting source prices
remain ambiguous even if rounding would produce the same result.

Converted REST prices additionally return `basis: "tax_exclusive_estimate"`,
`sourceAmount`, `taxRate: "10"` and `rounding: "floor"`. These describe transient
reference data and do not change the stored purchase amount schema. Source
metadata remains unchanged. No new dependency or external provider is introduced.

Rate and reference-price sources reviewed on 2026-10-24:
- https://www.mof.go.jp/tax_information/qanda023.html (standard 10%, limited reduced-rate categories)
- https://www.mof.go.jp/tax_policy/summary/consumption/a_001.htm (retail rounding is operator-defined)
- https://api.openbd.jp/v1/get?isbn=9784873115658 (actual exclusive JPY 2400; reference estimate 2640)

Opening a book-copy registration or an unpriced copy editor requests the price.
Only untouched, empty fields are filled. For the same selected book, manual values,
including 0, and existing stored amounts are never replaced. Explicitly selecting
a different book in copy registration clears the common and per-copy amount and
currency fields, resets their manual-edit flags and clears the order association;
the new book's price is then loaded. Quantity, storage and other copy draft fields
are retained. Missing prices leave the new book's money fields empty. New rows
inherit the current common values; manual per-row changes are retained within the
selected book. Closing/changing the title aborts stale requests, and responses are
also checked against the current modal and title before application.
The provider price is an initial suggestion, independent of the actual
amount confirmed by the operator, and its source is linked in the form.
