# Changelog

[日本語版はこちら](./CHANGELOG_JA.md)

User-facing changes to SME Portal Hub are documented below by release.

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
