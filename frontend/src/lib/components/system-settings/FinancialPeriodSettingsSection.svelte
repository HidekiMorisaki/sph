<script lang="ts">
	import { onMount } from 'svelte';
	import { apiData } from '$lib/api';
	import SearchSelect from '$lib/components/SearchSelect.svelte';
	import StatusNotice from '$lib/components/StatusNotice.svelte';
	import { localeMessages } from '$lib/locale-messages';
	import { localization } from '$lib/localization';
	type Settings = { basis: 'calendar' | 'fiscal'; fiscalStartMonth: number };
	let text = $derived(localeMessages[$localization.displayLanguage].financial);
	let common = $derived(localeMessages[$localization.displayLanguage].common);
	let basisOptions = $derived([
		{ value: 'calendar', label: text.calendarYear },
		{ value: 'fiscal', label: text.fiscalYear }
	]);
	const monthOptions = Array.from({ length: 12 }, (_, index) => ({ value: String(index + 1), label: String(index + 1) }));
	let settings = $state<Settings>({ basis: 'calendar', fiscalStartMonth: 1 });
	let loading = $state(true), saving = $state(false), notice = $state(''), isError = $state(false);
	onMount(() => {
		void fetch('/v1/financial-period-settings').then(async response => {
			if (!response.ok) throw new Error();
			settings = await apiData<Settings>(response);
		}).catch(() => { notice = text.loadFailed; isError = true; }).finally(() => { loading = false; });
	});
	async function save() {
		saving = true; notice = '';
		try {
			const response = await fetch('/v1/financial-period-settings', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(settings) });
			if (!response.ok) {
				const data = await response.json().catch(() => null) as { error?: { code?: string } } | null;
				notice = data?.error?.code === 'PUBLISHED_FISCAL_PERIODS' ? text.settingLocked : text.settingSaveFailed; isError = true; return;
			}
			settings = await apiData<Settings>(response); notice = text.settingSaved; isError = false;
		} catch { notice = text.settingSaveFailed; isError = true; }
		finally { saving = false; }
	}
</script>

<div class="financial-settings"><h2>{text.periodSettings}</h2><p>{text.periodSettingsDescription}</p>
	{#if notice}<StatusNotice message={notice} tone={isError ? 'error' : 'success'} onDismiss={() => notice = ''} />{/if}
	{#if loading}<p>{common.loading}</p>{:else}<div class="fields"><SearchSelect label={text.year} field="financial-basis" value={settings.basis} options={basisOptions} searchable={false} disabled={saving} onSelect={(value) => settings.basis = value as Settings['basis']} />{#if settings.basis === 'fiscal'}<SearchSelect label={text.fiscalStartMonth} field="financial-start-month" value={String(settings.fiscalStartMonth)} options={monthOptions} disabled={saving} onSelect={(value) => settings.fiscalStartMonth = Number(value)} />{/if}</div><button type="button" disabled={saving} onclick={save}>{saving ? common.saving : common.saveChanges}</button>{/if}
</div>

<style>
	.financial-settings{padding:20px;background:var(--surface);border:1px solid var(--border);border-radius:6px;box-shadow:var(--shadow)}h2{margin:0 0 6px;font-size:1.1rem}p{margin:0 0 16px;color:var(--text-secondary)}.fields{display:flex;flex-wrap:wrap;gap:16px;margin:16px 0}.fields :global(.form-select-field){width:180px}button{padding:8px 18px;border:0;border-radius:4px;background:var(--action-primary);color:white;font:inherit;cursor:pointer}button:disabled{opacity:.55;cursor:not-allowed}
</style>
