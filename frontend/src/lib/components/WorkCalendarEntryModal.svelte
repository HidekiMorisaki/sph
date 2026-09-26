<script lang="ts">
	import { onMount, tick, untrack } from 'svelte';
	import DiscardChangesDialog from '$lib/components/DiscardChangesDialog.svelte';
	import FormSection from '$lib/components/FormSection.svelte';
	import ModalBackdrop from '$lib/components/ModalBackdrop.svelte';
	import SearchSelect from '$lib/components/SearchSelect.svelte';
	import { apiData } from '$lib/api';
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
	let hasUnsavedChanges = $derived(Boolean(entry) && formSnapshot({ entryType, title, note }) !== initialSnapshot);

	const typeOptions = [
		{ value: 'working_day', label: 'Working day' },
		{ value: 'company_holiday', label: 'Company holiday' }
	];

	async function responseError(response: Response, fallback: string) {
		const payload = await response.clone().json().catch(() => null) as { error?: { message?: string } } | null;
		return payload?.error?.message ?? fallback;
	}

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
		titleError = title.trim() ? '' : 'Title is required.';
		if (titleError) { void tick().then(() => titleElement?.focus()); return false; }
		return true;
	}

	async function save() {
		if (!validate()) return;
		saving = true; formError = '';
		const url = entry ? `/v1/work-calendars/${calendarId}/entries/${entry.id}` : `/v1/work-calendars/${calendarId}/entries`;
		const response = await fetch(url, {
			method: entry ? 'PATCH' : 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ workDate, entryType, title: title.trim(), note: note.trim() || null })
		});
		if (!response.ok) formError = await responseError(response, 'Unable to save the calendar entry.');
		else { await apiData<WorkCalendarEntry>(response); onSaved(workDate, entry ? 'updated' : 'created'); }
		saving = false;
	}

	async function remove() {
		if (!entry || !confirm(`Delete “${entry.title}”?`)) return;
		saving = true; formError = '';
		const response = await fetch(`/v1/work-calendars/${calendarId}/entries/${entry.id}`, { method: 'DELETE' });
		if (!response.ok) formError = await responseError(response, 'Unable to delete the calendar entry.');
		else onSaved(workDate, 'deleted');
		saving = false;
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.defaultPrevented || confirmingDiscard || !dialogElement) return;
		if (event.key === 'Escape') { event.preventDefault(); requestClose(); return; }
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
<ModalBackdrop onDismiss={requestClose} disabled={saving}>
	<dialog bind:this={dialogElement} class="app-modal app-modal--compact entry-dialog" open aria-modal="true" aria-labelledby="entry-dialog-title">
		<header><h2 id="entry-dialog-title">{entry ? 'Edit calendar entry' : 'Add calendar entry'}</h2><button class="app-modal-close" type="button" aria-label="Close calendar entry form" disabled={saving} onclick={requestClose}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg></button></header>
		<form class="app-modal-form" novalidate onsubmit={(event) => { event.preventDefault(); void save(); }}>
			<div class="app-modal-form-body entry-form-body">
				{#if formError}<div class="app-modal-error-summary" role="alert"><strong>Unable to save calendar entry</strong><span>{formError}</span></div>{/if}
				<FormSection title="Calendar entry" columns={2} framed>
					<label>Date<input value={workDate} readonly aria-readonly="true" /></label>
					<SearchSelect label="Day type" field="entryType" value={entryType} options={typeOptions} required disabled={saving} onSelect={(value) => entryType = value as typeof entryType} />
					<label class="wide"><span>Title <span class="required" aria-hidden="true">*</span></span><input bind:this={titleElement} class:invalid={Boolean(titleError)} maxlength="128" bind:value={title} aria-invalid={Boolean(titleError)} aria-describedby={titleError ? 'entry-title-error' : undefined} placeholder="e.g. Head office day" />{#if titleError}<small id="entry-title-error" class="field-error" role="alert">{titleError}</small>{/if}</label>
					<label class="wide">Note<textarea maxlength="5000" rows="5" bind:value={note} placeholder="Optional details"></textarea></label>
				</FormSection>
			</div>
			<footer class="app-modal-footer">{#if entry}<button class="delete-action" type="button" disabled={saving} onclick={() => void remove()}>Delete</button>{/if}<span class="footer-spacer"></span><button class="secondary" type="button" disabled={saving} onclick={requestClose}>Cancel</button><button class="app-primary-action" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button></footer>
		</form>
	</dialog>
</ModalBackdrop>
{#if confirmingDiscard}<DiscardChangesDialog onContinue={() => confirmingDiscard = false} onDiscard={closeImmediately} />{/if}

<style>
	.entry-dialog{width:min(100%,680px)}.entry-form-body{grid-template-columns:1fr;padding-top:16px}.wide{grid-column:1/-1}.footer-spacer{flex:1}.delete-action{display:inline-flex;align-items:center;justify-content:center;height:32px;margin:0;padding:0 12px;background:var(--danger)!important;color:#fff!important;border:1px solid var(--danger);border-radius:4px;font-size:12.5px;font-weight:500}.delete-action:disabled{opacity:.65}
</style>
