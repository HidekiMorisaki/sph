<script lang="ts">
	import { onMount, tick, untrack } from 'svelte';
	import DiscardChangesDialog from '$lib/components/DiscardChangesDialog.svelte';
	import FormSection from '$lib/components/FormSection.svelte';
	import ModalBackdrop from '$lib/components/ModalBackdrop.svelte';
	import SearchSelect from '$lib/components/SearchSelect.svelte';
	import StatusNotice from '$lib/components/StatusNotice.svelte';
	import { apiData } from '$lib/api';
	import { localization } from '$lib/localization';
	import { localeMessages, formatLocaleTemplate } from '$lib/locale-messages';
	import { calendarErrorKey } from '$lib/work-calendar-errors';
	import { formSnapshot } from '$lib/modalForm';

	export type WorkCalendarEntry = { id: number; workDate: string; entryType: 'working_day' | 'company_holiday'; title: string; note: string | null };

	let { calendarId, workDate, entry, returnFocus = null, onClose, onSaved }: {
		calendarId: number;
		workDate: string;
		entry: WorkCalendarEntry | null;
		returnFocus?: HTMLElement | null;
		onClose: () => void;
		onSaved: (date: string, action: 'created' | 'updated' | 'deleted') => void;
	} = $props();

	let text = $derived(localeMessages[$localization.displayLanguage].workCalendars);
	let common = $derived(localeMessages[$localization.displayLanguage].common);
	function t(key: keyof typeof text, ...values: (string | number)[]) { return formatLocaleTemplate(text[key], ...values); }

	let entryType = $state(untrack(() => entry?.entryType ?? 'working_day'));
	let title = $state(untrack(() => entry?.title ?? ''));
	let note = $state(untrack(() => entry?.note ?? ''));
	let saving = $state(false);
	let formError = $state('');
	let titleError = $state('');
	let dialogElement = $state<HTMLDialogElement>();
	let titleElement = $state<HTMLInputElement>();
	let confirmingDiscard = $state(false);
	const initialSnapshot = untrack(() => formSnapshot({ entryType, title, note }));
	let hasDraftChanges = $derived(formSnapshot({ entryType, title, note }) !== initialSnapshot);
	let hasUnsavedChanges = $derived(Boolean(entry) && hasDraftChanges);

	let typeOptions = $derived([
		{ value: 'working_day', label: text.workingDay },
		{ value: 'company_holiday', label: text.companyHoliday }
	]);

	async function responseError(response: Response, fallback: string) { const key = await calendarErrorKey(response); return key === 'unknown' ? fallback : text[key]; }

	function closeImmediately() {
		confirmingDiscard = false;
		if (saving) return;
		onClose();
		void tick().then(() => returnFocus?.focus());
	}
	function requestClose() {
		if (saving) return;
		if (hasUnsavedChanges) { confirmingDiscard = true; return; }
		closeImmediately();
	}

	function validate() {
		titleError = title.trim() ? '' : text.titleRequired;
		if (titleError) { void tick().then(() => titleElement?.focus()); return false; }
		return true;
	}

	async function save() {
		if (!validate()) return;
		saving = true; formError = '';
		try {
			const url = entry ? `/v1/work-calendars/${calendarId}/entries/${entry.id}` : `/v1/work-calendars/${calendarId}/entries`;
			const response = await fetch(url, {
				method: entry ? 'PATCH' : 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ workDate, entryType, title: title.trim(), note: note.trim() || null })
			});
			if (!response.ok) formError = await responseError(response, text.entrySaveFailed);
			else { await apiData<WorkCalendarEntry>(response); onSaved(workDate, entry ? 'updated' : 'created'); }
		} catch { formError = text.entrySaveFailed; } finally { saving = false; }
	}

	async function remove() {
		if (!entry || !confirm(t('entryDeleteConfirm', entry.title))) return;
		saving = true; formError = '';
		try {
			const response = await fetch(`/v1/work-calendars/${calendarId}/entries/${entry.id}`, { method: 'DELETE' });
			if (!response.ok) formError = await responseError(response, text.entryDeleteFailed);
			else onSaved(workDate, 'deleted');
		} catch { formError = text.entryDeleteFailed; } finally { saving = false; }
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.defaultPrevented || confirmingDiscard || !dialogElement) return;
		if (event.key === 'Escape') { event.preventDefault(); if (!entry && hasDraftChanges && !saving) confirmingDiscard = true; else requestClose(); return; }
		if (event.key !== 'Tab') return;
		const focusable = [...dialogElement.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
			.filter((element) => element.tabIndex >= 0 && element.getClientRects().length > 0);
		if (!focusable.length) return;
		const first = focusable[0]; const last = focusable[focusable.length - 1];
		if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
		else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
	}

	onMount(() => void tick().then(() => titleElement?.focus()));
</script>

<svelte:window onkeydown={handleKeydown} />
<ModalBackdrop>
	<dialog bind:this={dialogElement} class="app-modal app-modal--compact entry-dialog" open aria-modal="true" aria-labelledby="entry-dialog-title">
		<header><h2 id="entry-dialog-title">{entry ? text.editEntry : text.addEntry}</h2><button class="app-modal-close" type="button" aria-label={text.closeEntry} disabled={saving} onclick={requestClose}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg></button></header>
		<form class="app-modal-form" novalidate onsubmit={(event) => { event.preventDefault(); void save(); }}>
			<div class="app-modal-form-body entry-form-body">
				{#if formError}<StatusNotice title={text.entrySaveHeading} message={formError} tone="error" onDismiss={() => formError = ''} />{/if}
				<FormSection title={text.entryDetails} columns={2} framed>
					<label>{text.date}<input value={workDate} readonly aria-readonly="true" /></label>
					<SearchSelect label={text.dayType} field="entryType" value={entryType} options={typeOptions} required disabled={saving} onSelect={(value) => entryType = value as typeof entryType} />
					<label class="wide"><span>{text.entryTitle} <span class="required" aria-hidden="true">*</span></span><input bind:this={titleElement} class:invalid={Boolean(titleError)} maxlength="128" bind:value={title} aria-invalid={Boolean(titleError)} aria-describedby={titleError ? 'entry-title-error' : undefined} placeholder={text.titlePlaceholder} />{#if titleError}<small id="entry-title-error" class="field-error" role="alert">{titleError}</small>{/if}</label>
					<label class="wide">{text.note}<textarea maxlength="5000" rows="5" bind:value={note} placeholder={text.notePlaceholder}></textarea></label>
				</FormSection>
			</div>
			<footer class="app-modal-footer">{#if entry}<button class="delete-action" type="button" disabled={saving} onclick={() => void remove()}>{common.delete}</button>{/if}<span class="footer-spacer"></span><button class="secondary" type="button" disabled={saving} onclick={requestClose}>{common.cancel}</button><button class="app-primary-action" type="submit" disabled={saving || (Boolean(entry) && !hasUnsavedChanges)}>{saving ? common.saving : text.save}</button></footer>
		</form>
	</dialog>
</ModalBackdrop>
{#if confirmingDiscard}<DiscardChangesDialog onContinue={() => confirmingDiscard = false} onDiscard={closeImmediately} />{/if}

<style>
	.entry-dialog{width:min(100%,680px)}.entry-form-body{grid-template-columns:1fr;padding-top:16px}.wide{grid-column:1/-1}.footer-spacer{flex:1}.delete-action{display:inline-flex;align-items:center;justify-content:center;height:32px;margin:0;padding:0 12px;background:var(--danger)!important;color:#fff!important;border:1px solid var(--danger);border-radius:4px;font-size:var(--font-size-body);font-weight:500}.delete-action:disabled{opacity:.65}
</style>
