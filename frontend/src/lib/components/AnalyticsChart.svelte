<script lang="ts">
	import { niceAxis } from '$lib/chartAxis';
	let { title, type, points, axisLabel, formatTick, showValues = false }: {
		title: string; type: 'bar' | 'line';
		points: { label: string; value: number | null; formatted: string }[]; axisLabel: string; formatTick: (value: number) => string;
		showValues?: boolean;
	} = $props();
	let axis = $derived(niceAxis(points.map((point) => point.value ?? 0)));
	let ceiling = $derived(axis.maximum);
	let chartWidth = $state(600);
	let svgWidth = $derived(Math.max(chartWidth, points.length * 58 + 70));
	const left = 48, top = 36, height = 196;
	let width = $derived(Math.max(100, svgWidth - 70));
	let spacing = $derived(width / Math.max(1, points.length));
	const y = (value: number) => top + height - value / ceiling * height;
	const x = (index: number) => left + spacing * (index + 0.5);
	let line = $derived(points.map((point, index) => point.value === null ? '' : `${index === 0 || points[index - 1].value === null ? 'M' : 'L'}${x(index)},${y(point.value)}`).join(' '));
	let selected = $state<number | null>(null);
	let tooltipX = $state(0), tooltipY = $state(0);
	let tooltipWidth = $state(220), tooltipHeight = $state(64);
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

<div class="chart" bind:clientWidth={chartWidth}>
	<div class="canvas" style:width={`${svgWidth}px`}>
<svg viewBox={`0 0 ${svgWidth} 300`} role="group" aria-label={title} onpointerenter={trackPointer} onpointermove={trackPointer} onpointerleave={() => selected = null}>
	<desc>{points.map((point) => `${point.label}: ${point.formatted}`).join('; ')}</desc>
	<rect x="0" y="0" width={svgWidth} height="300" class="interaction-surface" aria-hidden="true" />
	{#if selected !== null && points[selected]}
		<rect x={left + selected * spacing} y={top} width={spacing} height={height} class="hover-band" />
		<line x1={x(selected)} x2={x(selected)} y1={top} y2={top + height} class="hover-guide" />
	{/if}
	{#each axis.ticks as value}
		<line x1={left} x2={left + width} y1={y(value)} y2={y(value)} class="grid" />
		<text x={left - 8} y={y(value) + 4} text-anchor="end">{formatTick(value)}</text>
	{/each}
	<text x={left} y="12" class="axis-label">{axisLabel}</text>
	{#if type === 'line'}<path d={line} pathLength="1" class="trend" />{/if}
	{#each points as point, index}
		{#if point.value !== null}
			{#if type === 'bar'}
				<rect x={x(index) - spacing * 0.29} y={y(point.value)} width={spacing * 0.58} height={height * point.value / ceiling} rx="3" class="bar" class:active={selected === index} />
				{#if showValues}
					{@const inside = height * point.value / ceiling >= 24}
					<text x={x(index)} y={y(point.value) + (inside ? 17 : -6)} text-anchor="middle" class="value" class:inside>{formatTick(point.value)}</text>
				{/if}
			{:else}
				<circle cx={x(index)} cy={y(point.value)} r={selected === index ? 6 : 4} class="dot" />
				{#if showValues}<text x={x(index)} y={y(point.value) - 10} text-anchor="middle" class="value line-value">{formatTick(point.value)}</text>{/if}
			{/if}
		{:else if showValues}
			<text x={x(index)} y={top + height - 6} text-anchor="middle" class="value">-</text>
		{/if}
		<text x={x(index)} y={top + height + 23} text-anchor={svgWidth < 450 ? 'end' : 'middle'} transform={svgWidth < 450 ? `rotate(-35 ${x(index)} ${top + height + 23})` : undefined} class:axis-active={selected === index}>{point.label}</text>
		<g tabindex="0" role="button" aria-label={`${point.label}: ${point.formatted}`} onfocus={() => selectPoint(index)} onblur={() => selected = null} onclick={() => selectPoint(index)} onkeydown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectPoint(index); } else if (event.key === 'Escape') selected = null; }}>
			<rect x={left + index * spacing} y={top - 18} width={spacing} height={height + 46} class="hit-area" />
		</g>
	{/each}
</svg>
	{#if selected !== null && points[selected]}
		<div class="tooltip" role="tooltip" bind:clientWidth={tooltipWidth} bind:clientHeight={tooltipHeight} style:left={`${Math.max(tooltipWidth / 2 + 8, Math.min(svgWidth - tooltipWidth / 2 - 8, tooltipX))}px`} style:top={`${Math.max(8, Math.min(300 - tooltipHeight - 8, tooltipY + 14))}px`}>
			<strong>{points[selected].label}</strong>
			<span class="tooltip-value"><i class="color-ball" class:line-ball={type === 'line'} aria-hidden="true"></i>{points[selected].formatted}</span>
		</div>
	{/if}
	</div>
</div>

<style>
	.chart{width:100%;min-width:0;overflow-x:auto}.canvas{position:relative;max-width:none}
	svg{display:block;width:100%;height:300px;max-width:none;overflow:visible}
	.interaction-surface{fill:transparent;pointer-events:all}
	text{fill:var(--muted);font-size:var(--font-size-body);font-family:inherit}
	.axis-label{font-size:var(--font-size-support)}.grid{stroke:var(--border);stroke-width:1;stroke-dasharray:4 3}
	.bar,.dot{fill:var(--action-primary)}
	.value{fill:var(--text);font-weight:600}.value.inside{fill:#fff}
	.line-value{paint-order:stroke;stroke:var(--surface);stroke-width:4px;stroke-linejoin:round}
	.trend{fill:none;stroke:var(--primary);stroke-width:3;stroke-linejoin:round;stroke-linecap:round}
	.hover-band{fill:var(--action-primary);opacity:.09;pointer-events:none}.hover-guide{stroke:var(--action-primary);stroke-width:1.5;stroke-dasharray:4 4;pointer-events:none}.axis-active{fill:var(--text);font-weight:700}
	.bar.active{filter:brightness(1.16)}.hit-area{fill:transparent}g:focus-visible .hit-area{stroke:var(--action-primary);stroke-width:2}
	.tooltip{position:absolute;z-index:1;display:flex;flex-direction:column;gap:3px;box-sizing:border-box;width:max-content;max-width:220px;padding:9px 12px;border:1px solid var(--border);border-radius:8px;background:var(--surface);box-shadow:0 8px 24px rgba(0,0,0,.16);color:var(--text);font-size:var(--font-size-support);pointer-events:none;overflow-wrap:anywhere;transform:translateX(-50%);transition:left .14s ease-out,top .14s ease-out}
	.tooltip strong{font-weight:500;color:var(--muted)}.tooltip-value{display:flex;align-items:center;gap:7px;color:var(--text-secondary)}.color-ball{flex:none;width:9px;height:9px;border-radius:50%;background:var(--action-primary)}.color-ball.line-ball{background:var(--primary)}
	.bar{transform-box:fill-box;transform-origin:center bottom;animation:grow-bar .65s cubic-bezier(.2,.7,.2,1) both}.trend{stroke-dasharray:1;stroke-dashoffset:1;animation:draw-line .9s ease-out forwards}.dot,.value{animation:reveal .45s ease-out .5s both}
	@keyframes grow-bar{from{transform:scaleY(0)}to{transform:scaleY(1)}}@keyframes draw-line{to{stroke-dashoffset:0}}@keyframes reveal{from{opacity:0}to{opacity:1}}
	@media(prefers-reduced-motion:reduce){.bar,.trend,.dot,.value{animation:none}.trend{stroke-dashoffset:0}.tooltip{transition:none}}
</style>
