# Docker system monitoring

System administrators can view current measurements and the last hour, 24 hours,
or 7 days on `/system-information`. The API requires both `system.manage` and
`system.metrics.read`. The latter is system-only; migration grants it only to
roles already holding global system management permission.

History charts show CPU and memory only. Disk available space and SPH database
size remain available as current-value cards; their help explanations are removed.
The shared telemetry table and REST endpoint are still needed for these values
and CPU/memory history.

Local Docker Compose enables collection with `SPH_SYSTEM_METRICS=docker`.
The blitz.cloud Compose file explicitly disables it. Without the Docker setting,
the API returns `supported: false`, does not query telemetry, and starts no timer.
The page then displays the localized Docker-only message alongside the existing
version information. No new packages or third-party assets are included.

The last measurement timestamp is not displayed. The question-mark icon beside
Server status opens the shared detail modal with scope and sampling explanations.
The modal supports Escape, its close button, and focus return to the help icon.

## Measurement scope

- CPU usage, available-memory-based memory usage, CPU model, logical cores and
  runtime uptime describe the Linux environment running Docker. On Docker
  Desktop these describe its Linux VM, **not** the Windows/macOS physical host.
  They include other workloads. CPU usage uses differences in `/proc/stat`;
  guest counters are not double counted. The first CPU sample is unavailable.
- API process memory is RSS, not the total for all SPH containers. API process
  CPU usage and API process uptime are not collected or returned by the API.
- Disk total and available bytes describe the filesystem containing `db_data`,
  mounted read-only at `/monitor/database`. On Docker Desktop this is virtual
  disk capacity; physical host disk space may be smaller and is not measured.
  The API does not read database files or mount the Docker management socket.
- SPH data usage is `pg_database_size(current_database())`, including tables,
  indexes, stored covers/avatars, and monitoring history. It excludes WAL, server
  logs, backups, Docker images and other databases. There is no claimed total
  for all files attributable to SPH.

## Collection and retention

The API startup hook runs collection without needing an open browser. CPU/memory
are sampled once per minute; disk/database values refresh every five minutes and
are carried forward between refreshes. Failed fields are null, never zero.
An advisory transaction lock and minute check prevent duplicate writers.
Failures do not stop serving application requests; collection retries next minute.
No collection occurs while the API or database is stopped.

`system_metric_samples` has an autoincrement ID, unique minute-of-week slot
(0–10079), measurement time, JSON values, and all record-management columns.
The slot's measurement is overwritten after seven days. The row count is bounded
at 10080 without physical deletion or accumulation of soft-deleted samples.
Old rows after downtime are excluded by their measurement time. Indexes and
PostgreSQL vacuum manage the normal space overhead of updates.

The REST endpoint `/v1/system-information/metrics?period=24h` accepts only `1h`,
`24h` and `7d`, aggregating into 1-, 5- and 30-minute buckets respectively.
Each field has an average and maximum calculated from valid samples only.
Responses include only supported measurement fields; retired fields in older
stored JSON samples are excluded. The shared table and endpoint remain in use.
Empty buckets remain null and break graph lines. Partially sampled buckets
show their sample count. Times are UTC in storage/API and use the user's
configured timezone on screen. Responses are not cached. Display period and
refresh interval (1, 5 or 10 minutes; default 1 minute) are saved in browser local
storage and restored before the first request on the next visit. Invalid values
use defaults; storage failures do not prevent use during the current visit.
Only monitoring data is polled; the page and release information are not reloaded.
Unchanged graph inputs are reused to preserve the current graph selection.
Hidden tabs skip polling and refresh when shown if their interval has elapsed.
Measurements already over three minutes old when received are marked stale;
failed refreshes also become stale after the chosen interval plus three minutes.
Collection intervals remain unchanged by these display preferences.

New installs start with empty history. A full seven-day graph becomes available
only after seven days of operation. Existing full backups retain telemetry;
the developer's active-business-data export intentionally excludes it.
