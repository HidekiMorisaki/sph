<script lang="ts">
	import { analyticsText } from '$lib/analytics';
	import { localization } from '$lib/localization';
	import { niceAxis } from '$lib/chartAxis';
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
	let countAxis = $derived(niceAxis(points.flatMap((point) => [point.hires, point.departures])));
	let rateAxis = $derived(niceAxis(points.map((point) => point.turnoverRate ?? 0), 0.1));
	let countMaximum = $derived(countAxis.maximum);
	let rateMaximum = $derived(rateAxis.maximum);
	const countY = (value: number) => top + height - value / countMaximum * height;
	const rateY = (value: number) => top + height - value / rateMaximum * height;
	const x = (index: number) => left + spacing * (index + 0.5);
	let line = $derived(points.map((point, index) => point.turnoverRate === null ? '' : `${index === 0 || points[index - 1].turnoverRate === null ? 'M' : 'L'}${x(index)},${rateY(point.turnoverRate)}`).join(' '));
	let selected = $state<number | null>(null);
	let tooltipX = $state(0), tooltipY = $state(0);
	let tooltipWidth = $state(270), tooltipHeight = $state(125);
	function selectPoint(index: number) { selected = index; tooltipX = x(index); tooltipY = top; }
	function trackPointer(event: PointerEvent) {
		if (!points.length) return;
		const bounds = (event.currentTarget as SVGSVGElement).getBoundingClientRect();
		const pointerX = (event.clientX - bounds.left) / bounds.width * svgWidth;
		tooltipX = pointerX;
		tooltipY = (event.clientY - bounds.top) / bounds.height * 300;
		selected = Math.max(0, Math.min(points.length - 1, Math.floor((pointerX - left) / spacing)));
	}
</script>

<ul class="legend" aria-label={text.rates}>
	<li><span class="key hires"></span>{text.hiresLabel}</li>
	<li><span class="key departures"></span>{text.departuresLabel}</li>
	<li><span class="line-key"></span>{text.turnoverLabel}</li>
</ul>
<div class="chart-scroll" bind:clientWidth={viewportWidth}>
	<div class="canvas" style:width={`${svgWidth}px`}>
		<svg viewBox={`0 0 ${svgWidth} 300`} role="group" aria-label={text.rates} onpointerenter={trackPointer} onpointermove={trackPointer} onpointerleave={() => selected = null}>
			<desc>{points.map((point) => point.tooltip).join('; ')}</desc>
			<rect x="0" y="0" width={svgWidth} height="300" class="interaction-surface" aria-hidden="true" />
			{#if selected !== null && points[selected]}
				<rect x={left + selected * spacing} y={top} width={spacing} height={height} class="hover-band" />
				<line x1={x(selected)} x2={x(selected)} y1={top} y2={top + height} class="hover-guide" />
			{/if}
			{#each countAxis.ticks as value}
				<line x1={left} x2={left + plotWidth} y1={countY(value)} y2={countY(value)} class="grid" />
				<text x={left - 8} y={countY(value) + 4} text-anchor="end">{formatCount(value)}</text>
			{/each}
			{#each rateAxis.ticks as value}
				<text x={left + plotWidth + 8} y={rateY(value) + 4}>{formatRate(value)}</text>
			{/each}
			<text x={left} y="14">{text.employees}</text><text x={left + plotWidth} y="14" text-anchor="end">{text.percent}</text>
			{#each points as point, index}
				{#each [{ value: point.hires, offset: -barWidth - 2, kind: 'hires' }, { value: point.departures, offset: 2, kind: 'departures' }] as bar}
					{@const inside = height * bar.value / countMaximum >= 25}
					<rect x={x(index) + bar.offset} y={countY(bar.value)} width={barWidth} height={height * bar.value / countMaximum} rx="3" class={bar.kind} class:active={selected === index} />
					<text x={x(index) + bar.offset + barWidth / 2} y={countY(bar.value) + (inside ? 17 : -6)} text-anchor="middle" class="value" class:inside>{formatCount(bar.value)}</text>
				{/each}
				<text x={x(index)} y={top + height + 25} text-anchor="middle" class:axis-active={selected === index}>{point.year}</text>
			{/each}
			<path d={line} pathLength="1" class="rate-line" />
			{#each points as point, index}
				{#if point.turnoverRate !== null}
					<circle cx={x(index)} cy={rateY(point.turnoverRate)} r={selected === index ? 6 : 4} class="rate-dot" />
					<text x={x(index)} y={rateY(point.turnoverRate) - 12} text-anchor="middle" class="rate-value">{formatRate(point.turnoverRate)}</text>
				{:else}<text x={x(index)} y={top + 18} text-anchor="middle" class="rate-value">-</text>{/if}
				<g tabindex="0" role="button" aria-label={point.tooltip} onfocus={() => selectPoint(index)} onblur={() => selected = null} onclick={() => selectPoint(index)} onkeydown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectPoint(index); } else if (event.key === 'Escape') selected = null; }}>
					<rect x={left + index * spacing} y={top - 20} width={spacing} height={height + 48} class="hit-area" />
				</g>
			{/each}
		</svg>
		{#if selected !== null && points[selected]}
			{@const point = points[selected]}
			<div class="tooltip" role="tooltip" bind:clientWidth={tooltipWidth} bind:clientHeight={tooltipHeight} style:left={`${Math.max(tooltipWidth / 2 + 8, Math.min(svgWidth - tooltipWidth / 2 - 8, tooltipX))}px`} style:top={`${Math.max(8, Math.min(300 - tooltipHeight - 8, tooltipY + 14))}px`}>
				<strong>{point.year}</strong>
				<div class="tooltip-grid">
					<div class="tooltip-row"><i class="color-ball hires-ball" aria-hidden="true"></i><span class="tooltip-label">{text.hiresLabel}</span><span class="tooltip-amount">{formatCount(point.hires)}</span></div>
					<div class="tooltip-row"><i class="color-ball departures-ball" aria-hidden="true"></i><span class="tooltip-label">{text.departuresLabel}</span><span class="tooltip-amount">{formatCount(point.departures)}</span></div>
					<div class="tooltip-row"><i class="color-ball rate-ball" aria-hidden="true"></i><span class="tooltip-label">{text.turnoverLabel}</span><span class="tooltip-amount">{formatRate(point.turnoverRate).replace(/\s*%$/, '')}</span></div>
				</div>
			</div>
		{/if}
	</div>
</div>

<style>
	.legend{display:flex;flex-wrap:wrap;gap:8px 18px;padding:0;margin:0 0 12px;list-style:none;font-size:var(--font-size-support);color:var(--text-secondary)}
	.legend li{display:flex;align-items:center;gap:6px}.key{width:12px;height:12px;border-radius:2px}
	.hires{fill:var(--action-primary);background:var(--action-primary)}.departures{fill:#b85b16;background:#b85b16}
	.line-key{width:20px;border-top:3px solid var(--primary)}
	.chart-scroll{max-width:100%;min-width:0;overflow-x:auto}.canvas{position:relative;max-width:none}
	svg{display:block;width:100%;height:300px}text{fill:var(--muted);font-size:var(--font-size-support);font-family:inherit}
	.interaction-surface{fill:transparent;pointer-events:all}
	.grid{stroke:var(--border);stroke-width:1;stroke-dasharray:4 3}.value{fill:var(--text);font-weight:600}.value.inside{fill:#fff}
	.hover-band{fill:var(--action-primary);opacity:.09;pointer-events:none}.hover-guide{stroke:var(--action-primary);stroke-width:1.5;stroke-dasharray:4 4;pointer-events:none}.axis-active{fill:var(--text);font-weight:700}
	.hires.active,.departures.active{filter:brightness(1.16)}
	.rate-line{fill:none;stroke:var(--primary);stroke-width:3;stroke-linejoin:round}.rate-dot{fill:var(--primary)}
	.rate-value{fill:var(--text);font-weight:600;paint-order:stroke;stroke:var(--surface);stroke-width:4px;stroke-linejoin:round}
	.hit-area{fill:transparent}g:focus-visible .hit-area{stroke:var(--action-primary);stroke-width:2;outline:none}
	.tooltip{position:absolute;z-index:1;display:flex;flex-direction:column;gap:3px;box-sizing:border-box;width:max-content;max-width:270px;padding:10px 12px;border:1px solid var(--border);border-radius:8px;background:var(--surface);box-shadow:0 8px 24px rgba(0,0,0,.16);color:var(--text);font-size:var(--font-size-support);line-height:1.6;pointer-events:none;overflow-wrap:anywhere;transform:translateX(-50%);transition:left .14s ease-out,top .14s ease-out}
	.tooltip strong{font-weight:500;color:var(--muted)}.tooltip-grid{display:grid;grid-template-columns:9px max-content max-content;align-items:center;column-gap:7px;row-gap:3px}.tooltip-row{display:contents}.tooltip-label{color:var(--text-secondary)}.tooltip-amount{margin-left:10px;color:var(--text);font-weight:600;text-align:right}.color-ball{width:9px;height:9px;border-radius:50%}.hires-ball{background:var(--action-primary)}.departures-ball{background:#b85b16}.rate-ball{background:var(--primary)}
	.hires,.departures{transform-box:fill-box;transform-origin:center bottom;animation:grow-bar .65s cubic-bezier(.2,.7,.2,1) both}.rate-line{stroke-dasharray:1;stroke-dashoffset:1;animation:draw-line .9s ease-out forwards}.rate-dot,.value,.rate-value{animation:reveal .45s ease-out .5s both}
	@keyframes grow-bar{from{transform:scaleY(0)}to{transform:scaleY(1)}}@keyframes draw-line{to{stroke-dashoffset:0}}@keyframes reveal{from{opacity:0}to{opacity:1}}
	@media(prefers-reduced-motion:reduce){.hires,.departures,.rate-line,.rate-dot,.value,.rate-value{animation:none}.rate-line{stroke-dashoffset:0}.tooltip{transition:none}}
</style>
