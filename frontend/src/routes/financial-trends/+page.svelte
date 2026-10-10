<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import AssetManagementShell from '$lib/components/AssetManagementShell.svelte';
	import DatePicker from '$lib/components/DatePicker.svelte';
	import FinancialTrendsChart from '$lib/components/FinancialTrendsChart.svelte';
	import MasterPageHeader from '$lib/components/MasterPageHeader.svelte';
	import StatusNotice from '$lib/components/StatusNotice.svelte';
	import type { FinancialTrend, FinancialTrendsResponse } from '$lib/financialTrendsData';
	import { localeMessages } from '$lib/locale-messages';
	import { localization } from '$lib/localization';

	const yearsStorageKey = 'asset-financial-trends-years';
	function validYear(value: unknown): value is number { return Number.isInteger(value) && Number(value) >= 1980 && Number(value) <= 2100; }
	function storedYears(): { startYear: number; endYear: number } | null {
		try {
			const saved = JSON.parse(localStorage.getItem(yearsStorageKey) ?? 'null') as { startYear?: unknown; endYear?: unknown } | null;
			return saved && validYear(saved.startYear) && validYear(saved.endYear) && saved.startYear <= saved.endYear
				? { startYear: saved.startYear, endYear: saved.endYear } : null;
		} catch { return null; }
	}
	function rememberYears(startYear: number, endYear: number) {
		try { localStorage.setItem(yearsStorageKey, JSON.stringify({ startYear, endYear })); }
		catch { /* The current selection remains usable when browser storage is unavailable. */ }
	}
	const currentYear = Math.min(2100, Math.max(1980, new Date().getFullYear()));
	let startYear = $state(Math.max(1980, currentYear - 9));
	let endYear = $state(currentYear);
	let activeYearPicker = $state<'start' | 'end' | null>(null);
	let items = $state<FinancialTrend[]>([]);
	let branches = $state<{ branchId: number; branchName: string; data: FinancialTrend[] }[]>([]);
	let basis = $state<'calendar' | 'fiscal'>('calendar');
	let loading = $state(true);
	let error = $state('');
	let pdfBusy = $state(false);
	let pdfBusyDismissed = $state(false);
	let pdfError = $state(false);
	let sequence = 0;
	let mounted = $state(false);
	let text = $derived(localeMessages[$localization.displayLanguage].financialTrends);
	let title = $derived(localeMessages[$localization.displayLanguage].navigation.items.financialTrends);
	let currency = $derived($localization.displayCurrency);
	let hasData = $derived(items.some((item) => item.revenue !== null));
	let hasPublished = $derived(items.some((item) => item.branchCount > 0));
	let pdfReady = $derived(items.length > 0 && !loading && !error && !pdfBusy);
	function branchPoints(branch: { data: FinancialTrend[] }): FinancialTrend[] {
		const byYear = new Map(branch.data.map((item) => [item.year, item]));
		return items.map((item) => byYear.get(item.year) ?? { year: item.year, branchCount: 0, unavailable: false, revenue: null, variableCost: null, fixedCost: null, netProfit: null });
	}
	async function load() {
		const request = ++sequence;
		loading = true;
		error = '';
		items = [];
		branches = [];
		try {
			const response = await fetch(`/v1/financial-trends?startYear=${startYear}&endYear=${endYear}&currency=${currency}`);
			if (response.status === 401) { window.location.assign('/'); return; }
			if (!response.ok) throw new Error('Financial trends request failed');
			const result = await response.json() as FinancialTrendsResponse;
			if (request !== sequence) return;
			items = result.data.totals;
			branches = result.data.branches;
			basis = result.meta.basis;
		} catch { if (request === sequence) error = text.loadFailed; }
		finally { if (request === sequence) loading = false; }
	}
	function chooseStart(value: string) {
		const selected = Number(value);
		if (!validYear(selected)) return;
		startYear = selected;
		if (startYear > endYear) endYear = startYear;
		rememberYears(startYear, endYear);
		void load();
	}
	function chooseEnd(value: string) {
		const selected = Number(value);
		if (!validYear(selected)) return;
		endYear = selected;
		if (endYear < startYear) startYear = endYear;
		rememberYears(startYear, endYear);
		void load();
	}
	async function downloadPdf() {
		if (!pdfReady) return;
		const request = sequence;
		const selection = { startYear, endYear, currency };
		const settings = { ...$localization };
		pdfBusy = true;
		pdfBusyDismissed = false;
		pdfError = false;
		activeYearPicker = null;
		try {
			const { prepareFinancialTrendsPdfDownload } = await import('$lib/financialTrendsPdfDownload');
			const report = await prepareFinancialTrendsPdfDownload(selection, settings);
			if (!mounted || request !== sequence) return;
			await report.document.save(report.fileName, { returnPromise: true });
		} catch { if (mounted && request === sequence) pdfError = true; }
		finally { if (mounted) pdfBusy = false; }
	}
	onMount(() => {
		const saved = storedYears();
		if (saved) { startYear = saved.startYear; endYear = saved.endYear; }
		mounted = true;
		return () => { mounted = false; sequence += 1; };
	});
	$effect(() => { void currency; if (mounted) untrack(() => void load()); });
</script>

{#snippet pdfActions()}
	<button type="button" class="app-primary-action pdf-download" disabled={!pdfReady} onclick={downloadPdf}>
		<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m-5-5 5 5 5-5M5 16v4h14v-4" /></svg>
		{pdfBusy ? text.pdfGenerating : text.pdfDownload}
	</button>
{/snippet}
<AssetManagementShell {title}>
	<div class="trends-page">
		<MasterPageHeader {title} description={text.description} actions={pdfActions} />
		{#if pdfBusy && !pdfBusyDismissed}<StatusNotice message={text.pdfGenerating} tone="info" onDismiss={() => pdfBusyDismissed = true} />{/if}
		{#if pdfError}<StatusNotice message={text.pdfError} tone="error" onDismiss={() => pdfError = false} />{/if}
		<section class="panel" aria-label={text.chartTitle}>
			<div class="toolbar">
				<div><h2>{text.allBranchesTotal}</h2><p>{text.chartTitle} · {basis === 'calendar' ? text.calendarYear : text.fiscalYear} · {text.currency}: {currency}</p></div>
				<div class="controls">
					<DatePicker label={text.startYear} field="financial-trends-start-year" value={String(startYear)} mode="year" min="1980" max="2100" required disabled={loading || pdfBusy} open={activeYearPicker === 'start'} onToggle={() => activeYearPicker = activeYearPicker === 'start' ? null : 'start'} onSelect={(value) => { activeYearPicker = null; chooseStart(value); }} />
					<DatePicker label={text.endYear} field="financial-trends-end-year" value={String(endYear)} mode="year" min="1980" max="2100" align="end" required disabled={loading || pdfBusy} open={activeYearPicker === 'end'} onToggle={() => activeYearPicker = activeYearPicker === 'end' ? null : 'end'} onSelect={(value) => { activeYearPicker = null; chooseEnd(value); }} />
				</div>
			</div>
			<div class="content">
				{#if error}<StatusNotice message={error} tone="error" onDismiss={() => error = ''} />{/if}
				{#if loading}<p class="state">{localeMessages[$localization.displayLanguage].common.loading}</p>
				{:else if !hasData}<p class="state">{hasPublished ? text.unavailable : text.noData}</p>
				{:else}<FinancialTrendsChart points={items} labels={{ ...text, chartTitle: text.allBranchesTotal }} {currency} />{/if}
			</div>
		</section>
		{#if !loading && branches.length}
			<h2 class="branch-heading">{text.branchCharts}</h2>
			{#each branches as branch (branch.branchId)}
				<section class="panel" aria-label={branch.branchName}>
					<div class="toolbar"><div><h2>{branch.branchName}</h2><p>{text.chartTitle} · {basis === 'calendar' ? text.calendarYear : text.fiscalYear} · {currency}</p></div></div>
					<div class="content"><FinancialTrendsChart points={branchPoints(branch)} labels={{ ...text, chartTitle: branch.branchName }} {currency} /></div>
				</section>
			{/each}
		{/if}
	</div>
</AssetManagementShell>

<style>
	.trends-page{display:grid;gap:16px;min-width:0}.branch-heading{margin:12px 0 0;font-size:1.25rem}.panel{min-width:0;background:var(--surface);border:1px solid var(--border);border-radius:6px;box-shadow:var(--shadow)}.toolbar{display:flex;justify-content:space-between;align-items:end;gap:20px;padding:18px 20px;border-bottom:1px solid var(--border)}h2{margin:0 0 4px;font-size:1.13rem}.toolbar p{margin:0;color:var(--text-secondary);font-size:var(--font-size-support)}.controls{display:flex;gap:12px}.controls :global(.custom-date){width:130px}.content{padding:20px}.state{margin:8px 0;color:var(--text-secondary)}@media(max-width:700px){.toolbar{align-items:stretch;flex-direction:column}.controls :global(.custom-date){flex:1;width:auto}}
	.pdf-download{display:inline-flex;align-items:center;justify-content:center;gap:6px}.pdf-download svg{width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
	@media(max-width:700px){.pdf-download{width:100%}}
</style>
