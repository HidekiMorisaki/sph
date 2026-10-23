<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { apiData } from '$lib/api';
	import ModalBackdrop from '$lib/components/ModalBackdrop.svelte';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
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
	let savedSettings = $state<Settings>({ basis: 'calendar', fiscalStartMonth: 1 });
	let loading = $state(true), saving = $state(false), notice = $state(''), isError = $state(false);
	let confirming = $state(false);
	let saveButton = $state<HTMLButtonElement>();
	let cancelButton = $state<HTMLButtonElement>();
	let confirmDialog = $state<HTMLDialogElement>();
	let hasChanges = $derived(settings.basis !== savedSettings.basis || settings.fiscalStartMonth !== savedSettings.fiscalStartMonth);
	onMount(() => {
		void fetch('/v1/financial-period-settings').then(async response => {
			if (!response.ok) throw new Error();
			const current = await apiData<Settings>(response);
			settings = { ...current };
			savedSettings = { ...current };
		}).catch(() => { notice = text.loadFailed; isError = true; }).finally(() => { loading = false; });
	});
	function requestSave() {
		if (saving || !hasChanges) return;
		notice = '';
		confirming = true;
		void tick().then(() => cancelButton?.focus());
	}
	function cancelSave() {
		if (saving) return;
		confirming = false;
		void tick().then(() => saveButton?.focus());
	}
	function handleConfirmKeydown(event: KeyboardEvent) {
		if (!confirming || !confirmDialog || event.defaultPrevented) return;
		if (event.key === 'Escape') { event.preventDefault(); cancelSave(); return; }
		if (event.key !== 'Tab') return;
		const buttons = [...confirmDialog.querySelectorAll<HTMLButtonElement>('button:not([disabled])')];
		if (event.shiftKey && document.activeElement === buttons[0]) { event.preventDefault(); buttons.at(-1)?.focus(); }
		else if (!event.shiftKey && document.activeElement === buttons.at(-1)) { event.preventDefault(); buttons[0]?.focus(); }
	}
	async function save() {
		if (!confirming || saving || !hasChanges) return;
		confirming = false;
		saving = true; notice = '';
		try {
			const response = await fetch('/v1/financial-period-settings', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...settings, confirmUnpublish: true }) });
			if (!response.ok) {
				const data = await response.json().catch(() => null) as { error?: { code?: string } } | null;
				notice = data?.error?.code === 'STALE_FINANCIAL_DATA' ? text.settingStale : text.settingSaveFailed; isError = true; return;
			}
			const current = await apiData<Settings>(response);
			settings = { ...current }; savedSettings = { ...current }; notice = text.settingSaved; isError = false;
		} catch { notice = text.settingSaveFailed; isError = true; }
		finally { saving = false; }
	}
</script>

<svelte:window onkeydown={handleConfirmKeydown} />
<div class="financial-settings"><h2>{text.periodSettings}</h2><p>{text.periodSettingsDescription}</p>
	{#if notice}<StatusNotice message={notice} tone={isError ? 'error' : 'success'} onDismiss={() => notice = ''} />{/if}
	{#if loading}<LoadingSpinner label={common.loading} compact />{:else}<div class="fields"><SearchSelect label={text.year} field="financial-basis" value={settings.basis} options={basisOptions} searchable={false} disabled={saving || confirming} onSelect={(value) => settings.basis = value as Settings['basis']} />{#if settings.basis === 'fiscal'}<SearchSelect label={text.fiscalStartMonth} field="financial-start-month" value={String(settings.fiscalStartMonth)} options={monthOptions} disabled={saving || confirming} onSelect={(value) => settings.fiscalStartMonth = Number(value)} />{/if}</div><button bind:this={saveButton} type="button" disabled={saving || !hasChanges} onclick={requestSave}>{saving ? common.saving : common.saveChanges}</button>{/if}
</div>

{#if confirming}
	<ModalBackdrop className="app-modal-backdrop--confirmation">
		<dialog bind:this={confirmDialog} class="app-modal app-modal--compact app-confirm-dialog" open aria-modal="true" aria-labelledby="financial-settings-confirm-title" aria-describedby="financial-settings-confirm-impact financial-settings-confirm-steps">
			<header><h2 id="financial-settings-confirm-title">{text.settingConfirmTitle}</h2></header>
			<div class="app-confirm-body financial-settings-confirm-body">
				<p id="financial-settings-confirm-impact">{text.settingConfirmImpact}</p>
				<div id="financial-settings-confirm-steps">
					<p>{text.settingConfirmStepsTitle}</p>
					<ol><li>{text.settingConfirmStepReview}</li><li>{text.settingConfirmStepPublish}</li></ol>
				</div>
			</div>
			<footer class="app-modal-footer"><button bind:this={cancelButton} class="secondary" type="button" onclick={cancelSave}>{common.cancel}</button><button class="app-primary-action" type="button" onclick={() => void save()}>{text.settingConfirmSave}</button></footer>
		</dialog>
	</ModalBackdrop>
{/if}

<style>
	.financial-settings{padding:20px;background:var(--surface);border:1px solid var(--border);border-radius:6px;box-shadow:var(--shadow)}h2{margin:0 0 6px;font-size:1.1rem}p{margin:0 0 16px;color:var(--text-secondary)}.fields{display:flex;flex-wrap:wrap;gap:16px;margin:16px 0}.fields :global(.form-select-field){width:180px}button{padding:8px 18px;border:1px solid var(--action-primary-button-border);border-radius:4px;background:var(--action-primary-background);color:var(--action-primary-text);font:inherit;cursor:pointer}button:disabled{opacity:.55;cursor:not-allowed}
	.financial-settings-confirm-body{display:grid;gap:16px}.financial-settings-confirm-body p{margin:0}.financial-settings-confirm-body ol{margin:8px 0 0;padding-left:1.5em;color:var(--text-secondary);line-height:1.6}
@media (max-width:700px), (min-width:701px) and (max-width:1024px) and (max-height:500px) and (any-pointer:coarse){.financial-settings{padding:12px}.fields{flex-direction:column}.fields :global(.form-select-field){width:100%}.financial-settings button,.fields :global(button){min-height:44px}}
button:hover:not(:disabled){background:var(--action-primary-background-hover)}
</style>
