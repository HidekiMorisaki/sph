<script lang="ts">
	import DetailModal from './DetailModal.svelte';
	import { formatFinancialAmount, type FinancialCurrency } from '$lib/financial-currency';
	import { formatLocaleTemplate, localeMessages } from '$lib/locale-messages';
	import { localization } from '$lib/localization';

	type Totals = { currency: FinancialCurrency; completedMonths: number; revenue: string; variableCost: string; fixedCost: string; netProfit: string };
	let { branchName, periodLabel, totals, returnFocus, onClose }: {
		branchName: string; periodLabel: string; totals: Totals; returnFocus: HTMLElement | null; onClose: () => void;
	} = $props();
	let text = $derived(localeMessages[$localization.displayLanguage].financial);
	let language = $derived($localization.displayLanguage);
	let revenue = $derived(Number(totals.revenue));
	let variableCost = $derived(Number(totals.variableCost));
	let fixedCost = $derived(Number(totals.fixedCost));
	let profit = $derived(Number(totals.netProfit));
	let grossProfit = $derived(revenue - variableCost);
	let showVariable = $state(true);
	let showGross = $state(true);
	let showFixed = $state(true);
	let showNet = $state(true);
	let positiveTop = $derived((showVariable ? variableCost : 0) + (showGross ? Math.max(grossProfit, 0) : 0));
	let positiveBottom = $derived((showFixed ? fixedCost : 0) + (showNet ? Math.max(profit, 0) : 0));
	let negativeTop = $derived(showGross ? Math.max(-grossProfit, 0) : 0);
	let negativeBottom = $derived(showNet ? Math.max(-profit, 0) : 0);
	let positiveMax = $derived(Math.max(positiveTop, positiveBottom));
	let negativeMax = $derived(Math.max(negativeTop, negativeBottom));
	let tickStep = $derived(niceStep(positiveMax + negativeMax, totals.currency));
	let axisPositive = $derived(positiveMax === 0 ? 0 : Math.ceil(positiveMax / tickStep - 1e-9) * tickStep);
	let axisNegative = $derived(negativeMax === 0 ? 0 : Math.ceil(negativeMax / tickStep - 1e-9) * tickStep);
	let axisRange = $derived(axisPositive + axisNegative);
	let axisTicks = $derived(axisRange === 0 ? [0] : Array.from({ length: Math.round(axisRange / tickStep) + 1 }, (_, index) => Number((-axisNegative + index * tickStep).toFixed(8))));
	let negativeShare = $derived(axisRange === 0 ? 0 : axisNegative / axisRange * 100);
	let netLabel = $derived(profit < 0 ? text.previewDeficit : profit > 0 ? text.previewSurplus : text.netProfit);
	function niceStep(range: number, currency: FinancialCurrency) {
		if (range <= 0) return currency === 'JPY' ? 1 : 0.01;
		const rough = range / 5;
		const magnitude = 10 ** Math.floor(Math.log10(rough));
		const ratio = rough / magnitude;
		return Math.max((ratio <= 1 ? 1 : ratio <= 2 ? 2 : ratio <= 5 ? 5 : 10) * magnitude, currency === 'JPY' ? 1 : 0.01);
	}
	function tickPosition(value: number) { return axisRange === 0 ? 0 : (value + axisNegative) / axisRange * 100; }
	function tickLabel(value: number) {
		return new Intl.NumberFormat(language === 'ja' ? 'ja-JP' : 'en-US', {
			style: 'currency', currency: totals.currency,
			notation: Math.max(axisPositive, axisNegative) >= 10000 ? 'compact' : 'standard',
			maximumFractionDigits: totals.currency === 'JPY' ? 1 : 2
		}).format(value);
	}
	function positiveWidth(value: number) { return `${axisPositive === 0 ? 0 : Math.min(value / axisPositive * 100, 100)}%`; }
	function negativeWidth(value: number) { return `${axisNegative === 0 ? 0 : Math.min(-value / axisNegative * 100, 100)}%`; }
	function amount(value: string) { return formatFinancialAmount(value, totals.currency, language) ?? '-'; }
</script>

<DetailModal title={text.previewTitle} titleId="financial-strac-preview-title" pretitle={`${branchName} · ${periodLabel}`} closeLabel={text.close} {returnFocus} {onClose} compact dialogClass="financial-preview-dialog">
	<div class="preview-content">
		<p class="preview-note">{text.previewDraft} · {formatLocaleTemplate(text.monthsEntered, totals.completedMonths)} · {totals.currency}</p>
		{#if totals.completedMonths === 0}
			<p class="empty">{text.previewNoData}</p>
		{:else}
			{#if totals.completedMonths < 12}<p class="incomplete">{text.previewIncomplete}</p>{/if}
			<div class="diagram">
				<div class="legend" role="group" aria-label={text.previewTitle}>
					<button type="button" class="legend-item" class:muted={!showVariable} aria-pressed={showVariable} onclick={() => showVariable = !showVariable}><span class="swatch variable"></span>{text.variableCost}</button>
					<button type="button" class="legend-item" class:muted={!showGross} aria-pressed={showGross} onclick={() => showGross = !showGross}><span class="swatch gross"></span>{text.grossProfit}</button>
					<button type="button" class="legend-item" class:muted={!showFixed} aria-pressed={showFixed} onclick={() => showFixed = !showFixed}><span class="swatch fixed"></span>{text.fixedCost}</button>
					<button type="button" class="legend-item" class:muted={!showNet} aria-pressed={showNet} onclick={() => showNet = !showNet}><span class:loss-swatch={profit < 0} class="swatch profit"></span>{netLabel}</button>
				</div>
				<div class="chart-row"><div class="bar-label">{text.previewPerformance}</div><div class="bar-track" style:grid-template-columns={`${negativeShare}% minmax(0, 1fr)`} aria-hidden="true">{#each axisTicks as tick}<span class="gridline" class:zero={tick === 0} style:left={`${tickPosition(tick)}%`}></span>{/each}<div class="negative-side">{#if showGross && grossProfit < 0}<div class="segment gross" style:width={negativeWidth(grossProfit)}></div>{/if}</div><div class="positive-side">{#if showVariable}<div class="segment variable" style:width={positiveWidth(variableCost)}></div>{/if}{#if showGross && grossProfit > 0}<div class="segment gross" style:width={positiveWidth(grossProfit)}></div>{/if}</div></div></div>
				<div class="chart-row"><div class="bar-label">{text.previewCosts}</div><div class="bar-track" style:grid-template-columns={`${negativeShare}% minmax(0, 1fr)`} aria-hidden="true">{#each axisTicks as tick}<span class="gridline" class:zero={tick === 0} style:left={`${tickPosition(tick)}%`}></span>{/each}<div class="negative-side">{#if showNet && profit < 0}<div class="segment loss-segment" style:width={negativeWidth(profit)}></div>{/if}</div><div class="positive-side">{#if showFixed}<div class="segment fixed" style:width={positiveWidth(fixedCost)}></div>{/if}{#if showNet && profit > 0}<div class="segment profit" style:width={positiveWidth(profit)}></div>{/if}</div></div></div>
				<div class="chart-axis"><div></div><div class="axis-track">{#each axisTicks as tick}<div class="axis-tick" class:zero={tick === 0} style:left={`${tickPosition(tick)}%`}><span class="tick-label">{tickLabel(tick)}</span></div>{/each}</div></div>
				<p class="axis-caption">{text.previewAxis} ({totals.currency})</p>
			</div>
			<dl class="values">
				<div><dt><span class="swatch revenue"></span>{text.revenue}</dt><dd>{amount(totals.revenue)}</dd></div>
				<div><dt><span class="swatch variable"></span>{text.variableCost}</dt><dd>{amount(totals.variableCost)}</dd></div>
				<div><dt><span class="swatch fixed"></span>{text.fixedCost}</dt><dd>{amount(totals.fixedCost)}</dd></div>
				<div><dt><span class:loss-swatch={profit < 0} class="swatch profit"></span>{text.netProfit}</dt><dd class:negative={profit < 0}>{amount(totals.netProfit)}</dd></div>
			</dl>
		{/if}
	</div>
</DetailModal>

<style>
	.preview-content{display:grid;gap:18px;min-width:0}
	.preview-note{margin:0;color:var(--text-secondary);font-size:var(--font-size-support)}
	.incomplete{margin:0;padding:10px 12px;border:1px solid var(--border);border-radius:4px;background:var(--surface);color:var(--text-secondary);font-size:var(--font-size-support)}
	.diagram{display:grid;gap:18px;padding:18px;background:var(--surface);border:1px solid var(--border);border-radius:6px}
	.legend{display:flex;flex-wrap:wrap;gap:6px 16px}
	.legend-item{display:inline-flex;align-items:center;gap:6px;margin:0;padding:4px 2px;border:0;background:transparent;color:var(--text);font:inherit;font-size:var(--font-size-support);cursor:pointer}
	.legend-item+.legend-item{margin-left:0}
	.legend-item:hover{background:transparent;color:var(--action-primary)}
	.legend-item:focus-visible{outline:2px solid var(--action-primary);outline-offset:2px}
	.legend-item.muted{opacity:.55;text-decoration:line-through}
	.chart-row{display:grid;grid-template-columns:125px minmax(0,1fr);align-items:center;gap:12px}
	.bar-label{color:var(--text-secondary);font-size:var(--font-size-support);font-weight:700}
	.bar-track{position:relative;display:grid;width:100%;height:56px;overflow:hidden;background:var(--surface-secondary);border-radius:4px}
	.gridline{position:absolute;top:0;bottom:0;width:1px;background:var(--border);pointer-events:none}
	.gridline.zero{background:var(--text-secondary)}
	.negative-side,.positive-side{position:relative;z-index:1;display:flex;min-width:0;height:100%}
	.negative-side{justify-content:flex-end;border-right:2px solid var(--text-secondary)}
	.chart-axis{display:grid;grid-template-columns:125px minmax(0,1fr);gap:12px;margin-top:-12px}
	.axis-track{position:relative;height:36px;border-top:1px solid var(--border)}
	.axis-tick{position:absolute;top:0;height:6px;border-left:1px solid var(--muted)}
	.axis-tick.zero{border-color:var(--text)}
	.tick-label{position:absolute;top:8px;left:0;transform:translateX(-50%);color:var(--text-secondary);font-size:.75rem;white-space:nowrap}
	.axis-tick:first-child .tick-label{transform:none}
	.axis-tick:last-child .tick-label{transform:translateX(-100%)}
	.axis-caption{margin:-12px 0 0 137px;text-align:center;color:var(--text-secondary);font-size:var(--font-size-support)}
	.segment{min-width:0;height:100%}
	.revenue{background:#337ab7}.variable{background:#5f8cff}.gross{background:#ffbd78}.fixed{background:#ed56c1}.profit{background:#1abb9c}.loss-segment,.loss-swatch{background:#f5a4cf}
	.values{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:0}
	.values>div{min-width:0;padding:12px;background:var(--surface);border:1px solid var(--border);border-radius:4px}
	.values dt{display:flex;align-items:center;gap:8px;color:var(--text-secondary);font-size:var(--font-size-support)}
	.values dd{margin:6px 0 0;overflow-wrap:anywhere;color:var(--text);font-size:var(--font-size-body);font-weight:700}
	.values dd.negative{color:var(--danger)}
	.swatch{display:inline-block;flex:none;width:12px;height:12px;border-radius:50%}
	.empty{margin:0;padding:18px;background:var(--surface);border:1px solid var(--border);border-radius:4px}
	@media(max-width:700px){.chart-row{grid-template-columns:1fr;gap:6px}.chart-axis{grid-template-columns:1fr}.chart-axis>div:first-child{display:none}.axis-caption{margin-left:0}.axis-tick:nth-child(even):not(.zero) .tick-label{display:none}.values{grid-template-columns:1fr}}
</style>
