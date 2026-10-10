<script lang="ts">
	import { niceAxis } from '$lib/chartAxis';
	import { formatFinancialAmount } from '$lib/financial-currency';
	import { financialTrendSegmentValue, financialTrendSeries, type FinancialTrend, type FinancialTrendSegment } from '$lib/financialTrendsData';
	import { DISPLAY_LANGUAGES, localization } from '$lib/localization';

	type Labels = { chartTitle: string; amountAxis: string; yearAxis: string; variableLegend: string; fixedLegend: string; profitLegend: string; lossLegend: string; netProfit: string };
	let { points, labels, currency }: { points: FinancialTrend[]; labels: Labels; currency: 'JPY' | 'USD' } = $props();
	const series = financialTrendSeries;
	let visible = $state<Record<FinancialTrendSegment, boolean>>({ variableCost: true, fixedCost: true, profit: true, loss: true });
	const left = 82, right = 28, top = 48, bottom = 58, plotHeight = 300;
	let containerWidth = $state(0);
	let chartWidth = $derived(Math.max(720, containerWidth, points.length * 86 + left + right));
	let plotWidth = $derived(chartWidth - left - right);
	let spacing = $derived(plotWidth / Math.max(1, points.length));
	let barWidth = $derived(Math.min(68, plotWidth / Math.max(1, points.length) * 0.78));
	let selected = $state<number | null>(null);
	let tooltipX = $state(0), tooltipY = $state(0);
	let tooltipWidth = $state(270), tooltipHeight = $state(145);
	const svgHeight = top + plotHeight + bottom;
	function stackTotal(point: FinancialTrend): number {
		return series.reduce((sum, item) => sum + (visible[item.key] ? financialTrendSegmentValue(point, item.key) : 0), 0);
	}
	function below(point: FinancialTrend, key: FinancialTrendSegment): number {
		let sum = 0;
		for (const item of series) {
			if (item.key === key) break;
			if (visible[item.key]) sum += financialTrendSegmentValue(point, item.key);
		}
		return sum;
	}
	let axis = $derived(niceAxis(points.map(stackTotal), currency === 'JPY' ? 1 : 0.01));
	const x = (index: number) => left + (index + 0.5) * plotWidth / Math.max(1, points.length);
	const y = (value: number) => top + plotHeight - value / axis.maximum * plotHeight;
	let locale = $derived(DISPLAY_LANGUAGES.find((item) => item.value === $localization.displayLanguage)!.locale);
	function chartUnit(maximum: number, language: string) {
		const choices = language.startsWith('ja')
			? [{ factor: 1e12, suffix: '兆' }, { factor: 1e8, suffix: '億' }, { factor: 1e4, suffix: '万' }]
			: [{ factor: 1e12, suffix: 'T' }, { factor: 1e9, suffix: 'B' }, { factor: 1e6, suffix: 'M' }, { factor: 1e3, suffix: 'K' }];
		return choices.find((item) => maximum >= item.factor) ?? { factor: 1, suffix: '' };
	}
	let unit = $derived(chartUnit(axis.maximum, locale));
	let numberFormat = $derived(new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }));
	let smallNumberFormat = $derived(new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }));
	let compactFormat = $derived(new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }));
	function tickLabel(value: number) { return value === 0 ? '0' : `${numberFormat.format(value / unit.factor)}${unit.suffix}`; }
	function profitLabel(value: number) { return `${value > 0 ? '+' : ''}${compactFormat.format(value)}`; }
	function segmentLabel(value: number) {
		const scaled = value / unit.factor;
		return (scaled < 1 ? smallNumberFormat : numberFormat).format(scaled);
	}
	function amount(value: number) {
		return formatFinancialAmount(currency === 'JPY' ? String(Math.round(value)) : value.toFixed(2), currency, $localization.displayLanguage) ?? '';
	}
	function selectPoint(index: number) { selected = index; tooltipX = x(index); tooltipY = top; }
	function trackPointer(event: PointerEvent) {
		if (!points.length) return;
		const bounds = (event.currentTarget as SVGSVGElement).getBoundingClientRect();
		const pointerX = (event.clientX - bounds.left) / bounds.width * chartWidth;
		tooltipX = pointerX;
		tooltipY = (event.clientY - bounds.top) / bounds.height * svgHeight;
		selected = Math.max(0, Math.min(points.length - 1, Math.floor((pointerX - left) / spacing)));
	}
	function tooltipDescription(point: FinancialTrend) {
		const balance = point.netProfit === null ? null : Number(point.netProfit);
		return `${point.year}, ${labels.variableLegend}: ${point.variableCost === null ? '-' : amount(Number(point.variableCost))}, ${labels.fixedLegend}: ${point.fixedCost === null ? '-' : amount(Number(point.fixedCost))}, ${labels.netProfit}: ${balance === null ? '-' : amount(balance)}`;
	}
</script>

<div class="legend" role="group" aria-label={labels.chartTitle}>
	{#each series as item}
		<button type="button" class="legend-item" class:muted={!visible[item.key]} aria-pressed={visible[item.key]} onclick={() => visible[item.key] = !visible[item.key]}>
			<span class="swatch" style:background={item.color} aria-hidden="true"></span>{labels[item.label]}
		</button>
	{/each}
</div>
<div class="chart-scroll" bind:clientWidth={containerWidth}>
	<div class="canvas" style:width={`${chartWidth}px`}>
	<svg viewBox={`0 0 ${chartWidth} ${svgHeight}`} role="group" aria-label={labels.chartTitle} onpointerenter={trackPointer} onpointermove={trackPointer} onpointerleave={() => selected = null}>
		<desc>{labels.amountAxis} ({currency}); {labels.yearAxis}: {points.map((item) => item.year).join(', ')}</desc>
		<rect x="0" y="0" width={chartWidth} height={svgHeight} class="interaction-surface" aria-hidden="true" />
		{#if selected !== null && points[selected]}
			<rect x={left + selected * spacing} y={top} width={spacing} height={plotHeight} class="hover-band" />
			<line x1={x(selected)} x2={x(selected)} y1={top} y2={top + plotHeight} class="hover-guide" />
		{/if}
		{#each axis.ticks as tick}
			<line x1={left} x2={chartWidth - right} y1={y(tick)} y2={y(tick)} class="grid" />
			<text x={left - 10} y={y(tick) + 4} text-anchor="end">{tickLabel(tick)}</text>
		{/each}
		<text x={left} y="15" class="axis-title">{labels.amountAxis} ({currency})</text>
		{#each points as point, index}
			{#each series as item}
				{#if visible[item.key] && financialTrendSegmentValue(point, item.key) > 0}
					{@const value = financialTrendSegmentValue(point, item.key)}
					{@const segmentHeight = value / axis.maximum * plotHeight}
					{@const segmentTop = y(below(point, item.key) + value)}
					<rect x={x(index) - barWidth / 2} y={segmentTop} width={barWidth} height={segmentHeight} fill={item.color} class:active={selected === index} />
					{#if segmentHeight >= 26 && barWidth >= 50}
						<text x={x(index)} y={segmentTop + segmentHeight / 2 + 5} text-anchor="middle" class="segment-label">{segmentLabel(value)}</text>
					{/if}
				{/if}
			{/each}
			{#if point.netProfit !== null && Number.isFinite(Number(point.netProfit))}
				{@const balance = Number(point.netProfit)}
				{#if balance === 0 || (balance > 0 ? visible.profit : visible.loss)}
					<text x={x(index)} y={Math.max(top - 8, y(stackTotal(point)) - 8)} text-anchor="middle" class="profit-label" class:negative={balance < 0} class:positive={balance > 0}>{profitLabel(balance)}</text>
				{/if}
			{/if}
			<text x={x(index)} y={top + plotHeight + 23} text-anchor="middle" class:axis-active={selected === index}>{point.year}</text>
		{/each}
		<text x={left + plotWidth / 2} y={top + plotHeight + 50} text-anchor="middle" class="axis-title">{labels.yearAxis}</text>
		{#each points as point, index}
			<g tabindex="0" role="button" aria-label={tooltipDescription(point)} onfocus={() => selectPoint(index)} onblur={() => selected = null} onclick={() => selectPoint(index)} onkeydown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectPoint(index); } else if (event.key === 'Escape') selected = null; }}>
				<rect x={left + index * spacing} y={top - 20} width={spacing} height={plotHeight + 48} class="hit-area" />
			</g>
		{/each}
	</svg>
	{#if selected !== null && points[selected]}
		{@const point = points[selected]}
		{@const balance = point.netProfit === null ? null : Number(point.netProfit)}
		<div class="tooltip" role="tooltip" bind:clientWidth={tooltipWidth} bind:clientHeight={tooltipHeight} style:left={`${Math.max(tooltipWidth / 2 + 8, Math.min(chartWidth - tooltipWidth / 2 - 8, tooltipX))}px`} style:top={`${Math.max(8, Math.min(svgHeight - tooltipHeight - 8, tooltipY + 14))}px`}>
			<strong>{point.year}</strong>
			<div class="tooltip-grid">
				<div class="tooltip-row"><i class="color-ball" style:background={series[0].color} aria-hidden="true"></i><span class="tooltip-label">{labels.variableLegend}</span><span class="tooltip-amount">{point.variableCost === null ? '-' : amount(Number(point.variableCost))}</span></div>
				<div class="tooltip-row"><i class="color-ball" style:background={series[1].color} aria-hidden="true"></i><span class="tooltip-label">{labels.fixedLegend}</span><span class="tooltip-amount">{point.fixedCost === null ? '-' : amount(Number(point.fixedCost))}</span></div>
				<div class="tooltip-row"><i class="color-ball" style:background={balance !== null && balance < 0 ? series[3].color : series[2].color} aria-hidden="true"></i><span class="tooltip-label">{labels.netProfit}</span><span class="tooltip-amount" class:negative={balance !== null && balance < 0}>{balance === null ? '-' : amount(balance)}</span></div>
			</div>
		</div>
	{/if}
	</div>
</div>

<style>
	.legend{display:flex;flex-wrap:wrap;gap:6px 16px;margin:0 0 14px}
	.legend-item{display:inline-flex;align-items:center;gap:6px;margin:0;padding:4px 2px;border:0;background:transparent;color:var(--text);font:inherit;font-size:var(--font-size-support);cursor:pointer}
	.legend-item:hover{color:var(--action-primary)}.legend-item:focus-visible{outline:2px solid var(--action-primary);outline-offset:2px}.legend-item.muted{opacity:.55;text-decoration:line-through}
	.swatch{width:12px;height:12px;flex:none;border-radius:50%}
	.chart-scroll{max-width:100%;overflow-x:auto}.canvas{position:relative;max-width:none}svg{display:block;width:100%;height:auto;font-family:inherit}text{fill:var(--text-secondary);font-size:12px}.axis-title{fill:var(--text);font-weight:600}.grid{stroke:var(--border);stroke-width:1}.segment-label{fill:#182331;font-size:14px;font-weight:700;pointer-events:none}.profit-label{fill:var(--text);font-size:14px;font-weight:700;pointer-events:none}.profit-label.positive{fill:color-mix(in srgb,var(--primary) 50%,var(--text))}.profit-label.negative{fill:color-mix(in srgb,var(--danger) 75%,var(--text))}
	.interaction-surface{fill:transparent;pointer-events:all}.hover-band{fill:var(--action-primary);opacity:.09;pointer-events:none}.hover-guide{stroke:var(--action-primary);stroke-width:1.5;stroke-dasharray:4 4;pointer-events:none}.axis-active{fill:var(--text);font-weight:700}rect.active:not(.hover-band){filter:brightness(1.12)}
	.hit-area{fill:transparent}g:focus-visible .hit-area{stroke:var(--action-primary);stroke-width:2;outline:none}
	.tooltip{position:absolute;z-index:1;display:flex;flex-direction:column;gap:3px;box-sizing:border-box;width:max-content;max-width:350px;padding:10px 12px;border:1px solid var(--border);border-radius:8px;background:var(--surface);box-shadow:0 8px 24px rgba(0,0,0,.16);color:var(--text);font-size:var(--font-size-support);line-height:1.6;pointer-events:none;overflow-wrap:anywhere;transform:translateX(-50%);transition:left .14s ease-out,top .14s ease-out}
	.tooltip strong{font-weight:500;color:var(--muted)}.tooltip-grid{display:grid;grid-template-columns:9px minmax(0,1fr) auto;align-items:center;column-gap:7px;row-gap:3px}.tooltip-row{display:contents}.tooltip-label{min-width:0;color:var(--text-secondary)}.tooltip-amount{margin-left:10px;color:var(--text);font-weight:600;text-align:right;white-space:nowrap}.tooltip-amount.negative{color:color-mix(in srgb,var(--danger) 75%,var(--text))}.color-ball{width:9px;height:9px;border-radius:50%}
	@media(prefers-reduced-motion:reduce){.tooltip{transition:none}}
</style>
