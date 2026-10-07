<script lang="ts">
	import { onMount } from 'svelte';
	import ChangeHistorySection from '$lib/components/ChangeHistorySection.svelte';
	import type { ChangeHistoryEntry } from '$lib/change-history';
	import { localeMessages } from '$lib/locale-messages';
	import { localization } from '$lib/localization';

	let { endpoint, itemId, fieldLabels, dateFields = [], valueFormatters = {}, hiddenFields = [] }: {
		endpoint: string;
		itemId: number;
		fieldLabels: Record<string, string>;
		dateFields?: string[];
		valueFormatters?: Record<string, (value: string) => string>;
		hiddenFields?: string[];
	} = $props();
	let entries = $state<ChangeHistoryEntry[]>([]);
	let visibleEntries = $derived(entries.flatMap((entry) => {
		const changes = entry.changes.filter((change) => !hiddenFields.includes(change.field));
		return changes.length || !entry.changes.length ? [{ ...entry, changes }] : [];
	}));
	let loading = $state(true);
	let error = $state(false);
	let common = $derived(localeMessages[$localization.displayLanguage].common);
	let actionLabels = $derived({ create: common.created, update: common.updated, delete: common.deleted, restore: common.restored });
	let formatters = $derived({ ...valueFormatters, supportsCpu: (value: string) => value === 'true' ? common.yes : common.no, supportsRam: (value: string) => value === 'true' ? common.yes : common.no, supportsOs: (value: string) => value === 'true' ? common.yes : common.no, supportsLoginUsername: (value: string) => value === 'true' ? common.yes : common.no });

	onMount(() => {
		let cancelled = false;
		void (async () => {
			try {
				const result: ChangeHistoryEntry[] = [];
				let offset = 0;
				while (true) {
					const response = await fetch(`${endpoint}/${itemId}/history?limit=500&offset=${offset}&sortOrder=desc`);
					if (!response.ok) throw new Error('History request failed.');
					const payload = await response.json() as { data: ChangeHistoryEntry[]; meta?: { hasMore?: boolean } };
					result.push(...payload.data);
					if (!payload.meta?.hasMore || payload.data.length === 0) break;
					offset += payload.data.length;
				}
				if (!cancelled) entries = result;
			} catch { if (!cancelled) error = true; }
			finally { if (!cancelled) loading = false; }
		})();
		return () => { cancelled = true; };
	});
</script>

<ChangeHistorySection entries={visibleEntries} {loading} {error} {fieldLabels} {dateFields} valueFormatters={formatters} {actionLabels} />
