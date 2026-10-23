<script lang="ts">
	import { onMount } from 'svelte';
	import { apiData } from '$lib/api';
	import { localization } from '$lib/localization';
	import { localeMessages, formatLocaleTemplate } from '$lib/locale-messages';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
	import SearchSelect from '$lib/components/SearchSelect.svelte';
	import DetailModal from '$lib/components/DetailModal.svelte';
	import SystemMetricChart from './SystemMetricChart.svelte';

	type Measurement = { cpuPercent: number | null; memoryUsed: number | null; memoryTotal: number | null; apiMemory: number | null; diskAvailable: number | null; diskTotal: number | null; databaseBytes: number | null };
	type Metrics = { period: '1h' | '24h' | '7d'; supported: boolean; cpuModel: string | null; logicalCores: number | null; runtimeUptimeSeconds: number; latest: (Measurement & { at: string }) | null; bucketMinutes: number; history: Array<{ at: string; samples: number; average: Measurement; maximum: Measurement }> };
	let text = $derived(localeMessages[$localization.displayLanguage].systemSettings.monitoring);
	let period = $state<'1h' | '24h' | '7d'>('24h');
	let refreshMinutes = $state<1 | 5 | 10>(1);
	let data = $state.raw<Metrics | null>(null);
	let supported = $state<boolean | null>(null);
	let loading = $state(true);
	let failed = $state(false);
	let showHelp = $state(false);
	let helpTrigger = $state<HTMLButtonElement>();
	let now = $state(Date.now());
	let lastReceivedAt = $state(Date.now());
	let controller: AbortController | null = null;
	let timer: ReturnType<typeof setInterval> | null = null;
	let mounted = false;
	const preferencesKey = 'sph-system-monitoring-preferences';
	let stale = $derived(data?.latest ? lastReceivedAt - Date.parse(data.latest.at) > 3 * 60_000 || now - lastReceivedAt > (refreshMinutes + 3) * 60_000 : false);
	const charts = [{ key: 'cpuPercent', label: 'cpu', percent: true }, { key: 'memoryUsed', label: 'memory', percent: false }] as const;
	let history = $derived(data?.history ?? []);
	let series = $derived(charts.map(chart => ({ ...chart, points: history.map(row => ({ at: row.at, samples: row.samples, average: row.average[chart.key], maximum: row.maximum[chart.key] })) })));
	function savePreferences() {
		try { localStorage.setItem(preferencesKey, JSON.stringify({ period, refreshMinutes })); }
		catch { /* Keep the selection for this visit if browser storage is unavailable. */ }
	}
	function scheduleRefresh() {
		if (timer) clearInterval(timer);
		if (!mounted || supported === false) return;
		timer = setInterval(() => { if (!document.hidden && !loading) void load(); }, refreshMinutes * 60_000);
	}
	function changePeriod(value: string) {
		if (value !== '1h' && value !== '24h' && value !== '7d') return;
		period = value;
		savePreferences(); data = null; void load();
	}
	function changeRefresh(value: string) {
		const minutes = Number(value);
		if (minutes !== 1 && minutes !== 5 && minutes !== 10) return;
		refreshMinutes = minutes; savePreferences(); scheduleRefresh();
	}
	async function load() {
		controller?.abort();
		const current = new AbortController(); controller = current;
		loading = true;
		try {
			const response = await fetch(`/v1/system-information/metrics?period=${period}`, { signal: current.signal });
			if (!response.ok) throw new Error();
			const result = await apiData<Metrics>(response);
			if (current !== controller) return;
			// Preserve the graph inputs when only current values/uptime have changed.
			if (data?.supported && result.supported && JSON.stringify(data.history) === JSON.stringify(result.history)) result.history = data.history;
			data = result; supported = result.supported; failed = false; now = lastReceivedAt = Date.now();
			if (!result.supported && timer) { clearInterval(timer); timer = null; }
		} catch { if (!current.signal.aborted) failed = true; }
		finally { if (current === controller) loading = false; }
	}
	onMount(() => {
		try {
			const saved = JSON.parse(localStorage.getItem(preferencesKey) ?? 'null');
			if (saved?.period === '1h' || saved?.period === '24h' || saved?.period === '7d') period = saved.period;
			if (saved?.refreshMinutes === 1 || saved?.refreshMinutes === 5 || saved?.refreshMinutes === 10) refreshMinutes = saved.refreshMinutes;
		} catch { /* Invalid or unavailable storage uses the defaults. */ }
		mounted = true;
		void load();
		scheduleRefresh();
		const clock = setInterval(() => { now = Date.now(); }, 60_000);
		const onVisible = () => { if (!document.hidden && supported !== false && !loading && Date.now() - lastReceivedAt >= refreshMinutes * 60_000) void load(); };
		document.addEventListener('visibilitychange', onVisible);
		return () => { mounted = false; if (timer) clearInterval(timer); clearInterval(clock); document.removeEventListener('visibilitychange', onVisible); controller?.abort(); };
	});
	function bytes(value: number | null | undefined) {
		if (value === null || value === undefined) return text.unavailable;
		const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
		const power = value > 0 ? Math.min(4, Math.floor(Math.log(value) / Math.log(1024))) : 0;
		return `${new Intl.NumberFormat($localization.displayLanguage, { maximumFractionDigits: 1 }).format(value / 1024 ** power)} ${units[power]}`;
	}
	function percent(value: number | null | undefined) { return value == null ? text.unavailable : `${value.toFixed(1)}%`; }
</script>

<section class="monitoring" aria-labelledby="monitoring-heading">
	<div class="heading"><div class="title-group"><h2 id="monitoring-heading">{text.title}</h2>
		{#if supported === true}<button bind:this={helpTrigger} class="monitoring-help-button" type="button" aria-label={text.helpTitle} title={text.helpTitle} onclick={() => showHelp = true}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 015.8 1c0 2-3 3-3 3"/><circle cx="12" cy="17" r="0.5" fill="currentColor"/></svg></button>{/if}
	</div>
		{#if supported === true || failed}<div class="controls">
			<SearchSelect label={text.period} field="monitoring-period" value={period} options={[{ value: '1h', label: text.hour }, { value: '24h', label: text.day }, { value: '7d', label: text.week }]} searchable={false} onSelect={changePeriod} />
			<SearchSelect label={text.refreshInterval} field="monitoring-refresh" value={String(refreshMinutes)} options={[{ value: '1', label: text.everyMinute }, { value: '5', label: text.everyFiveMinutes }, { value: '10', label: text.everyTenMinutes }]} searchable={false} onSelect={changeRefresh} />
		</div>{/if}
	</div>
	{#if failed}<p class="error" role="alert">{text.failed}</p>{/if}
	{#if !data && loading}<LoadingSpinner label={text.loading} />
	{:else if data && !data.supported}<p class="unsupported">{text.dockerOnly}</p>
	{:else if data?.supported}
		{#if stale}<p class="warning" role="status">{text.stale}</p>{/if}
		{#if !data.latest}<p class="scope">{text.noHistory}</p>{/if}
		<dl class="cards">
			<div><dt>{text.cpu}</dt><dd>{percent(data.latest?.cpuPercent)}</dd><small>{text.runtime}</small></div>
			<div><dt>{text.memory}</dt><dd>{bytes(data.latest?.memoryUsed)} / {bytes(data.latest?.memoryTotal)}</dd><small>{text.runtime}</small></div>
			<div><dt>{text.database}</dt><dd>{bytes(data.latest?.databaseBytes)}</dd></div>
			<div><dt>{text.disk}</dt><dd>{bytes(data.latest?.diskAvailable)}</dd><small>{text.total}: {bytes(data.latest?.diskTotal)}</small></div>
			<div class="cpu-model-card"><dt>{text.cpuModel}</dt><dd class="model-value">{data.cpuModel ?? text.unavailable}</dd></div>
			<div><dt>{text.apiMemory}</dt><dd>{bytes(data.latest?.apiMemory)}</dd></div>
			<div><dt>{text.runtimeUptime}</dt><dd>{formatLocaleTemplate(text.hours, (data.runtimeUptimeSeconds / 3600).toFixed(1))}</dd></div>
		</dl>
		<div class="charts" aria-busy={loading}>
			{#each series as chart}
				<SystemMetricChart title={text[chart.label]} percent={chart.percent} points={chart.points} />
			{/each}
		</div>
	{/if}
</section>

{#if showHelp && data?.supported}
	<DetailModal title={text.helpTitle} titleId="monitoring-help-title" closeLabel={text.closeHelp} returnFocus={helpTrigger} compact dialogClass="monitoring-help-dialog" onClose={() => showHelp = false}>
		<div class="monitoring-help-content">
			<section class="app-detail-section"><h3>{text.measurementScope}</h3><p>{text.scope}</p></section>
			<section class="app-detail-section"><h3>{text.historyHelp}</h3><p>{text.historyNote}</p></section>
		</div>
	</DetailModal>
{/if}

<style>
	.title-group{display:flex;align-items:center;gap:6px}.monitoring-help-button{display:grid;place-items:center;width:32px;height:32px;padding:7px;background:transparent!important;color:var(--text-secondary)!important;border:0;border-radius:4px;cursor:pointer}.monitoring-help-button svg{width:18px;height:18px}.monitoring-help-button:hover{background:var(--surface-hover,var(--surface-secondary))!important;color:var(--text)!important}.monitoring-help-button:focus-visible{outline:2px solid var(--action-primary);outline-offset:2px}:global(.monitoring-help-dialog){width:min(100%,620px)}.monitoring-help-content{display:grid;gap:16px;color:var(--text-secondary);font-size:var(--font-size-body);line-height:1.6}.monitoring-help-content p{margin:0}
	.monitoring{margin-bottom:20px;padding:16px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text)}.heading{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px}h2{margin:0;font-size:var(--font-size-section-title,1.125rem)}.controls{display:flex;flex-wrap:wrap;align-items:center;gap:8px;font-size:var(--font-size-support)}.controls :global(.form-select-field){width:170px}.scope,.unsupported{font-size:var(--font-size-support);line-height:1.7;color:var(--muted);margin:10px 0 16px}.cards{display:grid;grid-template-columns:repeat(8,minmax(0,1fr));gap:12px;margin:16px 0}.cards>div{padding:14px;background:var(--surface);border:1px solid var(--border-light);border-radius:5px;min-width:0}dt{font-size:var(--font-size-support);color:var(--muted)}dd{margin:6px 0 0;overflow-wrap:anywhere}.cards dd{font-size:1.25rem;font-weight:600}.cards dd.model-value{font-size:var(--font-size-body)}.cpu-model-card{grid-column:span 2}small{display:block;margin-top:6px;color:var(--muted);font-size:var(--font-size-support)}.charts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.error{color:var(--danger)}.warning{padding:10px;border:1px solid var(--border);border-radius:5px;color:var(--text);background:var(--surface)}@media(max-width:1100px){.cards{grid-template-columns:repeat(4,minmax(0,1fr))}.charts{grid-template-columns:1fr}}@media(max-width:760px){.cards{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:600px){.controls{width:100%}.controls :global(.form-select-field){width:100%}.cards{grid-template-columns:1fr}.cpu-model-card{grid-column:auto}.monitoring{padding:12px}.cards dd{font-size:1.125rem}}
@media (max-width:700px), (min-width:701px) and (max-width:1024px) and (max-height:500px) and (any-pointer:coarse){.controls{width:100%}.controls :global(.form-select-field){width:100%}.controls :global(button){min-height:44px}.cards{grid-template-columns:1fr}.cpu-model-card{grid-column:auto}.monitoring{padding:12px}.cards dd{font-size:1.125rem}}
</style>
