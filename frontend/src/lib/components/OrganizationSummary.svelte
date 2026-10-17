<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { localization, formatDate } from '$lib/localization';
	import { initialSearch, emptyGroup, type SearchGroup } from '$lib/search';
	import LoadingSpinner from './LoadingSpinner.svelte';
	import StatusNotice from './StatusNotice.svelte';
	type Item = { id: number | null; name: string | null; count: number };
	type Summary = { asOf: string; scope: string; branchId: number | null; total: number; branches: Item[]; departments: Item[] };
	let data = $state<Summary | null>(null), loading = $state(true), error = $state(false), forbidden = $state(false);
	let errorDismissed=$state(false);
	let mounted = false;
	let ja = $derived($localization.displayLanguage === 'ja');
	const number = (value:number) => new Intl.NumberFormat($localization.displayLanguage).format(value);
	async function load() {
		loading = true; error = false; errorDismissed=false;
		try {
			const response = await fetch('/v1/employee-organization-summary', { cache: 'no-store' });
			if (!mounted) return;
			forbidden = response.status === 403;
			if (!response.ok) throw Error();
			const payload = await response.json();
			if (mounted) data = payload.data;
		} catch { if (mounted) error = true; }
		finally { if (mounted) loading = false; }
	}
	function openEmployees(kind:'branches'|'departments',item:Item) {
		if (!data) return;
		const definition = initialSearch('employees').definition;
		const conditions:SearchGroup = { ...emptyGroup(), children: [
			{kind:'rule',field:'hiredAt',operator:'lte',value:data.asOf},
			{kind:'group',mode:'any',children:[{kind:'rule',field:'retiredAt',operator:'unset'},{kind:'rule',field:'retiredAt',operator:'gt',value:data.asOf}]}
		] };
		if (kind === 'branches' && item.id !== null) definition.options.branchIds = String(item.id);
		else {
			if(data.branchId !== null) definition.options.branchIds = String(data.branchId);
			conditions.children.push({kind:'group',context:'departments',match:item.id === null?'none':'some',mode:'all',children:item.id === null?[]:[{kind:'rule',field:'selection',operator:'eq',value:String(item.id)}]});
		}
		definition.conditions = conditions;
		void goto('/employees', { state: { employeeSearch: definition } });
	}
	onMount(() => { mounted = true; void load(); return () => { mounted = false; }; });
</script>

<section class="organization-summary" aria-label={ja?'現在の所属・現在の在籍者':'Current organization and employees'} aria-busy={loading}>
	<h2>{ja?'現在の所属・現在の在籍者':'Current organization and employees'}</h2>
	{#if loading}<LoadingSpinner label={ja?'読み込み中…':'Loading…'} compact />
	{:else if error}{#if !errorDismissed}<StatusNotice tone="error" onDismiss={()=>errorDismissed=true} message={forbidden?(ja?'この集計を閲覧する権限がありません。':'You do not have permission to view this summary.'):(ja?'集計を取得できませんでした。':'Unable to load the summary.')} />{/if}
		{#if !forbidden}<button class="app-primary-action" onclick={load}>{ja?'再試行':'Retry'}</button>{/if}
	{:else if data}
		<p>{formatDate(data.asOf,$localization)} · {ja?'在籍者':'Current employees'} {number(data.total)}{ja?'人':''} · {data.scope==='own_branch'?(ja?'所属拠点のみ':'Own branch'):(ja?'全拠点':'All branches')}</p>
		<p>{ja?'現在の所属情報を使用しています。上の基準日・期間選択とは独立した集計です。':'Uses current assignments, independently of the reference date and period above.'}</p>
		<div class="organization-cards">
			{#each ['branches','departments'] as key}
				{@const kind=key as 'branches'|'departments'}
				<section class="organization-card"><h3>{kind==='branches'?(ja?'拠点別':'By branch'):(ja?'部門別':'By department')}</h3>
					{#if kind==='departments'}<p>{ja?'複数部門に所属する社員は各部門に計上するため、合計は全体人数と一致しない場合があります。':'Employees in multiple departments count in each; department totals may differ from the overall total.'}</p>{/if}
					<ul>{#each data[kind] as item}<li><button onclick={()=>openEmployees(kind,item)}><span>{item.name ?? (ja?'所属なし':'Unassigned')}</span><strong>{number(item.count)}{ja?'人':''}</strong></button></li>{/each}</ul>
				</section>
			{/each}
		</div>
	{/if}
</section>

<style>
	.organization-summary h2{font-size:var(--font-size-section)}.organization-summary h3{font-size:var(--font-size-subsection)}
	.organization-summary{margin:24px 0;color:var(--text)}h2{font-size:var(--font-size-section-title,1.1rem);margin:0 0 12px}h3{font-size:var(--font-size-body);margin:0 0 12px}p{font-size:var(--font-size-support);color:var(--muted);margin:8px 0;overflow-wrap:anywhere}.organization-cards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px;margin-top:16px}.organization-card{padding:24px;border:1px solid var(--border);border-radius:var(--radius);background:var(--surface);min-width:0}ul{list-style:none;padding:0;margin:0}li button{display:flex;width:100%;justify-content:space-between;gap:16px;text-align:left;padding:10px 8px;border:0;border-bottom:1px solid var(--border);background:transparent;color:var(--text);font:inherit;cursor:pointer}li button:hover{background:var(--surface-hover)}li button:focus-visible{outline:2px solid var(--action-primary)}li span{overflow-wrap:anywhere}li strong{white-space:nowrap;font-weight:600}@media(max-width:900px){.organization-cards{grid-template-columns:minmax(0,1fr)}}@media(max-width:500px){.organization-card{padding:16px}}
</style>
