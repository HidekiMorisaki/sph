<script lang="ts">
	import { onMount } from 'svelte';
	import AssetManagementShell from '$lib/components/AssetManagementShell.svelte';
	import MasterPageHeader from '$lib/components/MasterPageHeader.svelte';
	import AnalyticsChart from '$lib/components/AnalyticsChart.svelte';
	import AnalyticsHeadcountAgeChart from '$lib/components/AnalyticsHeadcountAgeChart.svelte';
	import AnalyticsPeriodControls from '$lib/components/AnalyticsPeriodControls.svelte';
	import AnalyticsTurnoverChart from '$lib/components/AnalyticsTurnoverChart.svelte';
	import DatePicker from '$lib/components/DatePicker.svelte';
	import StatusNotice from '$lib/components/StatusNotice.svelte';
	import { analyticsRequestGate, AnalyticsRequestError, requestAnalytics, type AnalyticsFailure } from '$lib/analyticsRequests';
	import { analyticsChartKeys, analyticsSelectionSaver, readAnalyticsSelection, type AnalyticsSelection, type ChartKey, type SaveStatus } from '$lib/analyticsSelection';
	import { analyticsPeriodError, analyticsText, genderPieSlices, visibleAgeGroups, type AnalyticsData } from '$lib/analytics';
	import { DISPLAY_LANGUAGES, localization } from '$lib/localization';

	let data = $state<AnalyticsData | null>(null);
	let loading = $state(true);
	let error = $state<AnalyticsFailure | 'restoreFailed' | null>(null);
	let errorDismissed = $state(false);
	let referenceDate = $state('');
	let today = $state('');
	let referenceDateOpen = $state(false);
	let initialized = false;
	let mounted = false;
	let saver: ReturnType<typeof analyticsSelectionSaver> | null = null;
	let savedSelection = $state.raw<AnalyticsSelection | null>(null);
	let saveStatus = $state<SaveStatus | null>(null);
	let pdfBusy = $state(false);
	let pdfBusyDismissed = $state(false);
	let pdfError = $state<AnalyticsFailure | 'pdfError' | null>(null);
	let periodErrorDismissed = $state(false);
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
	let ages = $derived(new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }));
	const count = (value: number) => integers.format(value);
	const rate = (value: number | null) => value === null ? text.unavailable : percentages.format(value / 100);
	const age = (value: number | null) => value === null ? text.unavailable : `${ages.format(value)} ${text.averageAgeUnit}`;
	let referenceAverageAge = $derived(data?.annual.at(-1)?.averageAge ?? null);
	let slices = $derived(charts.gender.result ? genderPieSlices(charts.gender.result.genders.filter((group) => group.key !== 'other'), charts.gender.result.demographicTotal) : []);
	let visibleSlices = $derived(slices.filter((slice) => slice.count > 0));
	let selectedPie = $state<number | null>(null);
	let pieAreaWidth = $state(300), pieAreaHeight = $state(240);
	let pieTooltipX = $state(150), pieTooltipY = $state(0);
	let pieTooltipWidth = $state(150), pieTooltipHeight = $state(60);
	function trackPiePointer(event: PointerEvent) {
		if (!visibleSlices.length) return;
		const bounds = (event.currentTarget as HTMLDivElement).getBoundingClientRect();
		pieTooltipX = event.clientX - bounds.left;
		pieTooltipY = event.clientY - bounds.top;
		const segment = event.target instanceof Element ? event.target.closest('.pie-segment') : null;
		if (segment) {
			selectedPie = Number(segment.getAttribute('data-slice-index'));
			return;
		}
		const x = pieTooltipX / bounds.width * 350 - 45;
		const y = pieTooltipY / bounds.height * 280;
		if (Math.hypot(x - 130, y - 130) < 25) { selectedPie ??= 0; return; }
		const angle = (Math.atan2(y - 130, x - 130) + Math.PI / 2 + Math.PI * 2) % (Math.PI * 2);
		let end = 0;
		for (const [index, slice] of visibleSlices.entries()) {
			end += slice.share * Math.PI * 2;
			if (angle <= end) { selectedPie = index; return; }
		}
		selectedPie = visibleSlices.length - 1;
	}
	let turnoverPoints = $derived(charts.turnover.result?.annual.map((item) => ({ ...item, tooltip: [
		String(item.year),
		`${text.hiresLabel}: ${count(item.hires)}`, `${text.departuresLabel}: ${count(item.departures)}`,
		`${text.turnoverLabel}: ${rate(item.turnoverRate)}`
	].join('\n') })) ?? []);
	async function updateCharts() {
		if (!data) return;
		pdfError = null;
		periodErrorDismissed = false; periodError = analyticsPeriodError(fromMonth, toMonth, data.referenceDate.slice(0, 7));
		if (periodError) return;
		const request = requests.advance();
		for (const key of analyticsChartKeys) charts[key].loading = true;
		try {
			const result = await requestAnalytics({ fromMonth, toMonth, referenceDate: data.referenceDate });
			if (requests.isCurrent(request)) for (const key of analyticsChartKeys) charts[key].result = result;
		} catch (failure) {
			if (requests.isCurrent(request)) { periodErrorDismissed = false; periodError = failure instanceof AnalyticsRequestError ? failure.reason : 'error'; }
		} finally {
			if (requests.isCurrent(request)) for (const key of analyticsChartKeys) charts[key].loading = false;
		}
	}
	async function load() {
		const request = requests.advance();
		const selectedReferenceDate = referenceDate;
		loading = true; error = null; errorDismissed = false;
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
		periodErrorDismissed = false; periodError = analyticsPeriodError(fromMonth, toMonth, referenceDate.slice(0, 7));
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
		pdfBusyDismissed = false;
		pdfError = null;
		referenceDateOpen = false;
		try {
			const { prepareAnalyticsPdfDownload } = await import('$lib/analyticsPdfDownload');
			const result = await prepareAnalyticsPdfDownload(selection, settings);
			const referenceResult = await requestAnalytics({ referenceDate: selection.referenceDate });
			if (!mounted || !requests.isCurrent(request)) return;
			// Keep the summary at the reference date even when the PDF uses a shorter chart period.
			data = referenceResult;
			for (const key of analyticsChartKeys) charts[key].result = result.data;
			await result.document.save(result.fileName, { returnPromise: true });
		} catch (failure) {
			if (mounted && requests.isCurrent(request)) pdfError = failure instanceof AnalyticsRequestError ? failure.reason : 'pdfError';
		} finally { if (mounted) pdfBusy = false; }
	}
	async function initialize() {
		loading = true; error = null; errorDismissed = false;
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

{#snippet chartStatus(key: ChartKey)}
	{#if charts[key].loading}<p role="status">{text.loading}</p>{/if}
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
	{#if pdfBusy && !pdfBusyDismissed}<StatusNotice message={text.pdfGenerating} tone="info" onDismiss={() => pdfBusyDismissed = true} />{/if}
	{#if pdfError}<StatusNotice message={text[pdfError]} tone="error" onDismiss={() => pdfError = null} />{/if}
	{#if today}
		<div class="analysis-controls">
		<div class="reference-controls"><DatePicker label={text.asOf} helpText={text.referenceDateHelp} helpLabel={`${text.asOf}: ${text.information}`} field="analytics-reference-date" value={referenceDate} min="0001-01-01" max={today} required disabled={updating || !savedSelection} open={referenceDateOpen} onToggle={() => referenceDateOpen = !referenceDateOpen} onSelect={selectReferenceDate} /></div>
		{#if data && savedSelection}
			<div class="shared-period-controls"><AnalyticsPeriodControls id="analytics-period" bind:fromMonth bind:toMonth maxMonth={data.referenceDate.slice(0, 7)} loading={updating} onApply={applyPeriod} /></div>
		{/if}
		</div>
		{#if periodError && !periodErrorDismissed}<StatusNotice message={text[periodError]} tone="error" onDismiss={() => periodErrorDismissed = true} />{/if}
	{/if}
	{#if saveStatus && saveStatus !== 'saved'}<StatusNotice message={text[saveStatus]} tone={saveStatus === 'saveFailed' ? 'error' : 'info'} onDismiss={() => saveStatus = null} />{#if saveStatus === 'saveFailed'}<button class="app-primary-action" onclick={save}>{text.retry}</button>{/if}{/if}
	{#if loading}
		<p class="status" role="status">{text.loading}</p>
	{:else if error}
		<div class="status">{#if !errorDismissed}<StatusNotice message={text[error]} tone="error" onDismiss={() => errorDismissed = true} />{/if}{#if error !== 'forbidden'}<button class="app-primary-action" onclick={() => initialized ? load() : initialize()}>{text.retry}</button>{/if}</div>
	{:else if data}
		<div class="analytics-context">
			<p class="limitation">{text.limitation}</p>
		</div>
		<div class="metrics">
			{#each [
				{ label: text.headcount, value: count(data.summary.headcount), unit: text.peopleUnit, note: text.current },
				{ label: text.hires, value: count(data.summary.hires), unit: text.peopleUnit, note: text.ytd },
				{ label: text.departures, value: count(data.summary.departures), unit: text.peopleUnit, note: text.ytd },
				{ label: text.referenceAverageAge, value: referenceAverageAge === null ? text.unavailable : ages.format(referenceAverageAge), unit: referenceAverageAge === null ? '' : text.averageAgeUnit, note: text.referenceAverageAgeNote },
				{ label: text.turnover, value: data.summary.turnoverRate === null ? text.unavailable : rate(data.summary.turnoverRate).replace(/\s*%$/, ''), unit: data.summary.turnoverRate === null ? '' : '%', note: text.ytd }
			] as metric}
				<section class="metric" title={metric.label === text.turnover ? text.summaryFormula : undefined}><h2>{metric.label}</h2><strong>{metric.value}{#if metric.unit}<span class="metric-unit">{metric.unit}</span>{/if}</strong><p>{metric.note}</p></section>
			{/each}
		</div>
		<div class="charts">
			<section class="panel turnover-panel" aria-busy={charts.turnover.loading}>
				<header class="panel-header"><h2>{text.rates}</h2></header>
				{@render chartStatus('turnover')}
				{#if charts.turnover.result}<AnalyticsTurnoverChart points={turnoverPoints} formatCount={count} formatRate={rate} />{/if}
				<p>{text.formula}</p>
			</section>
			<section class="panel gender-panel" aria-busy={charts.gender.loading}>
				<header class="panel-header"><h2>{text.gender}</h2></header>
				<p>{text.genderNote}</p>
				{@render chartStatus('gender')}
				{#if charts.gender.result}
				{#if charts.gender.result.demographicTotal}
					<div class="gender-chart">
						<div class="pie-visual" role="group" aria-label={text.gender} bind:clientWidth={pieAreaWidth} bind:clientHeight={pieAreaHeight} onpointerenter={trackPiePointer} onpointermove={trackPiePointer} onpointerleave={() => selectedPie = null}>
						<svg viewBox="-45 0 350 280" role="group" aria-label={text.gender}><desc>{text.total}: {count(charts.gender.result.demographicTotal)}; {slices.map((slice) => `${text.genderLabels[slice.key]}: ${count(slice.count)} (${rate(slice.share * 100)})`).join('; ')}</desc>
							{#each visibleSlices as slice, index}
								<g class="pie-segment" data-slice-index={index} class:pie-active={selectedPie === index} tabindex="0" role="button" aria-label={`${text.genderLabels[slice.key]}: ${count(slice.count)} (${rate(slice.share * 100)})`} onfocus={() => selectedPie = index} onblur={() => selectedPie = null} onclick={() => selectedPie = index} onkeydown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectedPie = index; } else if (event.key === 'Escape') selectedPie = null; }}>
									{#if slice.share === 1}<circle cx="130" cy="130" r="110" fill={slice.color} />
									{:else}<path d={slice.path} fill={slice.color} />{/if}
								</g>
							{/each}
							<circle cx="130" cy="130" r="48" class="pie-center" />
							<text x="130" y="119" text-anchor="middle" class="pie-total-label">{text.total}</text>
							<text x="130" y="147" text-anchor="middle" class="pie-total-count">{count(charts.gender.result.demographicTotal)}</text>
							{#each visibleSlices as slice}
								{#if slice.outside}<path d={`M${slice.edgeX},${slice.edgeY} L${slice.right ? 248 : 12},${slice.labelY}`} class="pie-callout" />{/if}
								<text x={slice.labelX} y={slice.labelY - 3} text-anchor={slice.outside ? slice.right ? 'start' : 'end' : 'middle'} class="pie-value" class:outside={slice.outside}><tspan x={slice.labelX}>{count(slice.count)}</tspan><tspan x={slice.labelX} dy="14">{rate(slice.share * 100)}</tspan></text>
							{/each}
						</svg>
						{#if selectedPie !== null && visibleSlices[selectedPie]}
							{@const selectedSlice = visibleSlices[selectedPie]}
							<div class="pie-tooltip" role="tooltip" bind:clientWidth={pieTooltipWidth} bind:clientHeight={pieTooltipHeight} style:left={`${Math.max(pieTooltipWidth / 2 + 8, Math.min(pieAreaWidth - pieTooltipWidth / 2 - 8, pieTooltipX))}px`} style:top={`${Math.max(8, Math.min(pieAreaHeight - pieTooltipHeight - 8, pieTooltipY + 12))}px`}><strong>{text.genderLabels[selectedSlice.key]}</strong><span class="pie-tooltip-value"><i class="pie-color-ball" style:background={selectedSlice.color} aria-hidden="true"></i>{count(selectedSlice.count)} · {rate(selectedSlice.share * 100)}</span></div>
						{/if}
						</div>
						<ul class="legend">{#each slices as slice}<li><span class="swatch" style:background={slice.color}></span><span>{text.genderLabels[slice.key]}</span></li>{/each}</ul>
					</div>
				{:else}<p class="empty">{text.empty}</p>{/if}
				{/if}
			</section>
			<section class="panel combined-panel" aria-busy={charts.trend.loading}>
				<header class="panel-header"><h2>{text.headcountAgeTrend}</h2></header>
				<p>{text.headcountAgeNote}</p>
				{@render chartStatus('trend')}
				{#if charts.trend.result}<div class="chart-visual"><AnalyticsHeadcountAgeChart points={charts.trend.result.annual} formatCount={count} formatAge={age} /></div>{/if}
			</section>
			<section class="panel age-panel" aria-busy={charts.age.loading}>
				<header class="panel-header"><h2>{text.age}</h2></header>
				<p>{text.ageNote}</p>
				{@render chartStatus('age')}
				{#if charts.age.result}
					{#if charts.age.result.demographicTotal}
						<div class="chart-visual"><AnalyticsChart title={text.age} type="bar" axisLabel={text.employees} formatTick={count} showValues points={visibleAgeGroups(charts.age.result.ageGroups).map((group) => ({ label: text.ageLabels[group.key], value: group.count, formatted: count(group.count) }))} /></div>
					{:else}<p class="empty">{text.empty}</p>{/if}
				{/if}
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

	.analytics-context{display:flex;align-items:flex-start;flex-wrap:wrap;gap:8px 24px;min-width:0}
	.limitation{margin:0;min-width:0;color:var(--muted);font-size:var(--font-size-support);overflow-wrap:anywhere;flex:1 1 420px}
	.metrics{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:16px;margin:20px 0}
	.metric,.panel{min-width:0;max-width:100%;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);box-shadow:var(--shadow);padding:20px}
	.metric h2{margin:0 0 10px;font-size:var(--font-size-section);font-weight:500;color:var(--muted)}
	.metric strong{font-size:30px;line-height:1.3;overflow-wrap:anywhere}
	.metric-unit{margin-left:6px;font-size:16px;font-weight:500;color:var(--muted)}
	.metric p,.panel p{font-size:var(--font-size-support);color:var(--muted);margin:8px 0 14px;overflow-wrap:anywhere}
	.metric p{margin-bottom:0}.charts{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:20px}
	.panel h2{margin:0;font-size:var(--font-size-section);font-weight:600}
	.turnover-panel,.combined-panel{grid-column:span 3}
	.gender-panel,.age-panel{grid-column:span 2}
	.combined-panel,.age-panel{display:flex;flex-direction:column}
	.chart-visual{margin-top:auto;min-width:0}
	.panel-header{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:12px;min-width:0}
	.panel-header h2{flex:1;min-width:0;overflow-wrap:anywhere}
	.gender-chart{display:flex;align-items:center;justify-content:center;gap:16px;min-height:270px;padding-top:20px;flex-wrap:wrap}
	.pie-visual{position:relative;width:334px;max-width:100%;flex:0 1 334px}.gender-chart svg{display:block;width:100%;max-width:100%}
	.pie-segment{transform-box:view-box;transform-origin:175px 130px;transition:filter .18s,transform .18s;cursor:pointer}.pie-segment.pie-active,.pie-segment:focus-visible{filter:brightness(1.14);transform:scale(1.025);outline:none}
	.pie-segment path,.pie-segment circle{transform-box:view-box;transform-origin:175px 130px;animation:pie-enter .75s cubic-bezier(.2,.7,.2,1) both}
	.pie-tooltip{position:absolute;z-index:1;display:flex;flex-direction:column;gap:3px;box-sizing:border-box;width:max-content;max-width:85%;padding:9px 12px;border:1px solid var(--border);border-radius:8px;background:var(--surface);box-shadow:0 8px 24px rgba(0,0,0,.16);color:var(--text);font-size:var(--font-size-support);pointer-events:none;overflow-wrap:anywhere;transform:translateX(-50%);transition:left .14s ease-out,top .14s ease-out}.pie-tooltip strong{font-weight:500;color:var(--muted)}.pie-tooltip-value{display:flex;align-items:center;gap:7px;color:var(--text-secondary)}.pie-color-ball{flex:none;width:9px;height:9px;border-radius:50%}
	@keyframes pie-enter{from{opacity:0;transform:scale(.3)}to{opacity:1;transform:scale(1)}}
	@media(prefers-reduced-motion:reduce){.pie-segment,.pie-tooltip{transition:none}.pie-segment path,.pie-segment circle{animation:none}}
	.pie-center{fill:var(--surface)}.pie-total-label{fill:var(--muted);font-size:var(--font-size-support)}.pie-total-count{fill:var(--text);font-size:27px;font-weight:700}
	.pie-value{fill:#fff;font-size:var(--font-size-support);font-weight:600}.pie-value.outside{fill:var(--text)}.pie-callout{fill:none;stroke:var(--muted);stroke-width:1}
	.legend{list-style:none;padding:0;margin:0;min-width:0;flex:1 1 180px;max-width:100%;font-size:var(--font-size-support)}
	.legend li{display:grid;grid-template-columns:10px minmax(0,1fr);align-items:center;gap:8px;margin:12px 0}
	.legend span{overflow-wrap:anywhere}.swatch{width:10px;height:10px;border-radius:2px}
	.status{padding:24px;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius)}
	.empty{display:grid;place-items:center;min-height:200px}
	@media(max-width:1280px){.charts{grid-template-columns:repeat(2,minmax(0,1fr))}.turnover-panel,.gender-panel,.combined-panel,.age-panel{grid-column:span 1}}
	@media(max-width:1100px){.metrics{grid-template-columns:repeat(2,minmax(0,1fr))}}
	@media(max-width:1000px){.charts{grid-template-columns:minmax(0,1fr)}.combined-panel,.age-panel{align-self:start}.chart-visual{margin-top:0}}
	@media(max-width:700px){.reference-controls,.shared-period-controls,.pdf-download{width:100%}}
	@media(max-width:500px){.metrics{grid-template-columns:minmax(0,1fr)}.metric,.panel{padding:16px}.gender-chart{gap:0}.legend{flex-basis:100%}}
</style>
