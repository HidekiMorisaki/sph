# Changelog

[日本語版はこちら](./CHANGELOG_JA.md)

User-facing changes to SME Portal Hub are documented below by release.

## [v0.6.0] - 2026-10-23

### New features

- Added widgets that system administrators can approve for use on My Page. The official catalogue includes World clock, Calculator (Standard), Calculator (Programmer), Notes, Timer, Stopwatch and Unit converter, with size selection, multiple instances and drag reordering.
- Added a widget SDK and code editor for custom HTML, CSS and JavaScript widgets, with private drafts, isolated previews, JSON distribution and administrator approval. All seven official widgets use the same SDK.
- Added Simple search, Advanced search and personal Saved filters to IT assets, including type, branch and unassigned filters and conditions inherited from Asset Overview.
- Added Asset Overview to the Dashboard group, with unassigned IT asset totals by type and branch and links to matching assets, excluding disposed assets.
- Added ISBN barcode scanning with PC and smartphone cameras to fill the ISBN and look up book details during registration.

### Existing feature improvements

- Improved the installer with preflight checks for write access, Docker, disk space and memory, plus guidance and confirmation before continuing when resources may be insufficient. Messages, questions, choices and default values are distinguished by color, and aligned progress bars show both stage and overall percentages.
- Height limits for modal windows now follow the available viewport. Long content uses as much screen height as possible, with vertical scrolling only when content exceeds the available height.
- Unified license, master management, system settings and personal settings pages with tabs that remember and restore each user’s selection.
- Improved smartphone layouts throughout the application.
- The System information page now remembers each user's selected tab in the browser and restores it on the next visit or reload.
- Updated the pinned Prisma transitive dependency mysql2 to 3.24.6.
- Updated the PostgreSQL connection library pg to 8.23.1.
- Updated Prisma CLI, Client, and the PostgreSQL adapter to 7.10.1.
- Role settings now automatically include supporting permissions required by selected operations and make operation permissions and scopes easier to review. Unused operation permissions have also been removed.
- Action buttons for employees, IT assets, books, licenses and settings now reflect the user’s operation permissions, scope and the state of the target data.
- Limited failed sign-in attempts by account and source, shared across API instances and restarts. The sign-in page explains the restriction and shows the remaining wait.
- Restricted changes, deletion and invitation reissue for employees with system management permissions to system administrators. Changes that would leave no active system administrator are also prevented, including scheduled departures, role changes and concurrent operations.
- Unified permission and scope checks for IT asset credential changes, including changes made during asset creation, editing and moves. Failed authorization no longer allows partial changes to be saved.
- Aligned branch administrator permissions for catalogue and inventory viewing, title registration, personal reservations and purchase requests, and management of physical copies and loans within their branch. Purchase management checks both operation scope and branch principal or deputy requirements.
- Fixed IT asset master reordering to check master management operation permissions, allowing authorized business administrators to reorder entries.
- Team deletion now checks membership removal and employee viewing permissions and scopes for every active member. Deletion is rejected for the entire team when any member is outside the permitted scope.

### Bug fixes

- Kept the sign-in form hidden until the API and database are ready, with automatic retry during startup. Local Docker now starts the frontend after API readiness and publishes through the gateway after both are healthy.
- Updated frontend esbuild to 0.28.2 with the Windows development server file access security fix.
- Updated API and frontend Vite to 7.3.7 with development server security fixes.
- Kept Caddy 2.11.7 and rebuilt the gateway with Go 1.26.10, HTTP/2 security fixes and updated CA certificates.
- Applied the Alpine zlib security fix to the Docker environment.
- Updated PostCSS to 8.5.30, including security fixes for CSS processing and its nanoid dependency.
- Updated Svelte to 5.57.2 to address vulnerabilities affecting server-side rendering and related processing.
- Updated SvelteKit to 2.70.3 and its devalue dependency to address frontend security vulnerabilities.
- Updated the SvelteKit cookie dependency to 0.7.2 with stricter cookie field validation.
- Updated source-map-js to 1.2.2 to address denial of service when processing malformed source maps.
- Moved JavaScript and CSS preload hints into HTML to prevent page reload failures on reverse proxies with small response-header limits.
- Fixed the role editor in System settings appearing behind the fixed header.
- Aligned sign-in, sessions, invitations and administrator protection with the Japanese retirement date, stopping access at midnight.
- Prevented caching of protected API responses, including authentication and error responses.
- Rejected IDs outside the database integer range before querying, avoiding internal errors for invalid IDs.


## [v0.5.0] - 2026-10-18

### New features

- Added the Business Management group for managing teams, skills, clients and projects. Employees can belong to multiple teams across departments and branches.
- Added Simple search, Advanced search, and Saved filters to the Employees page. Save frequently used search conditions as a filter, then click its name to run the search again.
- Added provisional license management for software licenses.
- Added a Book management page for introducing books to employees and managing reservations, loans and returns for company-owned books. Employees can also register books and request new or additional copies for their own branch. Branch principals and deputies manage approval and ordering, and requests are completed automatically when linked physical copies are registered.
- Added current CPU and memory measurements with history for the last hour, 24 hours and 7 days, plus current DB filesystem free space and database size, to System information. Display period and refresh interval (1, 5 or 10 minutes) are saved and restored. Only monitoring data refreshes automatically.
- You can now upload a profile picture from Personal settings.

### Existing feature improvements

- In employee forms, personal profile settings, and branch forms, you can now select Japan or the United States and use a postal code to look up and select an address. The lookup uses the [zipcloud API](https://zipcloud.ibsnet.co.jp/doc/api) for Japan and the [Zippopotam.us API](https://zippopotam.us/) for the United States. You can still enter the address manually if lookup is unavailable.
- Branch responsibility and IT asset assignee histories now display current employee names from stored IDs. Names in branch responsibility history open employee details, with return to the original history position.
- Replaced the default Svelte favicon with an SPH favicon. Supports SVG, 16/32/48px ICO, and a 180px PNG for the Apple home screen.
- Added an asset type selector beside search in the IT asset list. Your selection is retained when you navigate between pages.
- Employee names in the IT asset list, details, and change history now open employee details.
- Replaced row action kebab menus on data list pages with edit and delete icons in detail headers. Work calendar actions also appear as icons in the calendar summary.
- Changed some buttons to icons.
- Refreshed the sidebar icons.

### Bug fixes

- Fixed sign-in from a bookmarked page navigating to the home page instead of the bookmarked URL.
- Fixed protected pages briefly appearing for users who are not signed in. Sessions are now verified before rendering, including during page navigation after a session expires or is invalidated.

## [v0.4.0] - 2026-10-11

### New features

- System administrators can now add and delete roles freely. Permissions for newly added roles can be configured freely, except for the System Administrator and Branch Administrator roles.
- Added Branch Administrator as a default role. Its initial permissions allow management of employees, locations, IT assets, financial periods, and more within the assigned branch. The Branch Administrator role's permissions cannot be changed in System settings.
- Added internal HTTP, internal HTTPS, and public domain installation modes.
- You can now choose a display currency in the Localization section of personal Settings.
- Added JPY/USD amount conversion using exchange rates from the [Bank of Japan Time-Series Data Search](https://www.stat-search.boj.or.jp/index_en.html) API.
- Added a business performance analysis page. Entering amounts in Business performance visualizes business performance. You can choose whether to make business performance public or private. The visualization uses STRAC charts.

### Existing feature improvements

- Editable roles now support selecting permissions for individual operations. As part of this change, employees can be assigned only one role each.
- Added a branch selector beside search on the Employees page. You can select multiple branches, and the selection is restored when you return to the page. Branch names are no longer included in text search.
- In the Roles section of System settings, you can now click a role name to view the permissions assigned to that role.
- Improved the Roles section of System settings to show each role's assignment count as a badge.
- In Locations, you can now click the primary or deputy responsible person's name in a branch detail modal to view that employee's details.

### Bug fixes

- Fixed missing input examples in the profile section of the Settings page.
- Fixed an issue where opening an invitation link showed the sign-in page instead of the password setup form.

## [v0.3.0] - 2026-10-07

### New features

- System administrators can now choose operation permissions for each existing role.
- You can now enter Notes when creating or editing records that have a detail view. The entered Notes are available in the detail view.
- Added automatic imports of U.S. federal holidays from the Office of Personnel Management (OPM) when creating or refreshing Work calendars.

### Existing feature improvements

- Added average age to employee analytics. You can view it on the dashboard.
- Operating system vendors now have their own master list. Choose a vendor when registering an OS, and manage vendor names separately from asset manufacturers.
- Improved search in data list pages.
- Optional installer samples now attempt to import the current year's Japanese Cabinet Office and U.S. OPM holidays. If a source is unavailable, the other samples are installed and the installer tells you to refresh the affected Work calendar after signing in.
- Adjusted font sizes throughout the system to make text easier to read for people with age-related vision changes.
- Consolidated master management from 12 pages into 3 pages to make it easier to maintain. You can also change the order of master records by dragging them.
- Added page navigation links above data lists so consecutive page changes no longer require moving the pointer between the top and bottom of the list.
- Moved System information from System settings to its own page.
- Removed Website and Blog from the social links you can add in Settings, and added Threads, Bluesky and Mastodon.
- Standardized the display style of informational, warning, and error messages throughout the system.
- Work calendars were changed to show only calendars assigned to the signed-in user. However, system administrators always see all calendars.
- IT asset employee assignment choices now show names alongside employee codes, making it easier to distinguish employees with the same name.

### Bug fixes

- Fixed date pickers and employee department/position menus being hidden by form modal footers.
- Fixed new installations failing during database initialization when `install.ps1` is run from PowerShell 7.5 or later.
- Fixed the Windows backup, update, and restore scripts failing in Windows PowerShell 5.1.
- Fixed the External links table heading becoming cramped on narrow screens.
- Fixed employee ID changes failing under certain conditions.
- Updated API dependencies to address known high-severity security advisories.
- Fixed the sidebar flickering during page navigation.

## [v0.2.1] - 2026-10-05

- Fixed Japanese holiday names remaining in Japanese when English is selected as the display language.
- Fixed a bug that required HTTPS for some data registration actions even when the system was running on localhost.

## [v0.2.0] - 2026-10-03

- Added guided English/Japanese installers for Windows, macOS and Linux, with optional fictional sample data for evaluation.
- Added English/Japanese display across major pages, shared navigation and master management.
- Added an employee dashboard for headcount, age groups and turnover, with PDF export of summaries and charts.
- Added IT asset network details and encrypted password management, including a Server Administrator role and reauthentication before password display.
- Added options to include retired and deleted employees in lists and CSV exports, with read-only details for deleted employees.
- Improved updates and restores for existing installations with verified backups and encryption key checks.

## [v0.1.0] - 2026-09-30

- Initial development release.
- Product version and release information for administrators.
- Verified full-database backup, guided update, and disaster-recovery tools for Windows, macOS, and Linux.
- Public repository link in System settings.
