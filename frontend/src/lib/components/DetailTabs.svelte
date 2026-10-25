<script lang="ts">
	import { stickyTabBackdrop } from '$lib/sticky-tab-backdrop';
	import { onMount, tick, type Snippet } from 'svelte';
	import PageTabs from './PageTabs.svelte';
	import { modalTabs, type ModalTabKind } from '$lib/modal-tabs';
	import { localization } from '$lib/localization';
	import { detailTabsSize } from '$lib/detail-tabs-size';
	let { tabs, active = $bindable('basic'), label, kind = 'basic' }: {
		kind?: ModalTabKind;
		tabs: Array<{ id: string; label: string; content: Snippet }>;
		active?: string;
		label: string;
	} = $props();
	const id = $props.id();
	let labeledTabs = $derived(tabs.map(tab => ({ ...tab, label: modalTabs(kind, $localization.displayLanguage).find(definition => definition.id === tab.id)?.label ?? tab.label })));
	let host = $state<HTMLDivElement>();
	$effect(() => { if (!tabs.some(tab => tab.id === active)) active = tabs[0]?.id ?? ''; });
	onMount(() => {
		const dialog = host?.closest('dialog');
		let pendingScroll: { top: number; left: number } | null = null;
		let timer: ReturnType<typeof setTimeout> | undefined;
		const cancelScroll = () => { pendingScroll = null; clearTimeout(timer); };
		const applyScroll = () => {
			const body = dialog?.querySelector<HTMLElement>('.app-detail-body');
			if (!pendingScroll || !body || body.scrollHeight - body.clientHeight + 1 < pendingScroll.top) return;
			body.scrollTop = pendingScroll.top; body.scrollLeft = pendingScroll.left;
			cancelScroll();
		};
		const restore = (event: Event) => {
			const state = (event as CustomEvent<{ tab?: string; scrollTop: number; scrollLeft: number }>).detail;
			if (!tabs.some(item => item.id === state.tab)) return;
			active = state.tab!;
			pendingScroll = { top: state.scrollTop, left: state.scrollLeft };
			clearTimeout(timer); timer = setTimeout(cancelScroll, 10000);
			void tick().then(applyScroll);
		};
		const content = new MutationObserver(() => { void tick().then(applyScroll); });
		if (host) content.observe(host, { childList: true, characterData: true, subtree: true });
		dialog?.addEventListener('detail-return', restore);
		for (const event of ['wheel', 'touchstart', 'pointerdown', 'keydown']) dialog?.addEventListener(event, cancelScroll, { passive: true });
		return () => {
			cancelScroll(); content.disconnect();
			dialog?.removeEventListener('detail-return', restore);
			for (const event of ['wheel', 'touchstart', 'pointerdown', 'keydown']) dialog?.removeEventListener(event, cancelScroll);
		};
	});
</script>

<div class="detail-tabs-layout" data-detail-tabs-root data-active={active} bind:this={host} use:detailTabsSize>
	<div class="detail-tabs-card" use:stickyTabBackdrop><PageTabs tabs={labeledTabs} bind:active {label} idPrefix={`detail-${id}`} /></div>
	<div class="detail-tabs-panels">
		{#each labeledTabs as tab (tab.id)}
			<div class="detail-tab-panel" data-detail-tab-panel={tab.id} role="tabpanel" id={`detail-${id}-${tab.id}`} aria-labelledby={`detail-${id}-${tab.id}-tab`} hidden={active !== tab.id} inert={active !== tab.id}>{@render tab.content()}</div>
		{/each}
	</div>
</div>

<style>
	.detail-tabs-layout{display:grid;gap:16px;min-width:0}
	.detail-tabs-card{position:sticky;top:0;z-index:3;min-width:0;background:var(--surface);border:1px solid var(--border);border-radius:6px}
	.detail-tabs-card::before{content:"";position:absolute;top:calc(-1px - var(--sticky-tab-backdrop-height,24px));left:-25px;right:-25px;height:var(--sticky-tab-backdrop-height,24px);background:var(--bg);pointer-events:none}
	.detail-tabs-card :global(.page-tabs){margin:0;border:0;border-radius:6px}
	.detail-tabs-panels{position:relative;min-width:0}
	.detail-tab-panel{display:grid;gap:16px;min-width:0}
	.detail-tab-panel[hidden]{display:none}
	.detail-tabs-layout:global([data-measuring])>.detail-tabs-panels>.detail-tab-panel{display:grid!important;position:absolute;inset:0 0 auto;visibility:hidden}
	@media (max-width:700px), (min-width:701px) and (max-width:1024px) and (max-height:500px) and (any-pointer:coarse){.detail-tabs-card::before{left:-17px;right:-17px}}
</style>
