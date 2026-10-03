<script lang="ts">
	import { analyticsText } from '$lib/analytics';
	import { localization } from '$lib/localization';
	let { points, formatCount, formatRate }: {
		points: { year: number; hires: number; departures: number; turnoverRate: number | null; tooltip: string }[];
		formatCount: (value: number) => string; formatRate: (value: number | null) => string;
	} = $props();
	let text = $derived(analyticsText($localization.displayLanguage));
	let viewportWidth = $state(600);
	let svgWidth = $derived(Math.max(viewportWidth, points.length * 90 + 130));
	const left = 52, top = 42, height = 210;
	let plotWidth = $derived(svgWidth - 130);
	let spacing = $derived(plotWidth / Math.max(1, points.length));
	let barWidth = $derived(Math.min(32, spacing * 0.24));
	let countMaximum = $derived(Math.max(4, Math.ceil(Math.max(0, ...points.flatMap((point) => [point.hires, point.departures])) / 4) * 4));
	let rateMaximum = $derived(Math.max(4, Math.ceil(Math.max(0, ...points.map((point) => point.turnoverRate ?? 0)) / 4) * 4));
	const countY = (value: number) => top + height - value / countMaximum * height;
	const rateY = (value: number) => top + height - value / rateMaximum * height;
	const x = (index: number) => left + spacing * (index + 0.5);
	let line = $derived(points.map((point, index) => point.turnoverRate === null ? '' : `${index === 0 || points[index - 1].turnoverRate === null ? 'M' : 'L'}${x(index)},${rateY(point.turnoverRate)}`).join(' '));
	let selected = $state<number | null>(null);
</script>

<ul class="legend" aria-label={text.rates}>
	<li><span class="key hires"></span>{text.hiresLabel}</li>
	<li><span class="key departures"></span>{text.departuresLabel}</li>
	<li><span class="line-key"></span>{text.turnoverLabel}</li>
</ul>
<div class="chart-scroll" bind:clientWidth={viewportWidth}>
	<div class="canvas" style:width={`${svgWidth}px`}>
		<svg viewBox={`0 0 ${svgWidth} 300`} role="group" aria-label={text.rates}>
			<title>{text.rates}</title><desc>{points.map((point) => point.tooltip).join('; ')}</desc>
			{#each [0, 1, 2, 3, 4] as tick}
				{@const y = top + height - tick / 4 * height}
				<line x1={left} x2={left + plotWidth} y1={y} y2={y} class="grid" />
				<text x={left - 8} y={y + 4} text-anchor="end">{formatCount(countMaximum * tick / 4)}</text>
				<text x={left + plotWidth + 8} y={y + 4}>{formatRate(rateMaximum * tick / 4)}</text>
			{/each}
			<text x={left} y="14">{text.employees}</text><text x={left + plotWidth} y="14" text-anchor="end">{text.percent}</text>
			{#each points as point, index}
				{#each [{ value: point.hires, offset: -barWidth - 2, kind: 'hires' }, { value: point.departures, offset: 2, kind: 'departures' }] as bar}
					{@const inside = height * bar.value / countMaximum >= 25}
					<rect x={x(index) + bar.offset} y={countY(bar.value)} width={barWidth} height={height * bar.value / countMaximum} rx="3" class={bar.kind}><title>{point.tooltip}</title></rect>
					<text x={x(index) + bar.offset + barWidth / 2} y={countY(bar.value) + (inside ? 17 : -6)} text-anchor="middle" class="value" class:inside>{formatCount(bar.value)}</text>
				{/each}
				<text x={x(index)} y={top + height + 25} text-anchor="middle">{point.year}</text>
			{/each}
			<path d={line} class="rate-line" />
			{#each points as point, index}
				{#if point.turnoverRate !== null}
					<circle cx={x(index)} cy={rateY(point.turnoverRate)} r="4" class="rate-dot"><title>{point.tooltip}</title></circle>
					<text x={x(index)} y={rateY(point.turnoverRate) - 12} text-anchor="middle" class="rate-value">{formatRate(point.turnoverRate)}</text>
				{:else}<text x={x(index)} y={top + 18} text-anchor="middle" class="rate-value"><title>{text.unavailable}</title>-</text>{/if}
				<g tabindex="0" role="button" aria-label={point.tooltip} onmouseenter={() => selected = index} onmouseleave={() => selected = null} onfocus={() => selected = index} onblur={() => selected = null} onclick={() => selected = selected === index ? null : index} onkeydown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selected = selected === index ? null : index; } else if (event.key === 'Escape') selected = null; }}>
					<rect x={left + index * spacing} y={top - 20} width={spacing} height={height + 48} class="hit-area" />
				</g>
			{/each}
		</svg>
		{#if selected !== null && points[selected]}
			<div class="tooltip" role="tooltip" style:left={`${Math.max(0, Math.min(svgWidth - 270, x(selected) - 135))}px`}>{points[selected].tooltip}</div>
		{/if}
	</div>
</div>

<style>
	.legend{display:flex;flex-wrap:wrap;gap:8px 18px;padding:0;margin:0 0 12px;list-style:none;font-size:12px;color:var(--text-secondary)}
	.legend li{display:flex;align-items:center;gap:6px}.key{width:12px;height:12px;border-radius:2px}
	.hires{fill:var(--action-primary);background:var(--action-primary)}.departures{fill:#b85b16;background:#b85b16}
	.line-key{width:20px;border-top:3px solid var(--primary)}
	.chart-scroll{max-width:100%;min-width:0;overflow-x:auto}.canvas{position:relative;max-width:none}
	svg{display:block;width:100%;height:300px}text{fill:var(--muted);font-size:12px;font-family:inherit}
	.grid{stroke:var(--border);stroke-width:1}.value{fill:var(--text);font-weight:600}.value.inside{fill:#fff}
	.rate-line{fill:none;stroke:var(--primary);stroke-width:3;stroke-linejoin:round}.rate-dot{fill:var(--primary)}
	.rate-value{fill:var(--text);font-weight:600;paint-order:stroke;stroke:var(--surface);stroke-width:4px;stroke-linejoin:round}
	.hit-area{fill:transparent}g:focus-visible .hit-area{stroke:var(--action-primary);stroke-width:2;outline:none}
	.tooltip{position:absolute;top:32px;z-index:1;width:270px;max-width:100%;padding:10px;border:1px solid var(--border);border-radius:4px;background:var(--surface-secondary);box-shadow:var(--shadow);color:var(--text);font-size:12px;white-space:pre-line;pointer-events:none;overflow-wrap:anywhere}
</style>
