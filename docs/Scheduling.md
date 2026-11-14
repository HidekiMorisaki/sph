# Scheduling, notifications and meeting-room reservations

General → Schedule manages personal and meeting events. Add event creates a new event. Work calendars provide working-day/holiday background information and remain separate from event editing.

## Calendars and events

Day, week and month views support overlaid or side-by-side calendars. Today returns to the current date. Search employee calendars by name/code, branch and department, and add meeting-room calendars. Colors, ordering, visibility and presentation preferences are saved privately on the server. At most 20 calendars can be selected; vertical side-by-side views page through five calendars at a time. Compact vertical views use a date selector and daily list. Horizontal day/week views adapt cell widths to the available space.

The page settings modal contains Basic settings (week start and overlaid/side-by-side calendars) and Display settings (vertical/horizontal time axis), using non-searchable choices where appropriate. Save applies the selections. `timeAxis` is stored in the existing private preference JSON and defaults to `vertical`; month view stays a calendar grid.

Horizontal mode uses one row per employee or room, with time running left to right regardless of the overlay preference. Day view has time ticks; week view has seven equal date columns with event times on cards and creates all-day drafts from empty cells. Overlapping events occupy separate lanes within their owner's row. All-day events appear on their dates. Day view follows real instants across 23-/25-hour daylight-saving days; week moves preserve local wall time in the display zone. Widths recalculate with viewport and calendar-panel changes. Clicking an event, creating from a free slot or moving an organizer's event opens the shared detail/editor flow; no change is saved before confirmation. End-time resizing uses the direct-save flow below.

The calendar-selection panel toggles from the page menu icon on desktop and its heading accordion on compact screens. Date/event lists remain visible. It initially opens on desktop and collapses on compact screens. Browser key `schedule-calendar-panel:v1:{employeeId}` stores `desktopExpanded` and `mobileExpanded` separately per user/mode. The common compact query also covers touch landscape. Invalid/unavailable storage uses defaults and does not prevent operation; panel toggles do not change server calendar preferences.

Ordinary event details are shared with schedule readers. Private details are visible only to the organizer and current participants; others, including administrators, see only the time and Busy. Adding a calendar never grants editing rights.

Detail dialogs use Basic information, Location/meeting room, Description and Participants cards. Empty optional cards are omitted; the current participant's response appears within Participants. Basic/location fields use two desktop columns and one compact column. End is the visible label; internal intervals still exclude their endpoint. Restricted private details expose only start/end and Busy.

Organizers edit/cancel events; participants answer only for themselves. Dragging the end time saves without opening the editor. Recurring events first ask for this occurrence/all occurrences/cancel, before notification confirmation. With other participants, ask whether to notify them, offering notify/do not notify/cancel. Participant overlap requires explicit continuation; room conflicts and stale revisions reject the change. The dedicated time PATCH revalidates owner, revision, scope, references and availability on the server. It preserves non-time fields for each occurrence, including individually changed titles/participants on all-occurrence changes. Time/participant changes reset affected responses to unanswered; title/description-only edits retain responses. Failed availability checks must not be shown as availability. Save failures retain the draft.

Recurrence supports daily/weekly/monthly/yearly patterns, intervals, weekdays/month days, and count or end date, bounded to one year and 366 occurrences. Organizers can edit one occurrence, this and following occurrences, or the whole series. Series edits choose whether to retain exceptions; availability previews show changed, retained and cancelled counts.

Occurrence keys and sequence positions are immutable. Pattern changes reuse keys at corresponding positions and allocate keys only for new positions; removed occurrences remain cancelled. Following-only changes create definition segments without changing earlier patterns. Individual moves/cancellations remain exceptions.

Create a copy copies the readable occurrence's actual time, text, visibility and participant/room candidates into a single-event draft owned by the current user. It does not inherit recurrence, responses, reservations, notices, read state or original keys. Nothing is created/reserved/notified until saving, when references and availability are checked again.

Forms use the shared DatePicker, SearchSelect, FormInput, FormTextarea and FormCheckbox components for dates, zones/choices, text/numbers/colors, descriptions/reasons and boolean selections respectively. AddButton adds calendars; ModalActionButton confirms dialogs. Escape in a date/choice popup closes only that popup and restores focus without losing drafts. Changing conditions or exception retention after an availability preview requires another check.

## Shared notifications

The menu is 640px wide, with 8px side gaps on narrow screens. Underlined All, Unread, Workflows, Projects and Information tabs show category unread counts. Keywords search after 250ms across all notices for the recipient, not just the loaded 20. Tab counts follow the search; the bell retains the overall unread count. Each card is an internal link with a separate delete action and no per-card read button. A notice becomes read only after its target detail is successfully displayed. Failed navigation/fetches and denied targets leave it unread.

`GET /v1/notifications` accepts `category=all|workflows|projects|information` (default all), `unread=true`, and `search` (200 characters, at most ten whitespace-separated terms, AND substring matching). Searches include localized type text and currently readable ticket/project names and codes, request names and event names. Input is not arbitrary SQL or a wildcard expression. `meta.unreadCount` / `readCount` remain overall counts; `total` is the filtered count. `unreadCounts` gives search-matching, all-page unread counts for `all`, `unread`, `workflows`, `projects` and `information`. Recipient ownership, active records, current read permissions and notification-version checks remain mandatory.

The bell to the left of the theme toggle opens the menu. Clicking it again, clicking outside or Escape closes it; there is no heading close button. Focus starts at the bell on opening and after deleting the last notice, and Escape returns focus there. Opening alone does not mark notices read. The heading provides Delete read notifications and Mark all as read icons, without a duplicate text link. A card's delete button logically deletes only the current user's recipient record, whether read or unread. Bulk deletion includes only notices created and marked read by the list snapshot cutoff; it retains unread notices and those read afterward. Shared events, other recipients and source events are unchanged. Deletion refreshes the first page and counts.

Targets resolve to their current internal event/request/ticket detail and permissions. Schedule notifications open their occurrence without changing saved calendars. Removed/inaccessible targets show an explanation. Read state is separate from attendance. Closing occurrence details removes only the occurrence parameter from the current history URL, preserving other query/hash/history state so reload does not reopen the dialog; selecting the same notice can reopen it.

`notification_events` stores type, version, source, typed target references, timestamp and deduplication key; `notification_recipients` stores per-user read state. No body, HTML or arbitrary URL is stored. Text and links resolve with current permissions at read time. Producers include schedule invitations, important changes, cancellation, responses and administrator reservation release, as well as workflow and Projects events. Occurrence changes and schedule notices commit together; series changes are grouped per recipient. See [Workflows](Workflows.md) and [Projects](Projects.md) for their target behavior.

A single shared-header instance polls every 30 seconds while visible and on focus return. Hidden pages skip polling; in-flight requests do not overlap. Logout/user changes abort requests and clear state. New types must add explicit permission, text and internal-target resolution.

## Rooms and reservation infrastructure

System settings → Meeting room booking settings opens the shared administrator-only dialog. Settings and administrative reservation-list APIs require both the system administrator check and the corresponding Room operation. Rooms initially disallow booking. Configure bookability and a valid IANA zone. Closed branches and inactive rooms cannot receive new reservations. Future reservations prevent deletion, disabling booking or zone changes. Ordinary event booking and existing room-master rights remain separate.

`reservable_resources` identifies resources; `resource_reservations` stores occupied intervals. A resource references a Room or a future individual IT asset; an occurrence can relate to multiple resources. Current input accepts one room only. Equipment booking remains a future extension separate from permanent assignment or lending/return.

READ COMMITTED transactions lock requested resource IDs in ascending order and then check overlap using a fresh snapshot. Intervals are `[start, end)`, so adjacency is allowed. The entire request, including recurrence, succeeds or rolls back. Updates, cancellation, administrative release and resource disabling follow the same locking rule.

Administrators can release only a room reservation with a reason and audit entry; this grants no right to edit the event or read private content. Administrative reservation lists do not expose event text/title/participants. Organizer retirement preserves history; remaining reservations can be handled through this release operation.

Timed events store UTC instants and the original IANA zone; recurrence uses that zone's wall clock. All-day events store dates and an exclusive end date; occupancy uses the resource zone's date boundaries. Nonexistent local times return 422; ambiguous times require an explicit UTC offset. Recurrence skips nonexistent dates/times.

## REST and authorization

All APIs use server-side sessions through the same-origin gateway.

| Resource | Purpose |
| --- | --- |
| `POST /v1/schedule-events` | Create an event/series; requires an `Idempotency-Key` header |
| `GET /v1/schedule-occurrences` | Retrieve a period of at most 42 days and 20 calendars |
| `GET/PATCH/DELETE /v1/schedule-occurrences/{key}` | Redacted detail and organizer update/cancellation |
| `PUT /v1/schedule-occurrences/{key}/response` | Current participant's response |
| `/v1/schedule-employees`, `/v1/schedule-resources` | Minimal employee and bookable-room searches |
| `/v1/schedule-context` | Working-day/holiday background for selected calendars |
| `POST /v1/schedule-availability` | Draft/series availability and affected counts |
| `/v1/employees/me/schedule-preferences` | Private display preferences |
| `/v1/notifications`, `/v1/notifications/{id}/read-receipt`, `/v1/notifications/read-receipts` | Recipient notices/read state; DELETE with `read=true&through=...` bulk-deletes read notices, DELETE `/{id}` deletes one recipient record |
| `/v1/rooms/{id}/booking-settings`, `/v1/rooms/{id}/reservations` | Administrator-only room settings and occupied intervals |
| `PUT /v1/resource-reservations/{id}/release` | Administrator release with a reason |

Lists use common `sortBy/sortOrder/offset/limit`, default 100 and maximum 500. The UI displays period data only after all pages succeed. JSON envelopes match HTTP status: 401 unauthenticated, 403 denied, 409 stale revision/reservation conflict/idempotency mismatch, and 422 invalid input. Protected responses are private/no-store.

Schedule operations separately protect reading, creation, organizer update/cancel, own responses, booking and preferences. Notifications have separate read/read-update/delete operations; deletion requires `notifications.delete`. Initial five roles receive ordinary use; custom roles are not automatically extended. Administrative booking settings/lists reject other roles with 403. Forced release requires both its system-only operation and the existing system administrator check.

m0035 contains the scheduling/notification schema and the employee-departure/purchase changes described separately. m0034 and earlier remain unchanged. New tables have auto-increment integer primary keys, separate unique keys, management timestamps and logical deletion. Fresh installations run the current chain; existing released installations use the reviewed update path. Earlier development histories require a separately verified, backed-up transition, not a blanket reinstall. See [Backup, update, and restore](Backup_Update_and_Restore.md). Library versions, original terms and attribution are in the product-root `licenses/README.md` and scheduler license records.

m0035 also adds notification deletion operations. Existing initial roles receive them only if they retain active global notification read/read-update grants; custom/revoked settings are not automatically expanded. This grant addition does not rewrite existing notices.

Cancelling a single event shows only its confirmation, without a recurrence-scope selector; input always uses `scope: single`. Recurring cancellation offers this occurrence/following/all.

UTC-offset controls appear only for the ambiguous start/end local times in the selected zone, with values valid for that date. Ordinary unique times (including typical Asia/Tokyo times) and all-day dates show no control. Changing zone/time clears old choices. Single-event input omits unnecessary offsets; recurring input internally supplies a unique first-occurrence offset while preserving later daylight-saving validation. Nonexistent wall times remain invalid.
