<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { readSessionUser } from '$lib/client-session';

	let { tabs, active = $bindable(''), label, idPrefix, panelPrefix = idPrefix, storageKey }: {
		tabs: Array<{ id: string; label: string; count?: number }>;
		active: string;
		label: string;
		idPrefix: string;
		panelPrefix?: string;
		storageKey: string;
	} = $props();
	let employeeId: number | null = null;
	let selectedBeforeRestore = false;
	function showSelectedTab() {
		document.getElementById(`${idPrefix}-${active}-tab`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
	}
	function persist() {
		if (employeeId === null) return;
		try { localStorage.setItem(`${storageKey}:${employeeId}`, active); }
		catch { /* Tabs remain usable when storage is unavailable. */ }
	}
	function selectTab(tab: string) {
		selectedBeforeRestore = true;
		active = tab;
		persist();
		void tick().then(showSelectedTab);
	}
	function tabKeydown(event: KeyboardEvent) {
		if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
		event.preventDefault();
		const index = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (tabs.findIndex(tab => tab.id === active) + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
		selectTab(tabs[index].id);
		const element = document.getElementById(`${idPrefix}-${active}-tab`);
		element?.focus({ preventScroll: true });
		element?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
	}
	onMount(() => {
		let disposed = false;
		const hash = window.location.hash.slice(1);
		const linkedTab = tabs.find(tab => tab.id === hash || `${idPrefix}-${tab.id}` === hash);
		if (linkedTab) {
			active = linkedTab.id;
			selectedBeforeRestore = true;
			window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
			void tick().then(showSelectedTab);
		}
		void (async () => {
			try {
				const user = await readSessionUser();
				if (disposed || !user) return;
				employeeId = user.id;
				if (selectedBeforeRestore) { persist(); return; }
				const saved = localStorage.getItem(`${storageKey}:${user.id}`);
				if (tabs.some(tab => tab.id === saved)) {
					active = saved!;
					await tick();
					if (!disposed) showSelectedTab();
				}
			} catch { /* Keep the initial tab if session or storage is unavailable. */ }
		})();
		return () => { disposed = true; };
	});
</script>

<div class="page-tabs" role="tablist" aria-label={label}>
	{#each tabs as tab (tab.id)}
		<button type="button" role="tab" id={`${idPrefix}-${tab.id}-tab`} data-page-tab={tab.id} aria-controls={panelPrefix ? `${panelPrefix}-${tab.id}` : tab.id} aria-selected={active === tab.id} tabindex={active === tab.id ? 0 : -1} onclick={() => selectTab(tab.id)} onkeydown={tabKeydown}>{tab.label}{#if tab.count !== undefined} <span class="tab-count">({tab.count})</span>{/if}</button>
	{/each}
</div>

<style>
	.page-tabs{display:flex;gap:12px;overflow-x:auto;margin-bottom:16px;padding:0 16px;background:var(--surface);border:1px solid var(--border);border-radius:6px}
	.page-tabs button{flex:none;min-height:44px;margin:0;padding:10px 8px;background:transparent;border:0;border-bottom:2px solid transparent;border-radius:0;color:var(--text-secondary,var(--muted));font:inherit;white-space:nowrap;cursor:pointer}
	.page-tabs button[aria-selected='true']{border-bottom-color:var(--primary);color:var(--primary);font-weight:600}
	.page-tabs button:hover{background:var(--surface-hover,var(--surface-secondary))}
	.page-tabs button:focus-visible{outline:2px solid var(--primary);outline-offset:-2px}
	.tab-count{font-size:var(--font-size-support)}
	@media (max-width:700px), (min-width:701px) and (max-width:1024px) and (max-height:500px) and (any-pointer:coarse){
		.page-tabs{min-width:0;max-width:100%;flex-wrap:wrap;row-gap:0;overflow:visible}
		.page-tabs button{flex:0 1 auto;min-width:0;max-width:100%;white-space:normal;overflow-wrap:anywhere;text-align:left}
	}
</style>
