<script lang="ts">
	import { analyticsText } from '$lib/analytics';
	import { localization } from '$lib/localization';
	import { niceAxis } from '$lib/chartAxis';

	let { points, formatCount, formatAge }: {
		points: { year: number; headcount: number; averageAge: number | null; averageAgeCount: number }[];
		formatCount: (value: number) => string;
		formatAge: (value: number | null) => string;
	} = $props();
	let text = $derived(analyticsText($localization.displayLanguage));
	let viewportWidth = $state(600);
	let svgWidth = $derived(Math.max(viewportWidth, points.length * 80 + 140));
	const left = 58, top = 42, height = 208;
	let plotWidth = $derived(svgWidth - 140);
	let spacing = $derived(plotWidth / Math.max(1, points.length));
	let barWidth = $derived(Math.min(36, spacing * 0.48));
	let countAxis = $derived(niceAxis(points.map((point) => point.headcount)));
	let ageAxis = $derived(niceAxis(points.map((point) => point.averageAge ?? 0)));
	let countMaximum = $derived(countAxis.maximum);
	let ageMaximum = $derived(ageAxis.maximum);
	const x = (index: number) => left + spacing * (index + 0.5);
	const countY = (value: number) => top + height - value / countMaximum * height;
	const ageY = (value: number) => top + height - value / ageMaximum * height;
	const barValueY = (value: number) => countY(value) + (height * value / countMaximum >= 24 ? 17 : -7);
	const ageValueY = (point: typeof points[number]) => {
		if (point.averageAge === null) return top;
		const preferred = ageY(point.averageAge) - 12;
		return point.headcount > 0 && Math.abs(preferred - barValueY(point.headcount)) < 20 ? Math.max(30, preferred - 20) : preferred;
	};
	let ageLine = $derived(points.map((point, index) => point.averageAge === null ? '' : `${index === 0 || points[index - 1].averageAge === null ? 'M' : 'L'}${x(index)},${ageY(point.averageAge)}`).join(' '));
	let selected = $state<number | null>(null);
	let tooltipX = $state(0), tooltipY = $state(0);
	let tooltipWidth = $state(260), tooltipHeight = $state(110);
	function selectPoint(index: number) { selected = index; tooltipX = x(index); tooltipY = top; }
	function trackPointer(event: PointerEvent) {
		if (!points.length) return;
		const bounds = (event.currentTarget as SVGSVGElement).getBoundingClientRect();
		const pointerX = (event.clientX - bounds.left) / bounds.width * svgWidth;
		tooltipX = pointerX;
		tooltipY = (event.clientY - bounds.top) / bounds.height * 300;
		selected = Math.max(0, Math.min(points.length - 1, Math.floor((pointerX - left) / spacing)));
	}
	const description = (point: typeof points[number]) => `${point.year}: ${text.employees} ${formatCount(point.headcount)}; ${text.averageAge} ${formatAge(point.averageAge)}; ${text.averageAgeCount} ${formatCount(point.averageAgeCount)}`;
</script>

<ul class="legend" aria-label={text.headcountAgeTrend}>
	<li><span class="bar-key" aria-hidden="true"></span>{text.employees}</li>
	<li><span class="line-key" aria-hidden="true"></span>{text.averageAge}</li>
</ul>
<div class="chart-scroll" bind:clientWidth={viewportWidth}>
	<div class="canvas" style:width={`${svgWidth}px`}>
		<svg viewBox={`0 0 ${svgWidth} 300`} role="group" aria-label={text.headcountAgeTrend} onpointerenter={trackPointer} onpointermove={trackPointer} onpointerleave={() => selected = null}>
			<desc>{points.map(description).join('; ')}</desc>
			<rect x="0" y="0" width={svgWidth} height="300" class="interaction-surface" aria-hidden="true" />
			{#if selected !== null && points[selected]}
				<rect x={left + selected * spacing} y={top} width={spacing} height={height} class="hover-band" />
				<line x1={x(selected)} x2={x(selected)} y1={top} y2={top + height} class="hover-guide" />
			{/if}
			{#each countAxis.ticks as value}
				<line x1={left} x2={left + plotWidth} y1={countY(value)} y2={countY(value)} class="grid" />
				<text x={left - 8} y={countY(value) + 4} text-anchor="end">{formatCount(value)}</text>
			{/each}
			{#each ageAxis.ticks as value}
				<text x={left + plotWidth + 8} y={ageY(value) + 4}>{formatCount(value)}</text>
			{/each}
			<text x={left} y="14">{text.employees}</text><text x={left + plotWidth} y="14" text-anchor="end">{text.averageAgeAxis}</text>
			{#each points as point, index}
				{@const inside = height * point.headcount / countMaximum >= 24}
				<rect x={x(index) - barWidth / 2} y={countY(point.headcount)} width={barWidth} height={height * point.headcount / countMaximum} rx="3" class="headcount-bar" class:active={selected === index} />
				{#if point.headcount > 0}<text x={x(index)} y={barValueY(point.headcount)} text-anchor="middle" class="bar-value" class:inside>{formatCount(point.headcount)}</text>{/if}
				<text x={x(index)} y={top + height + 25} text-anchor="middle" class:axis-active={selected === index}>{point.year}</text>
			{/each}
			<path d={ageLine} pathLength="1" class="age-line" />
			{#each points as point, index}
				{#if point.averageAge !== null}<circle cx={x(index)} cy={ageY(point.averageAge)} r={selected === index ? 6 : 4} class="age-dot" /><text x={x(index)} y={ageValueY(point)} text-anchor="middle" class="age-value">{formatAge(point.averageAge)}</text>{/if}
				<g tabindex="0" role="button" aria-label={description(point)} onfocus={() => selectPoint(index)} onblur={() => selected = null} onclick={() => selectPoint(index)} onkeydown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectPoint(index); } else if (event.key === 'Escape') selected = null; }}>
					<rect x={left + index * spacing} y={top - 18} width={spacing} height={height + 46} class="hit-area" />
				</g>
			{/each}
		</svg>
		{#if selected !== null && points[selected]}
			{@const point = points[selected]}
			<div class="tooltip" role="tooltip" bind:clientWidth={tooltipWidth} bind:clientHeight={tooltipHeight} style:left={`${Math.max(tooltipWidth / 2 + 8, Math.min(svgWidth - tooltipWidth / 2 - 8, tooltipX))}px`} style:top={`${Math.max(8, Math.min(300 - tooltipHeight - 8, tooltipY + 14))}px`}>
				<strong>{point.year}</strong>
				<span><i class="bar-ball" aria-hidden="true"></i>{text.employees}: {formatCount(point.headcount)}</span>
				<span><i class="age-ball" aria-hidden="true"></i>{text.averageAge}: {formatAge(point.averageAge)}</span>
				<small>{text.averageAgeCount}: {formatCount(point.averageAgeCount)}</small>
			</div>
		{/if}
	</div>
</div>

<style>
	.legend{display:flex;flex-wrap:wrap;gap:8px 18px;padding:0;margin:0 0 12px;list-style:none;font-size:var(--font-size-support);color:var(--text-secondary)}
	.legend li{display:flex;align-items:center;gap:6px}.bar-key{width:12px;height:12px;border-radius:2px;background:var(--action-primary)}.line-key{width:20px;border-top:3px solid var(--primary)}
	.chart-scroll{max-width:100%;min-width:0;overflow-x:auto}.canvas{position:relative;max-width:none}
	svg{display:block;width:100%;height:300px}text{fill:var(--muted);font-size:var(--font-size-support);font-family:inherit}
	.interaction-surface{fill:transparent;pointer-events:all}.grid{stroke:var(--border);stroke-width:1;stroke-dasharray:4 3}
	.headcount-bar{fill:var(--action-primary)}.headcount-bar.active{filter:brightness(1.16)}.bar-value{fill:var(--text);font-weight:600}.bar-value.inside{fill:#fff}
	.age-line{fill:none;stroke:var(--primary);stroke-width:3;stroke-linejoin:round;stroke-linecap:round}.age-dot{fill:var(--primary)}.age-value{fill:var(--primary);font-weight:600;paint-order:stroke;stroke:var(--surface);stroke-width:4px;stroke-linejoin:round}
	.hover-band{fill:var(--action-primary);opacity:.09;pointer-events:none}.hover-guide{stroke:var(--action-primary);stroke-width:1.5;stroke-dasharray:4 4;pointer-events:none}.axis-active{fill:var(--text);font-weight:700}
	.hit-area{fill:transparent}g:focus-visible .hit-area{stroke:var(--action-primary);stroke-width:2;outline:none}
	.tooltip{position:absolute;z-index:1;display:flex;flex-direction:column;gap:4px;box-sizing:border-box;width:max-content;max-width:260px;padding:10px 12px;border:1px solid var(--border);border-radius:8px;background:var(--surface);box-shadow:0 8px 24px rgba(0,0,0,.16);color:var(--text);font-size:var(--font-size-support);line-height:1.6;pointer-events:none;overflow-wrap:anywhere;transform:translateX(-50%);transition:left .14s ease-out,top .14s ease-out}
	.tooltip strong{font-weight:500;color:var(--muted)}.tooltip span{display:flex;align-items:center;gap:6px}.tooltip small{color:var(--muted);font-size:var(--font-size-support)}.bar-ball,.age-ball{width:9px;height:9px;border-radius:50%;flex:none}.bar-ball{background:var(--action-primary)}.age-ball{background:var(--primary)}
	.headcount-bar{transform-box:fill-box;transform-origin:center bottom;animation:grow-bar .65s cubic-bezier(.2,.7,.2,1) both}.age-line{stroke-dasharray:1;stroke-dashoffset:1;animation:draw-line .9s ease-out forwards}.age-dot,.bar-value,.age-value{animation:reveal .45s ease-out .5s both}
	@keyframes grow-bar{from{transform:scaleY(0)}to{transform:scaleY(1)}}@keyframes draw-line{to{stroke-dashoffset:0}}@keyframes reveal{from{opacity:0}to{opacity:1}}
	@media(prefers-reduced-motion:reduce){.headcount-bar,.age-line,.age-dot,.bar-value,.age-value{animation:none}.age-line{stroke-dashoffset:0}.tooltip{transition:none}}
</style>
