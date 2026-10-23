<script lang="ts">
	import { onMount } from 'svelte';
	import AssetManagementShell from '$lib/components/AssetManagementShell.svelte';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
	import StatusNotice from '$lib/components/StatusNotice.svelte';
	import { localeMessages } from '$lib/locale-messages';
	import { localization, formatDate } from '$lib/localization';
	type Item = { id: number; name: string; count: number };
	type Summary = { asOf: string; scope: 'global' | 'own_branch'; branchId: number | null; total: number; types: Item[]; branches: Item[] };
	let text = $derived(localeMessages[$localization.displayLanguage].assetOverview);
	let data = $state<Summary | null>(null), loading = $state(true), failure = $state<'forbidden' | 'loadFailed' | null>(null), dismissed = $state(false);
	let controller: AbortController | undefined;
	const count = (value: number) => new Intl.NumberFormat($localization.displayLanguage).format(value);
	function link(kind?: 'types' | 'branches', id?: number) {
		const query = new URLSearchParams({ unassigned: 'true' });
		if (kind === 'types' && id !== undefined) query.set('typeIds', String(id));
		if (kind === 'branches' && id !== undefined) query.set('branchId', String(id));
		return `/it-assets?${query}`;
	}
	async function load() {
		controller?.abort();
		const current = new AbortController(); controller = current;
		loading = true; failure = null; dismissed = false; data = null;
		try {
			const response = await fetch('/v1/it-asset-summary', { cache: 'no-store', signal: current.signal });
			if (!response.ok) { failure = response.status === 403 ? 'forbidden' : 'loadFailed'; return; }
			const payload = await response.json();
			if (!current.signal.aborted) data = payload.data;
		} catch { if (!current.signal.aborted) failure = 'loadFailed'; }
		finally { if (!current.signal.aborted) loading = false; }
	}
	onMount(() => { void load(); return () => controller?.abort(); });
</script>

<AssetManagementShell title={text.title}>
	<div class="asset-overview" aria-busy={loading}>
		{#if loading}<LoadingSpinner label={text.loading} />
		{:else if failure}
			{#if !dismissed}<StatusNotice tone="error" message={text[failure]} onDismiss={() => dismissed = true} />{/if}
			{#if failure !== 'forbidden'}<button class="app-primary-action" onclick={load}>{text.retry}</button>{/if}
		{:else if data}
			<section class="summary-card summary-total" aria-labelledby="asset-summary-heading">
				<div><h2 id="asset-summary-heading">{text.unassigned}</h2><p>{formatDate(data.asOf, $localization)} · {data.scope === 'own_branch' ? text.ownBranch : text.allBranches}</p></div>
				<a class="total-count" data-summary-total href={link()} aria-label={`${text.unassigned}: ${count(data.total)} · ${text.openList}`}>{count(data.total)}<span>{text.assets}</span></a>
				<p class="definition">{text.definition}</p>
			</section>
			<div class="summary-groups">
				{#each ['types', 'branches'] as kind}
					{@const key = kind as 'types' | 'branches'}
					<section class="summary-card" aria-labelledby={`asset-summary-${key}`}><h2 id={`asset-summary-${key}`}>{text[key]}</h2>
						{#if !data[key].length}<p class="empty">{text.empty}</p>{:else}<ul>{#each data[key] as item}<li><a data-summary-kind={key} data-summary-id={item.id} href={link(key, item.id)}><span>{item.name}</span><strong>{count(item.count)}</strong></a></li>{/each}</ul>{/if}
					</section>
				{/each}
			</div>
		{/if}
	</div>
</AssetManagementShell>

<style>
	.asset-overview{min-width:0;color:var(--text)}.summary-card{min-width:0;padding:24px;background:var(--surface);border:1px solid var(--border);border-radius:6px}.summary-card h2{margin:0 0 12px;font-size:var(--font-size-section)}.summary-card p{margin:8px 0 0;color:var(--muted);font-size:var(--font-size-support);line-height:1.7;overflow-wrap:anywhere}.summary-total{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px 24px;margin-bottom:20px}.total-count{display:flex;gap:12px;align-items:baseline;align-self:center;font-size:48px;line-height:1.2;font-weight:600;color:var(--action-primary);text-decoration:none}.total-count span{font-size:var(--font-size-body);font-weight:400}.total-count:hover{text-decoration:underline}.summary-total .definition{grid-column:1/-1}.summary-groups{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px}ul{padding:0;margin:0;list-style:none}li a{display:flex;justify-content:space-between;align-items:center;min-height:44px;gap:16px;padding:10px 8px;border-bottom:1px solid var(--border);color:var(--text);font-size:var(--font-size-body);text-decoration:none}li a:hover{background:var(--surface-hover)}li span{min-width:0;overflow-wrap:anywhere}li strong{color:var(--action-primary);white-space:nowrap}a:focus-visible{outline:2px solid var(--action-primary);outline-offset:2px}.empty{padding:12px 0}@media(max-width:900px){.summary-groups{grid-template-columns:minmax(0,1fr)}}@media(max-width:500px){.summary-card{padding:16px}.summary-total{grid-template-columns:minmax(0,1fr)}.total-count{font-size:40px}}
</style>
