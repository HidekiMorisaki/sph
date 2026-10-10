<script lang="ts">
	import type { Snippet } from 'svelte';
	import DetailModal from '$lib/components/DetailModal.svelte';
	import MasterHistorySection from '$lib/components/MasterHistorySection.svelte';
	import { localeMessages } from '$lib/locale-messages';
	import { localization } from '$lib/localization';

	let { title, titleId, sectionTitle = title, closeLabel, returnFocus = null, endpoint, itemId, fields, dateFields = [], valueFormatters = {}, hiddenHistoryFields = [], details, onClose }: {
		title: string;
		titleId: string;
		sectionTitle?: string;
		closeLabel: string;
		returnFocus?: HTMLElement | null;
		endpoint: string;
		itemId: number;
		fields: { key: string; label: string; value: string | number | boolean | null | undefined }[];
		dateFields?: string[];
		valueFormatters?: Record<string, (value: string) => string>;
		hiddenHistoryFields?: string[];
		details?: Snippet;
		onClose: () => void;
	} = $props();
	let common = $derived(localeMessages[$localization.displayLanguage].common);
	let fieldLabels = $derived(Object.fromEntries(fields.map((field) => [field.key, field.label])));
	function safeUrl(value: string | number | boolean | null | undefined): string | null {
		if (typeof value !== 'string') return null;
		try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) ? url.href : null; } catch { return null; }
	}
</script>

<DetailModal {title} {titleId} {closeLabel} {returnFocus} compact onClose={onClose}>
	<section class="app-detail-section"><h3>{sectionTitle}</h3><dl class="app-detail-grid">
		{#each fields as field}<div class:app-detail-wide={field.key === 'notes'}><dt>{field.label}</dt><dd class:app-detail-notes={field.key === 'notes'}>{#if field.key === 'officialUrl' && safeUrl(field.value)}<a class="detail-link" href={safeUrl(field.value) ?? undefined} target="_blank" rel="noopener noreferrer">{field.value}</a>{:else if typeof field.value === 'boolean'}{field.value ? common.yes : common.no}{:else}{field.value === null || field.value === undefined || field.value === '' ? '' : String(field.value)}{/if}</dd></div>{/each}
	</dl></section>
	{#if details}{@render details()}{/if}
	<MasterHistorySection {endpoint} {itemId} {fieldLabels} {dateFields} {valueFormatters} hiddenFields={hiddenHistoryFields} />
</DetailModal>
