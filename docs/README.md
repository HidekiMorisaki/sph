# Product documentation

These English guides describe the implementation in the current source checkout.
The release version is recorded in the product-root `VERSION`; a development
branch name does not by itself mean a new release has shipped.

## Features and behavior

| Area | Guide |
| --- | --- |
| Projects, tickets, Markdown, panels, Gantt and permissions | [Projects](Projects.md) |
| Schedules, notifications and room reservations | [Scheduling](Scheduling.md) |
| Forms, template versions and sequential approvals | [Workflows](Workflows.md) |
| Employee skills, clients and engagement participation | [Workforce management](Workforce_Management.md) |
| Teams and their internal identifiers | [Team management](Team_Management.md) |
| Search, saved filters and field coverage | [Advanced search](Advanced_Search.md), [generated coverage](search-field-coverage.json) |
| Authentication and role administration | [Authentication](Authentication.md), [role permissions](Role_Permissions.md) |
| Departure dates, scheduled deletion and asset returns | [Employee departure](Employee_Departure.md) |
| IT asset searches and unassigned asset counts | [IT asset search](IT_Asset_Search.md), [Asset Overview](Asset_Overview.md) |
| Software contracts, assignments, installations and keys | [Software licenses](Software_Licenses.md) |
| Purchase amounts | [Purchase amounts](Purchase_Amounts.md) |
| ISBN camera input and bibliographic providers | [ISBN scanner](ISBN_Scanner.md), [openBD](OpenBD_Usage.md), [NDL source context](Book_Bibliography_Source.md) |
| Address suggestions and provider terms | [Postal address data sources](Postal_Address_Data_Sources.md) |
| My Page widgets and authoring | [Widgets](Widgets.md), [Widget SDK](Widget_SDK.md), [record storage](Widget_Storage.md) |
| Theme tokens and modal sizing | [Themes](Themes.md), [Modal layout](Modal_Layout.md) |
| Docker telemetry | [System monitoring](System_Monitoring.md) |
| Backups, updates and restoration | [Maintenance guide](Backup_Update_and_Restore.md) |

## Copy controls

Code blocks, email addresses, account invitation links and revealed asset passwords
use the same overlapping-pages copy icon. Each control has a localized accessible
name and hover tooltip; compact layouts provide at least a 44px target. Keyboard
activation, existing permission/reauthentication requirements and success/failure
feedback are retained. Code copies contain only the code body, without the language
or optional title. Calculator result-click copying is unchanged.

## Scope and maintained data

Future features are identified explicitly. [API key design](API_Keys_Design.md)
is deferred design, not an enabled authentication method. The Projects roadmap
is distinct from its implemented scope. Workflow advance/expense templates are
generic editable forms, not an implemented payment/settlement service.

Markdown prose uses English. JSON examples and generated search coverage retain
localized data, including `ja` labels, because those values describe the bilingual
runtime contract. Gallery images likewise show their named locale. Third-party
license texts and notices in [licenses](licenses/README.md) remain original.

`Backup_Update_and_Restore_JA.md` is retained as a link to the canonical English
maintenance guide, so existing references continue to work. Product-root
`README_JA.md` and `CHANGELOG_JA.md` remain the Japanese entry points.

Historical plans, investigations and verification results live in the separate
development workspace. Their past versions, migration numbers and test artifacts
must not be used as current installation instructions. Existing development-only
migration histories need the separately reviewed transitions described in the
maintenance and Projects guides.
