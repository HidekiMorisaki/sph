<script lang="ts">
	import { localization } from '$lib/localization';
	import { localeMessages } from '$lib/locale-messages';
	let { title, points, percent = false }: { title: string; points: Array<{ at: string; average: number | null; maximum: number | null; samples: number }>; percent?: boolean } = $props();
	let text = $derived(localeMessages[$localization.displayLanguage].systemSettings.monitoring);
	let selected = $state<number | null>(null);
	let plot: HTMLDivElement;
	let plotWidth = $state(640);
	$effect(() => {
		const observer = new ResizeObserver(() => { plotWidth = Math.max(210, plot.clientWidth); });
		observer.observe(plot);
		return () => observer.disconnect();
	});
	let ceiling = $derived(percent ? 100 : Math.max(1, ...points.map(p => p.maximum ?? 0)) * 1.1);
	const x = (index: number) => 82 + index / Math.max(1, points.length - 1) * (plotWidth - 94);
	const y = (value: number) => 164 - value / ceiling * 144;
	function path(field: 'average' | 'maximum') {
		let connected = false;
		return points.map((point, index) => {
			const value = point[field];
			if (value === null) { connected = false; return ''; }
			const command = connected ? 'L' : 'M'; connected = true;
			return `${command}${x(index)},${y(value)}`;
		}).join(' ');
	}
	function valueLabel(value: number | null) {
		if (value === null) return text.unavailable;
		if (percent) return `${value.toFixed(1)}%`;
		const power = value >= 1024 ** 4 ? 4 : value >= 1024 ** 3 ? 3 : 2;
		return `${(value / 1024 ** power).toFixed(1)} ${['MiB', 'GiB', 'TiB'][power - 2]}`;
	}
	function dateLabel(at: string, full = false) {
		return new Intl.DateTimeFormat($localization.displayLanguage, { timeZone: $localization.timeZone, month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', ...(full ? { year: 'numeric' as const } : {}) }).format(new Date(at));
	}
	function axisLabel(at: string, time: boolean) {
		return new Intl.DateTimeFormat($localization.displayLanguage, { timeZone: $localization.timeZone, ...(time ? { hour: '2-digit' as const, minute: '2-digit' as const } : { month: 'numeric' as const, day: 'numeric' as const }) }).format(new Date(at));
	}
	function pointer(event: PointerEvent) {
		const rect = event.currentTarget instanceof SVGElement ? event.currentTarget.getBoundingClientRect() : null;
		if (!rect) return;
		const coordinate = (event.clientX - rect.left) / rect.width * plotWidth;
		selected = Math.max(0, Math.min(points.length - 1, Math.round((coordinate - 82) / (plotWidth - 94) * (points.length - 1))));
	}
	function keyboard(event: KeyboardEvent) {
		if (!['ArrowLeft', 'ArrowRight', 'Home', 'End', 'Escape'].includes(event.key)) return;
		event.preventDefault();
		if (event.key === 'Escape') selected = null;
		else if (event.key === 'Home') selected = 0;
		else if (event.key === 'End') selected = points.length - 1;
		else selected = Math.max(0, Math.min(points.length - 1, (selected ?? 0) + (event.key === 'ArrowLeft' ? -1 : 1)));
	}
	let active = $derived(selected === null ? null : points[selected]);
	$effect(() => { points; selected = null; });
</script>

<article class="metric-chart">
	<h3>{title}</h3>
	<div class="legend"><span><i class="average"></i>{text.average}</span><span><i class="maximum"></i>{text.maximum}</span></div>
	<div class="plot" bind:this={plot} role="slider" tabindex="0" aria-label={`${title}: ${text.keyboardHint}`} aria-valuemin="0" aria-valuemax={Math.max(0, points.length - 1)} aria-valuenow={selected ?? 0} aria-valuetext={active ? `${dateLabel(active.at, true)}: ${valueLabel(active.average)}` : text.keyboardHint} onkeydown={keyboard} onblur={() => selected = null}>
		<svg viewBox={`0 0 ${plotWidth} 218`} aria-hidden="true" onpointerenter={pointer} onpointermove={pointer} onpointerleave={() => selected = null}>
			{#each [0, 0.5, 1] as ratio}
				<line x1="82" x2={plotWidth - 12} y1={y(ceiling * ratio)} y2={y(ceiling * ratio)} class="grid" />
				<text x="76" y={y(ceiling * ratio) + 4} text-anchor="end">{valueLabel(ceiling * ratio)}</text>
			{/each}
			{#if selected !== null}
				<rect x={x(selected) - 8} y="20" width="16" height="144" class="highlight" />
				<line x1={x(selected)} x2={x(selected)} y1="20" y2="164" class="guide" />
			{/if}
			<path d={path('maximum')} class="line maximum" />
			<path d={path('average')} class="line average" />
			{#each points as point, index}
				{#if point.average !== null}<circle cx={x(index)} cy={y(point.average)} r="1.7" class="dot" />{/if}
			{/each}
			{#each (plotWidth >= 440 ? [0, Math.floor((points.length - 1) / 2), points.length - 1] : [0, points.length - 1]) as index}
				{#if points[index]}<text x={x(index)} y="188" text-anchor={index === 0 ? 'start' : index === points.length - 1 ? 'end' : 'middle'} font-weight={selected === index ? '700' : '400'}><tspan x={x(index)}>{axisLabel(points[index].at, false)}</tspan><tspan x={x(index)} dy="18">{axisLabel(points[index].at, true)}</tspan></text>{/if}
			{/each}
		</svg>
		{#if active && selected !== null}
			<div class="tooltip" style:left={`${Math.max(25, Math.min(75, x(selected) / plotWidth * 100))}%`} aria-live="polite">
				<strong>{dateLabel(active.at, true)}</strong>
				<span>{text.average}: {valueLabel(active.average)}</span><span>{text.maximum}: {valueLabel(active.maximum)}</span>
				<span>{text.samples}: {active.samples}</span>
			</div>
		{/if}
	</div>
	{#if !points.some(point => point.average !== null)}<p class="empty">{text.noHistory}</p>{/if}
</article>

<style>
	.metric-chart{min-width:0;padding:16px;background:var(--surface);border:1px solid var(--border-light);border-radius:6px}h3{margin:0 0 12px;font-size:var(--font-size-body);color:var(--text)}.legend{display:flex;gap:20px;font-size:var(--font-size-support);color:var(--muted)}.legend span{display:flex;align-items:center;gap:6px}i{width:20px;height:2px;background:var(--action-primary)}i.maximum{background:var(--muted)}.plot{position:relative;margin-top:10px;outline-offset:3px}svg{display:block;width:100%;font-family:inherit;overflow:visible}text{font-size:14px;fill:var(--muted)}.grid{stroke:var(--border-light)}.line{fill:none;stroke-width:2;vector-effect:non-scaling-stroke}.line.average{stroke:var(--action-primary)}.line.maximum{stroke:var(--muted);stroke-dasharray:4 4}.dot{fill:var(--action-primary)}.highlight{fill:var(--action-primary);opacity:.09;pointer-events:none}.guide{stroke:var(--action-primary);stroke-width:1.5;stroke-dasharray:4 4;pointer-events:none}.tooltip{position:absolute;top:24px;z-index:1;pointer-events:none;transform:translateX(-50%);box-sizing:border-box;width:max-content;max-width:min(270px,90%);padding:10px 12px;border:1px solid var(--border);border-radius:8px;background:var(--surface);box-shadow:0 8px 24px rgba(0,0,0,.16);display:grid;gap:5px;font-size:var(--font-size-support);color:var(--text)}.empty{font-size:var(--font-size-support);color:var(--muted);margin:0}
</style>
