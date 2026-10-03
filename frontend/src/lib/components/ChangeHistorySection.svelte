<script lang="ts">
	import { localeMessages, formatLocaleTemplate } from '$lib/locale-messages';
	import type { ChangeHistoryEntry } from '$lib/change-history';
	import { formatDate, formatEmployeeName, formatTimestamp, localization } from '$lib/localization';

	let commonText = $derived(localeMessages[$localization.displayLanguage].common);

	let {
		entries,
		loading = false,
		error = false,
		fieldLabels,
		dateFields = [],
		valueFormatters = {},
		actionLabels
	}: {
		entries: ChangeHistoryEntry[];
		loading?: boolean;
		error?: boolean;
		fieldLabels: Record<string, string>;
		dateFields?: string[];
		valueFormatters?: Record<string, (value: string) => string>;
		actionLabels?: Record<string, string>;
	} = $props();

	function displayValue(field: string, value: ChangeHistoryEntry['changes'][number]['before']) {
		if (value && typeof value === 'object') return formatEmployeeName(value, $localization);
		if (value === null || value.trim() === '') return '-';
		if (dateFields.includes(field)) return formatDate(value, $localization) || value;
		return valueFormatters[field]?.(value) ?? value;
	}

</script>

<section class="app-detail-section">
	<h3>{commonText.history}</h3>
	<div class="history" aria-label={commonText.history}>
		{#if loading}<p>{commonText.historyLoading}</p>
		{:else if error}<p role="alert">{commonText.historyFailed}</p>
		{:else if entries.length === 0}<p>{commonText.historyEmpty}</p>
		{:else}{#each entries as entry}<article class="history-event"><div class="history-event-heading"><strong>{(actionLabels ?? { create: commonText.created, update: commonText.updated, delete: commonText.deleted })[entry.action] ?? entry.action}</strong><span>{formatTimestamp(entry.changedAt, $localization)}</span><span>{formatLocaleTemplate(commonText.byActor, formatEmployeeName(entry.actor, $localization))}</span></div>
			{#if entry.changes.length}<table><colgroup><col class="history-field-column"/><col class="history-value-column"/><col class="history-value-column"/></colgroup><thead><tr><th>{commonText.field}</th><th>{commonText.before}</th><th>{commonText.after}</th></tr></thead><tbody>{#each entry.changes as change}<tr><th scope="row">{fieldLabels[change.field] ?? change.field}</th><td>{displayValue(change.field, change.before)}</td><td>{displayValue(change.field, change.after)}</td></tr>{/each}</tbody></table>{/if}
		</article>{/each}{/if}
	</div>
</section>

<style>
	.history{overflow-x:auto;background:var(--surface);border:1px solid var(--border);border-radius:5px}.history p{margin:0;padding:12px;color:var(--muted);font-size:12px}.history table{width:100%;min-width:420px;font-size:12px}.history th,.history td{position:static;padding:8px 12px}
	.history-event{padding:12px;border-bottom:1px solid var(--border)}.history-event:last-child{border-bottom:0}.history-event-heading{display:flex;flex-wrap:wrap;gap:6px 14px;align-items:center;font-size:12px;margin-bottom:8px}.history-event-heading span{color:var(--muted)}.history-event table{table-layout:fixed;border-collapse:collapse}.history-field-column{width:28%}.history-value-column{width:36%}.history-event th,.history-event td{text-align:left;vertical-align:top;border-top:1px solid var(--border);overflow-wrap:anywhere}.history-event th{font-weight:600}
</style>
