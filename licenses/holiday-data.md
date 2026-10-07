# Holiday data sources

The application fetches holiday dates and names at runtime, including when
optional installer samples are selected. No source calendar,
third-party parser, image, font, or logo is bundled for this feature.

| Country | Source | URL | Stored fields |
| --- | --- | --- | --- |
| Japan | Cabinet Office public holiday CSV | https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv | Date and holiday name |
| United States | U.S. Office of Personnel Management federal holiday iCalendar | https://www.opm.gov/policy-data-oversight/pay-leave/federal-holidays/holidays.ics | Date and holiday name |

The Japanese Cabinet Office applies the Public Data License 1.0 to its site
content unless otherwise stated. The application records the source URL with
each imported date and import event. It selects the calendar year from the
published CSV; the result is an application-generated subset, not an unmodified
Cabinet Office publication. No source file is redistributed with the software.

The U.S. feed is a federal government publication of holiday schedule facts.
Under 17 U.S.C. § 105, works prepared by U.S. government employees as part of
their duties are not protected by U.S. copyright. The application uses only
holiday dates and short names, attributes the source in each imported record,
and does not copy the site's prose, visual design, trademarks, or logos.
OPM's published calendar and its federal holiday schedule were checked on
2026-10-04. The feed currently covers 2021–2030; the supported range may change.

References:

- https://www.cao.go.jp/notice/rule.html
- https://www.digital.go.jp/resources/open_data/public_data_license_v1.0
- https://www.usa.gov/government-copyright
- https://www.opm.gov/policy-data-oversight/pay-leave/federal-holidays/
- https://www.opm.gov/frequently-asked-questions/open-data/general/what-is-open-data/
