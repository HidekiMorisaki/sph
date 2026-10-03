<script lang="ts">
	import { onMount } from 'svelte';
	import AssetManagementShell from '$lib/components/AssetManagementShell.svelte';
	import MasterPageHeader from '$lib/components/MasterPageHeader.svelte';
	import AnalyticsChart from '$lib/components/AnalyticsChart.svelte';
	import AnalyticsPeriodControls from '$lib/components/AnalyticsPeriodControls.svelte';
	import AnalyticsTurnoverChart from '$lib/components/AnalyticsTurnoverChart.svelte';
	import DatePicker from '$lib/components/DatePicker.svelte';
	import { analyticsRequestGate, AnalyticsRequestError, requestAnalytics, type AnalyticsFailure } from '$lib/analyticsRequests';
	import { analyticsChartKeys, analyticsSelectionSaver, readAnalyticsSelection, type AnalyticsSelection, type ChartKey, type SaveStatus } from '$lib/analyticsSelection';
	import { analyticsPeriodError, analyticsText, genderPieSlices, type AnalyticsData } from '$lib/analytics';
	import { DISPLAY_LANGUAGES, formatDate, formatMonthYear, localization } from '$lib/localization';

	let data = $state<AnalyticsData | null>(null);
	let loading = $state(true);
	let error = $state<AnalyticsFailure | 'restoreFailed' | null>(null);
	let referenceDate = $state('');
	let today = $state('');
	let referenceDateOpen = $state(false);
	let initialized = false;
	let mounted = false;
	let saver: ReturnType<typeof analyticsSelectionSaver> | null = null;
	let savedSelection = $state.raw<AnalyticsSelection | null>(null);
	let saveStatus = $state<SaveStatus | null>(null);
	let pdfBusy = $state(false);
	let pdfError = $state<AnalyticsFailure | 'pdfError' | null>(null);
	let fromMonth = $state('');
	let toMonth = $state('');
	let periodError = $state<AnalyticsFailure | null>(null);
	type ChartState = { result: AnalyticsData | null; loading: boolean };
	const requests = analyticsRequestGate();
	const newChart = (): ChartState => ({ result: null, loading: false });
	let charts = $state<Record<ChartKey, ChartState>>({ age: newChart(), gender: newChart(), trend: newChart(), turnover: newChart() });
	let updating = $derived(loading || pdfBusy || Object.values(charts).some((chart) => chart.loading));
	let pdfReady = $derived(Boolean(data && !updating && !error && !periodError && analyticsChartKeys.every((key) => {
		const result = charts[key].result;
		return result?.referenceDate === referenceDate && result.period?.fromMonth === fromMonth && result.period?.toMonth === toMonth;
	})));
	let text = $derived(analyticsText($localization.displayLanguage));
	let locale = $derived(DISPLAY_LANGUAGES.find((language) => language.value === $localization.displayLanguage)!.locale);
	let integers = $derived(new Intl.NumberFormat(locale));
	let percentages = $derived(new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 1 }));
	const count = (value: number) => integers.format(value);
	const rate = (value: number | null) => value === null ? text.unavailable : percentages.format(value / 100);
	let slices = $derived(charts.gender.result ? genderPieSlices(charts.gender.result.genders, charts.gender.result.demographicTotal) : []);
	const monthLabel = (value: string) => formatMonthYear(Number(value.slice(0, 4)), Number(value.slice(5)) - 1, $localization);
	let turnoverPoints = $derived(charts.turnover.result?.annual.map((item) => ({ ...item, tooltip: [
		String(item.year), `${text.appliedPeriod}: ${formatDate(item.startDate, $localization)} – ${formatDate(item.endDate, $localization)}`,
		`${text.hiresLabel}: ${count(item.hires)}`, `${text.departuresLabel}: ${count(item.departures)}`,
		`${text.turnoverLabel}: ${rate(item.turnoverRate)}`, `${text.periodStartHeadcount}: ${count(item.startingHeadcount)}`
	].join('\n') })) ?? []);
	async function updateCharts() {
		if (!data) return;
		pdfError = null;
		periodError = analyticsPeriodError(fromMonth, toMonth, data.referenceDate.slice(0, 7));
		if (periodError) return;
		const request = requests.advance();
		for (const key of analyticsChartKeys) charts[key].loading = true;
		try {
			const result = await requestAnalytics({ fromMonth, toMonth, referenceDate: data.referenceDate });
			if (requests.isCurrent(request)) for (const key of analyticsChartKeys) charts[key].result = result;
		} catch (failure) {
			if (requests.isCurrent(request)) periodError = failure instanceof AnalyticsRequestError ? failure.reason : 'error';
		} finally {
			if (requests.isCurrent(request)) for (const key of analyticsChartKeys) charts[key].loading = false;
		}
	}
	async function load() {
		const request = requests.advance();
		const selectedReferenceDate = referenceDate;
		loading = true; error = null;
		try {
			const result = await requestAnalytics({ referenceDate: selectedReferenceDate });
			if (!requests.isCurrent(request)) return;
			data = result;
			if (!today) today = data.referenceDate;
			referenceDate = selectedReferenceDate || data.referenceDate;
			const maxMonth = referenceDate.slice(0, 7);
			toMonth = toMonth ? (toMonth > maxMonth ? maxMonth : toMonth) : maxMonth;
			fromMonth = fromMonth ? (fromMonth > toMonth ? toMonth : fromMonth) : `${String(data.fromYear).padStart(4, '0')}-01`;
			for (const key of analyticsChartKeys) charts[key] = newChart();
			savedSelection = snapshot();
			// Finish the page request before starting the shared chart request.
			loading = false;
			await updateCharts();
		} catch (failure) {
			if (requests.isCurrent(request)) error = failure instanceof AnalyticsRequestError ? failure.reason : 'error';
		} finally { if (requests.isCurrent(request)) loading = false; }
	}
	function snapshot(): AnalyticsSelection {
		const period = analyticsPeriodError(fromMonth, toMonth, referenceDate.slice(0, 7)) ? savedSelection!.charts.trend : { fromMonth, toMonth };
		return { referenceDate, charts: Object.fromEntries(analyticsChartKeys.map((key) => [key, { ...period }])) as AnalyticsSelection['charts'] };
	}
	function save() {
		if (!saver || !savedSelection) return;
		savedSelection = snapshot();
		void saver.enqueue(savedSelection);
	}
	function applyPeriod() {
		periodError = analyticsPeriodError(fromMonth, toMonth, referenceDate.slice(0, 7));
		if (periodError) return;
		save();
		void updateCharts();
	}
	function selectReferenceDate(value: string) {
		referenceDate = value;
		referenceDateOpen = false;
		const maxMonth = value.slice(0, 7);
		const previous = savedSelection!.charts.trend;
		toMonth = previous.toMonth > maxMonth ? maxMonth : previous.toMonth;
		fromMonth = previous.fromMonth > toMonth ? toMonth : previous.fromMonth;
		save();
		void load();
	}
	async function downloadPdf() {
		if (!pdfReady) return;
		const request = requests.current();
		const selection = { referenceDate, fromMonth, toMonth };
		const settings = { ...$localization };
		pdfBusy = true;
		pdfError = null;
		referenceDateOpen = false;
		try {
			const { prepareAnalyticsPdfDownload } = await import('$lib/analyticsPdfDownload');
			const result = await prepareAnalyticsPdfDownload(selection, settings);
			if (!mounted || !requests.isCurrent(request)) return;
			// Keep the screen and report consistent if employee data changed since the page loaded.
			data = result.data;
			for (const key of analyticsChartKeys) charts[key].result = result.data;
			await result.document.save(result.fileName, { returnPromise: true });
		} catch (failure) {
			if (mounted && requests.isCurrent(request)) pdfError = failure instanceof AnalyticsRequestError ? failure.reason : 'pdfError';
		} finally { if (mounted) pdfBusy = false; }
	}
	async function initialize() {
		loading = true; error = null;
		try {
			const settings = await readAnalyticsSelection();
			if (!mounted) return;
			today = settings.today;
			saver = analyticsSelectionSaver(settings.employeeId, (status) => { if (mounted) saveStatus = status; });
			if (settings.selection) {
				referenceDate = settings.selection.referenceDate;
				savedSelection = settings.selection;
				fromMonth = settings.selection.charts.trend.fromMonth;
				toMonth = settings.selection.charts.trend.toMonth;
			}
			initialized = true;
			await load();
		} catch { if (mounted) { error = 'restoreFailed'; loading = false; } }
	}
	onMount(() => { mounted = true; void initialize(); return () => { mounted = false; requests.advance(); }; });
</script>

{#snippet periodStatus(key: ChartKey)}
	{#if charts[key].loading}<p role="status">{text.loading}</p>{/if}
	{#if charts[key].result?.period}
		{@const period = charts[key].result!.period!}
		<p>{text.appliedPeriod}: {monthLabel(period.fromMonth)} – {monthLabel(period.toMonth)} · {text.asOf}: {formatDate(period.endDate, $localization)}</p>
	{/if}
{/snippet}

{#snippet pdfActions()}
	{#if data && !error && charts.trend.result}
		<button type="button" class="app-primary-action pdf-download" disabled={!pdfReady} onclick={downloadPdf}>
			<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m-5-5 5 5 5-5M5 16v4h14v-4" /></svg>
			{pdfBusy ? text.pdfGenerating : text.pdfDownload}
		</button>
	{/if}
{/snippet}
<AssetManagementShell title={text.title} active="">
	<MasterPageHeader title={text.title} description={text.description} actions={pdfActions} />
	{#if pdfBusy}<p class="selection-status" role="status">{text.pdfGenerating}</p>{/if}
	{#if pdfError}<p class="period-error" role="alert">{text[pdfError]}</p>{/if}
	{#if today}
		<div class="analysis-controls">
		<div class="reference-controls"><DatePicker label={text.asOf} helpText={text.referenceDateHelp} helpLabel={`${text.asOf}: ${text.information}`} field="analytics-reference-date" value={referenceDate} min="0001-01-01" max={today} required disabled={updating || !savedSelection} open={referenceDateOpen} onToggle={() => referenceDateOpen = !referenceDateOpen} onSelect={selectReferenceDate} /></div>
		{#if data && savedSelection}
			<div class="shared-period-controls"><AnalyticsPeriodControls id="analytics-period" bind:fromMonth bind:toMonth maxMonth={data.referenceDate.slice(0, 7)} loading={updating} onApply={applyPeriod} /></div>
		{/if}
		</div>
		{#if periodError}<p class="period-error" role="alert">{text[periodError]}</p>{/if}
	{/if}
	{#if saveStatus && saveStatus !== 'saved'}<p class="selection-status" role={saveStatus === 'saveFailed' ? 'alert' : 'status'}>{text[saveStatus]} {#if saveStatus === 'saveFailed'}<button class="app-primary-action" onclick={save}>{text.retry}</button>{/if}</p>{/if}
	{#if loading}
		<p class="status" role="status">{text.loading}</p>
	{:else if error}
		<div class="status" role="alert"><p>{text[error]}</p>{#if error !== 'forbidden'}<button class="app-primary-action" onclick={() => initialized ? load() : initialize()}>{text.retry}</button>{/if}</div>
	{:else if data}
		<div class="analytics-context">
			<p class="limitation">{text.limitation}</p>
		</div>
		<div class="metrics">
			{#each [
				{ label: text.headcount, value: count(data.summary.headcount), note: text.current },
				{ label: text.hires, value: count(data.summary.hires), note: text.ytd },
				{ label: text.departures, value: count(data.summary.departures), note: text.ytd },
				{ label: text.turnover, value: rate(data.summary.turnoverRate), note: text.ytd }
			] as metric}
				<section class="metric" title={metric.label === text.turnover ? text.summaryFormula : undefined}><h2>{metric.label}</h2><strong>{metric.value}</strong><p>{metric.note}</p></section>
			{/each}
		</div>
		<div class="charts">
			<section class="panel" aria-busy={charts.age.loading}>
				<header class="panel-header"><h2>{text.age}</h2></header>
				<p>{text.ageNote}</p>
				{@render periodStatus('age')}
				{#if charts.age.result}
					{#if charts.age.result.demographicTotal}
						<AnalyticsChart title={text.age} type="bar" axisLabel={text.employees} formatTick={count} showValues points={charts.age.result.ageGroups.map((group) => ({ label: text.ageLabels[group.key], value: group.count, formatted: count(group.count) }))} />
					{:else}<p class="empty">{text.empty}</p>{/if}
				{/if}
			</section>
			<section class="panel" aria-busy={charts.gender.loading}>
				<header class="panel-header"><h2>{text.gender}</h2></header>
				<p>{text.genderNote}</p>
				{@render periodStatus('gender')}
				{#if charts.gender.result}
				{#if charts.gender.result.demographicTotal}
					<div class="gender-chart">
						<svg viewBox="-45 0 350 280" role="img" aria-label={text.gender}><title>{text.gender}</title><desc>{text.total}: {count(charts.gender.result.demographicTotal)}; {slices.map((slice) => `${text.genderLabels[slice.key]}: ${count(slice.count)} (${rate(slice.share * 100)})`).join('; ')}</desc>
							{#each slices.filter((slice) => slice.count > 0) as slice}
								{#if slice.share === 1}<circle cx="130" cy="130" r="110" fill={slice.color}><title>{text.genderLabels[slice.key]}: {count(slice.count)} ({rate(slice.share * 100)})</title></circle>
								{:else}<path d={slice.path} fill={slice.color}><title>{text.genderLabels[slice.key]}: {count(slice.count)} ({rate(slice.share * 100)})</title></path>{/if}
							{/each}
							<circle cx="130" cy="130" r="48" class="pie-center" />
							<text x="130" y="119" text-anchor="middle" class="pie-total-label">{text.total}</text>
							<text x="130" y="147" text-anchor="middle" class="pie-total-count">{count(charts.gender.result.demographicTotal)}</text>
							{#each slices.filter((slice) => slice.count > 0) as slice}
								{#if slice.outside}<path d={`M${slice.edgeX},${slice.edgeY} L${slice.right ? 248 : 12},${slice.labelY}`} class="pie-callout" />{/if}
								<text x={slice.labelX} y={slice.labelY - 3} text-anchor={slice.outside ? slice.right ? 'start' : 'end' : 'middle'} class="pie-value" class:outside={slice.outside}><tspan x={slice.labelX}>{count(slice.count)}</tspan><tspan x={slice.labelX} dy="14">{rate(slice.share * 100)}</tspan></text>
							{/each}
						</svg>
						<ul class="legend">{#each slices as slice}<li><span class="swatch" style:background={slice.color}></span><span>{text.genderLabels[slice.key]}</span><strong>{count(slice.count)} <small>({rate(slice.share * 100)})</small></strong></li>{/each}</ul>
					</div>
				{:else}<p class="empty">{text.empty}</p>{/if}
				{/if}
			</section>
			<section class="panel" aria-busy={charts.trend.loading}>
				<header class="panel-header"><h2>{text.trend}</h2></header>
				<p>{text.trendNote}</p>
				{@render periodStatus('trend')}
				{#if charts.trend.result}<AnalyticsChart title={text.trend} type="line" axisLabel={text.employees} formatTick={count} showValues points={charts.trend.result.annual.map((item) => ({ label: String(item.year), value: item.headcount, formatted: `${count(item.headcount)} · ${formatDate(item.endDate, $localization)}` }))} />{/if}
			</section>
			<section class="panel" aria-busy={charts.turnover.loading}>
				<header class="panel-header"><h2>{text.rates}</h2></header>
				{@render periodStatus('turnover')}
				{#if charts.turnover.result}<AnalyticsTurnoverChart points={turnoverPoints} formatCount={count} formatRate={rate} />{/if}
				<p>{text.formula}</p>
			</section>
		</div>
	{/if}
</AssetManagementShell>

<style>
	.pdf-download{display:inline-flex;align-items:center;justify-content:center;gap:6px}.pdf-download svg{width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
	.analysis-controls{display:flex;align-items:flex-start;flex-wrap:wrap;gap:16px;margin:0 0 16px;min-width:0}
	.analysis-controls :global(.custom-date .required){display:none}
	.reference-controls{width:180px;max-width:100%;min-width:0}
	.shared-period-controls{width:340px;max-width:100%;min-width:0}
	.period-error{font-size:12px;color:var(--danger);margin:0 0 16px;overflow-wrap:anywhere}
	.selection-status{font-size:12px;color:var(--muted);margin:0 0 16px;overflow-wrap:anywhere}
	.analytics-context{display:flex;align-items:flex-start;flex-wrap:wrap;gap:8px 24px;min-width:0}
	.limitation{margin:0;min-width:0;color:var(--muted);font-size:12px;overflow-wrap:anywhere;flex:1 1 420px}
	.metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px;margin:20px 0}
	.metric,.panel{min-width:0;max-width:100%;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);box-shadow:var(--shadow);padding:20px}
	.metric h2{margin:0 0 10px;font-size:13px;font-weight:500;color:var(--muted)}
	.metric strong{font-size:30px;line-height:1.3;overflow-wrap:anywhere}
	.metric p,.panel p{font-size:12px;color:var(--muted);margin:8px 0 14px;overflow-wrap:anywhere}
	.metric p{margin-bottom:0}.charts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px}
	.panel h2{margin:0;font-size:16px;font-weight:600}
	.panel-header{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:12px;min-width:0}
	.panel-header h2{flex:1;min-width:0;overflow-wrap:anywhere}
	.gender-chart{display:flex;align-items:center;justify-content:center;gap:16px;min-height:270px;flex-wrap:wrap}
	.gender-chart svg{width:300px;max-width:100%;flex:0 1 300px}
	.pie-center{fill:var(--surface)}.pie-total-label{fill:var(--muted);font-size:11px}.pie-total-count{fill:var(--text);font-size:27px;font-weight:700}
	.pie-value{fill:#fff;font-size:12px;font-weight:600}.pie-value.outside{fill:var(--text)}.pie-callout{fill:none;stroke:var(--muted);stroke-width:1}
	.legend{list-style:none;padding:0;margin:0;min-width:0;flex:1 1 180px;max-width:100%;font-size:12px}
	.legend li{display:grid;grid-template-columns:10px minmax(0,1fr) auto;align-items:center;gap:8px;margin:12px 0}
	.legend span,.legend strong{overflow-wrap:anywhere}.swatch{width:10px;height:10px;border-radius:2px}
	.legend small{font-weight:400;color:var(--muted)}
	.status{padding:24px;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius)}
	.empty{display:grid;place-items:center;min-height:200px}
	@media(max-width:1100px){.metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.charts{grid-template-columns:minmax(0,1fr)}}
	@media(max-width:700px){.reference-controls,.shared-period-controls,.pdf-download{width:100%}}
	@media(max-width:500px){.metrics{grid-template-columns:minmax(0,1fr)}.metric,.panel{padding:16px}.gender-chart{gap:0}.legend{flex-basis:100%}}
</style>
