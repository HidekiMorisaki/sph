<script lang="ts">
 import "$lib/styles/mobile-records.css";
	import '$lib/styles/table-scroll.css';
	import { localeMessages, formatLocaleTemplate } from '$lib/locale-messages';
	import type { ChangeHistoryEntry } from '$lib/change-history';
	import { formatDate, formatEmployeeName, formatTimestamp, localization } from '$lib/localization';
	import StatusNotice from '$lib/components/StatusNotice.svelte';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';

	let commonText = $derived(localeMessages[$localization.displayLanguage].common);

	let {
		title,
		collapsible = true,
		entries,
		loading = false,
		error = false,
		fieldLabels,
		dateFields = [],
		valueFormatters = {},
		actionLabels,
		onEmployeeClick
	}: {
		title?: string;
		collapsible?: boolean;
		entries: ChangeHistoryEntry[];
		loading?: boolean;
		error?: boolean;
		fieldLabels: Record<string, string>;
		dateFields?: string[];
		valueFormatters?: Record<string, (value: string) => string>;
		actionLabels?: Record<string, string>;
		onEmployeeClick?: (id: number, trigger: HTMLButtonElement) => void;
	} = $props();
	const historyId = $props.id();
	let expanded = $state(false);
	let errorDismissed = $state(false);
	$effect(() => { if (!error) errorDismissed = false; });

	function displayValue(field: string, value: ChangeHistoryEntry['changes'][number]['before']) {
		if (value && typeof value === 'object') return formatEmployeeName(value, $localization);
		if (value === null || value.trim() === '') return '-';
		if (dateFields.includes(field)) return formatDate(value, $localization) || value;
		return valueFormatters[field]?.(value) ?? value;
	}
	function employeeId(value: ChangeHistoryEntry['changes'][number]['before']) {
		return value && typeof value === 'object' && Number.isSafeInteger(value.id) && Number(value.id) > 0 ? Number(value.id) : null;
	}
	const employeeFields = ['assigneeId', 'managerEmployeeId', 'deputyManagerEmployeeId'];

</script>

<section class="app-detail-section">
	<h3>{#if collapsible}<button class="history-toggle" type="button" aria-expanded={expanded} aria-controls={historyId} onclick={() => expanded = !expanded}><svg class:expanded viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="m7 4 6 6-6 6" /></svg><span>{title ?? commonText.history}</span></button>{:else}{title ?? commonText.history}{/if}</h3>
	<div id={historyId} class="history" hidden={collapsible && !expanded} aria-label={title ?? commonText.history}>
		{#if loading}<LoadingSpinner label={commonText.historyLoading} compact />
		{:else if error}{#if !errorDismissed}<StatusNotice message={commonText.historyFailed} tone="error" onDismiss={() => errorDismissed = true} />{/if}
		{:else if entries.length === 0}<p>{commonText.historyEmpty}</p>
		{:else}{#each entries as entry}<article class="history-event"><div class="history-event-heading"><strong>{(actionLabels ?? { create: commonText.created, update: commonText.updated, delete: commonText.deleted })[entry.action] ?? entry.action}</strong><span>{formatTimestamp(entry.changedAt, $localization)}</span><span>{formatLocaleTemplate(commonText.byActor, '')}{#if onEmployeeClick && entry.actor.id}<button class="history-employee-link" type="button" onclick={(event) => onEmployeeClick(entry.actor.id!, event.currentTarget)}>{formatEmployeeName(entry.actor, $localization)}</button>{:else}{formatEmployeeName(entry.actor, $localization)}{/if}</span></div>
			{#if entry.changes.length}<div class="app-table-scroll app-table-scroll--bounded mobile-record-table"><table><colgroup><col class="history-field-column"/><col class="history-value-column"/><col class="history-value-column"/></colgroup><thead><tr><th>{commonText.field}</th><th>{commonText.before}</th><th>{commonText.after}</th></tr></thead><tbody>{#each entry.changes as change}<tr><th scope="row">{fieldLabels[change.field] ?? change.field}</th><td data-label={commonText.before}>{#if onEmployeeClick && employeeFields.includes(change.field) && employeeId(change.before)}<button class="history-employee-link" type="button" onclick={(event) => onEmployeeClick(employeeId(change.before)!, event.currentTarget)}>{displayValue(change.field, change.before)}</button>{:else}{displayValue(change.field, change.before)}{/if}</td><td data-label={commonText.after}>{#if onEmployeeClick && employeeFields.includes(change.field) && employeeId(change.after)}<button class="history-employee-link" type="button" onclick={(event) => onEmployeeClick(employeeId(change.after)!, event.currentTarget)}>{displayValue(change.field, change.after)}</button>{:else}{displayValue(change.field, change.after)}{/if}</td></tr>{/each}</tbody></table></div>{/if}
		</article>{/each}{/if}
	</div>
</section>

<style>
	.history-toggle{display:flex;align-items:center;gap:8px;width:100%;padding:0;border:0;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer}.history-toggle svg{flex:none;width:18px;height:18px}.history-toggle svg.expanded{transform:rotate(90deg)}.history-toggle:hover{color:var(--action-primary)}.history-toggle:focus-visible{outline:2px solid var(--action-primary);outline-offset:4px;border-radius:2px}
	.history{overflow-x:auto;background:var(--surface);border:1px solid var(--border);border-radius:5px}.history p{margin:0;padding:12px;color:var(--muted);font-size:var(--font-size-support)}.history table{width:100%;min-width:420px;font-size:var(--font-size-body)}.history th,.history td{padding:8px 12px}
	.history-event{padding:12px;border-bottom:1px solid var(--border)}.history-event:last-child{border-bottom:0}.history-event-heading{display:flex;flex-wrap:wrap;gap:6px 14px;align-items:center;font-size:var(--font-size-support);margin-bottom:8px}.history-event-heading span{color:var(--muted)}.history-event table{table-layout:fixed;border-collapse:collapse}.history-field-column{width:28%}.history-value-column{width:36%}.history-event th,.history-event td{text-align:left;vertical-align:top;border-top:1px solid var(--border);overflow-wrap:anywhere}.history-event th{font-weight:600}
	.history-employee-link{border:0;padding:0;background:transparent;color:var(--action-primary);font:inherit;text-align:left;text-decoration:underline;cursor:pointer}.history-employee-link:focus-visible{outline:2px solid var(--action-primary);outline-offset:2px}
@media (max-width:700px), (min-width:701px) and (max-width:1024px) and (max-height:500px) and (any-pointer:coarse){.history-toggle{min-height:44px}.history-event{padding:10px}.history-event-heading{align-items:flex-start;flex-direction:column;gap:4px}.history-employee-link{min-height:44px}.history{overflow:visible}.history-event table{min-width:0}}
</style>
