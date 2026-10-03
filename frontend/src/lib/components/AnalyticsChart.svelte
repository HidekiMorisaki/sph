<script lang="ts">
	let { title, type, points, axisLabel, formatTick, showValues = false }: {
		title: string; type: 'bar' | 'line';
		points: { label: string; value: number | null; formatted: string }[]; axisLabel: string; formatTick: (value: number) => string;
		showValues?: boolean;
	} = $props();
	let maximum = $derived(Math.max(1, ...points.map((point) => point.value ?? 0)));
	let ceiling = $derived(maximum <= 4 ? 4 : Math.ceil(maximum / 4) * 4);
	let chartWidth = $state(600);
	let svgWidth = $derived(Math.max(chartWidth, points.length * 58 + 70));
	const left = 48, top = 36, height = 196;
	let width = $derived(Math.max(100, svgWidth - 70));
	let spacing = $derived(width / Math.max(1, points.length));
	const y = (value: number) => top + height - value / ceiling * height;
	const x = (index: number) => left + spacing * (index + 0.5);
	let line = $derived(points.map((point, index) => point.value === null ? '' : `${index === 0 || points[index - 1].value === null ? 'M' : 'L'}${x(index)},${y(point.value)}`).join(' '));
</script>

<div class="chart" bind:clientWidth={chartWidth}>
<svg viewBox={`0 0 ${svgWidth} 300`} style:width={`${svgWidth}px`} role="img" aria-label={title}>
	<title>{title}</title><desc>{points.map((point) => `${point.label}: ${point.formatted}`).join('; ')}</desc>
	{#each [0, 1, 2, 3, 4] as tick}
		{@const value = ceiling * tick / 4}
		<line x1={left} x2={left + width} y1={y(value)} y2={y(value)} class="grid" />
		<text x={left - 8} y={y(value) + 4} text-anchor="end">{formatTick(value)}</text>
	{/each}
	<text x={left} y="12" class="axis-label">{axisLabel}</text>
	{#if type === 'line'}<path d={line} class="trend" />{/if}
	{#each points as point, index}
		{#if point.value !== null}
			{#if type === 'bar'}
				<rect x={x(index) - spacing * 0.29} y={y(point.value)} width={spacing * 0.58} height={height * point.value / ceiling} rx="3" class="bar"><title>{point.label}: {point.formatted}</title></rect>
				{#if showValues}
					{@const inside = height * point.value / ceiling >= 24}
					<text x={x(index)} y={y(point.value) + (inside ? 17 : -6)} text-anchor="middle" class="value" class:inside>{formatTick(point.value)}</text>
				{/if}
			{:else}
				<circle cx={x(index)} cy={y(point.value)} r="4" class="dot"><title>{point.label}: {point.formatted}</title></circle>
				{#if showValues}<text x={x(index)} y={y(point.value) - 10} text-anchor="middle" class="value line-value">{formatTick(point.value)}</text>{/if}
			{/if}
		{:else if showValues}
			<text x={x(index)} y={top + height - 6} text-anchor="middle" class="value"><title>{point.label}: {point.formatted}</title>-</text>
		{/if}
		<text x={x(index)} y={top + height + 23} text-anchor={svgWidth < 450 ? 'end' : 'middle'} transform={svgWidth < 450 ? `rotate(-35 ${x(index)} ${top + height + 23})` : undefined}>{point.label}</text>
	{/each}
</svg>
</div>

<style>
	.chart{width:100%;min-width:0;overflow-x:auto}
	svg{display:block;height:300px;max-width:none;overflow:visible}
	text{fill:var(--muted);font-size:13px;font-family:inherit}
	.axis-label{font-size:12px}.grid{stroke:var(--border);stroke-width:1}
	.bar,.dot{fill:var(--action-primary)}
	.value{fill:var(--text);font-weight:600}.value.inside{fill:#fff}
	.line-value{paint-order:stroke;stroke:var(--surface);stroke-width:4px;stroke-linejoin:round}
	.trend{fill:none;stroke:var(--primary);stroke-width:3;stroke-linejoin:round;stroke-linecap:round}
</style>
