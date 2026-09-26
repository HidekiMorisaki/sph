<script lang="ts">
	import type { ChangeHistoryEntry } from '$lib/change-history';

	let {
		entries,
		loading = false,
		error = false,
		fieldLabels,
		actionLabels = { create: 'Created', update: 'Updated', delete: 'Deleted' }
	}: {
		entries: ChangeHistoryEntry[];
		loading?: boolean;
		error?: boolean;
		fieldLabels: Record<string, string>;
		actionLabels?: Record<string, string>;
	} = $props();
</script>

<section class="app-detail-section">
	<h3>Change history</h3>
	<div class="history" aria-label="Change history">
		{#if loading}<p>Loading change history…</p>
		{:else if error}<p role="alert">Unable to load change history.</p>
		{:else if entries.length === 0}<p>No changes recorded yet.</p>
		{:else}{#each entries as entry}<article class="history-event"><div class="history-event-heading"><strong>{actionLabels[entry.action] ?? entry.action}</strong><span>{new Date(entry.changedAt).toLocaleString()}</span><span>by {entry.actorName}</span></div>
			{#if entry.changes.length}<table><colgroup><col class="history-field-column"/><col class="history-value-column"/><col class="history-value-column"/></colgroup><thead><tr><th>Field</th><th>Before</th><th>After</th></tr></thead><tbody>{#each entry.changes as change}<tr><th scope="row">{fieldLabels[change.field] ?? change.field}</th><td>{change.before ?? '-'}</td><td>{change.after ?? '-'}</td></tr>{/each}</tbody></table>{/if}
		</article>{/each}{/if}
	</div>
</section>

<style>
	.history{overflow-x:auto;background:var(--surface);border:1px solid var(--border);border-radius:5px}.history p{margin:0;padding:12px;color:var(--muted);font-size:12px}.history table{width:100%;min-width:420px;font-size:12px}.history th,.history td{position:static;padding:8px 12px}
	.history-event{padding:12px;border-bottom:1px solid var(--border)}.history-event:last-child{border-bottom:0}.history-event-heading{display:flex;flex-wrap:wrap;gap:6px 14px;align-items:center;font-size:12px;margin-bottom:8px}.history-event-heading span{color:var(--muted)}.history-event table{table-layout:fixed;border-collapse:collapse}.history-field-column{width:28%}.history-value-column{width:36%}.history-event th,.history-event td{text-align:left;vertical-align:top;border-top:1px solid var(--border);overflow-wrap:anywhere}.history-event th{font-weight:600}
</style>
