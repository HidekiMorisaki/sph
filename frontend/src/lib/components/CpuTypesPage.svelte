<script lang="ts">
	import { onMount, tick } from 'svelte';
	import AddButton from '$lib/components/AddButton.svelte';
	import DatePicker from '$lib/components/DatePicker.svelte';
	import AssetManagementShell from '$lib/components/AssetManagementShell.svelte';
	import DetailModal from '$lib/components/DetailModal.svelte';
	import DiscardChangesDialog from '$lib/components/DiscardChangesDialog.svelte';
	import FormSection from '$lib/components/FormSection.svelte';
	import MasterList from '$lib/components/MasterList.svelte';
	import MasterPageHeader from '$lib/components/MasterPageHeader.svelte';
	import ModalBackdrop from '$lib/components/ModalBackdrop.svelte';
	import SearchSelect from '$lib/components/SearchSelect.svelte';
	import { apiData } from '$lib/api';
	import { formSnapshot } from '$lib/modalForm';

	type Manufacturer = { id: number; name: string };
	type CpuType = { id: number; displayName: string; manufacturerId: number; manufacturer: Manufacturer; series: string; modelNumber: string; sortOrder: number; officialUrl: string | null; sourceCheckedOn: string | null };
	type ModalMode = 'add' | 'edit' | 'detail' | null;
	type FormField = 'displayName' | 'manufacturerId' | 'series' | 'modelNumber' | 'sortOrder' | 'officialUrl' | 'sourceCheckedOn';
	const emptyForm = () => ({ displayName: '', manufacturerId: '', series: '', modelNumber: '', sortOrder: '0', officialUrl: '', sourceCheckedOn: '' });
	const columns = [
		{ key: 'displayName', label: 'Display Name', width: 30, value: (item: CpuType) => item.displayName },
		{ key: 'manufacturer', label: 'Manufacturer', width: 25, value: (item: CpuType) => item.manufacturer?.name ?? '' },
		{ key: 'series', label: 'Series', width: 20, value: (item: CpuType) => item.series },
		{ key: 'modelNumber', label: 'Model number', width: 20, value: (item: CpuType) => item.modelNumber }
	];

	let role = $state('');
	let list = $state<MasterList>();
	let manufacturers = $state<Manufacturer[]>([]);
	let notice = $state('');
	let mode = $state<ModalMode>(null);
	let selected = $state<CpuType | null>(null);
	let form = $state(emptyForm());
	let errors = $state<Partial<Record<FormField, string>>>({});
	let formError = $state('');
	let saving = $state(false);
	let removing = $state(false);
	let dialogElement = $state<HTMLDialogElement>();
	let sourceDateOpen = $state(false);
	let sourceDateAbove = $state(false);
	let addButton = $state<HTMLButtonElement>();
	let returnFocus = $state<HTMLElement | null>(null);
	let initialSnapshot = $state('');
	let confirmingDiscard = $state(false);
	let canManage = $derived(role === 'system_administrator' || role === 'business_administrator');
	let hasUnsavedChanges = $derived(mode === 'edit' && initialSnapshot !== '' && formSnapshot(form) !== initialSnapshot);

	async function initialize() {
		try {
			const session = await fetch('/v1/auth/session');
			if (!session.ok) return;
			role = (await apiData<{ user: { role: string } }>(session)).user.role;
			const response = await fetch('/v1/manufacturers?limit=500');
			manufacturers = response.ok ? await apiData<Manufacturer[]>(response) : [];
		} catch { notice = 'Unable to load manufacturers.'; }
	}
	function openModal(next: Exclude<ModalMode, null>, item: CpuType | null = null, trigger: HTMLButtonElement | null = null) {
		if (next !== 'detail' && !canManage) return;
		returnFocus = trigger ?? (document.activeElement instanceof HTMLElement ? document.activeElement : addButton ?? null);
		selected = item;
		mode = next;
		form = item ? { displayName: item.displayName, manufacturerId: String(item.manufacturerId), series: item.series, modelNumber: item.modelNumber, sortOrder: String(item.sortOrder), officialUrl: item.officialUrl ?? '', sourceCheckedOn: item.sourceCheckedOn?.slice(0, 10) ?? '' } : { ...emptyForm(), manufacturerId: manufacturers[0] ? String(manufacturers[0].id) : '' };
		errors = {};
		formError = '';
		sourceDateOpen = false;
		initialSnapshot = formSnapshot(form);
		confirmingDiscard = false;
		if (next !== 'detail') void tick().then(() => dialogElement?.querySelector<HTMLElement>('[name="displayName"]')?.focus());
	}
	function closeDetail() {
		mode = null;
		selected = null;
	}
	function closeModalImmediately() {
		confirmingDiscard = false;
		if (saving || removing) return;
		sourceDateOpen = false;
		mode = null;
		selected = null;
		void tick().then(() => returnFocus?.focus());
	}
	function requestCloseModal() {
		if (saving || removing) return;
		sourceDateOpen = false;
		if (hasUnsavedChanges) { confirmingDiscard = true; return; }
		closeModalImmediately();
	}
	function updateField(field: FormField, value: string) {
		form[field] = value;
		if (errors[field]) { const next = { ...errors }; delete next[field]; errors = next; }
		if (!Object.keys(errors).length) formError = '';
	}
	function toggleSourceDate() {
		if (!sourceDateOpen) {
			const trigger = dialogElement?.querySelector<HTMLButtonElement>('[data-field="sourceCheckedOn"] .date-trigger');
			const body = dialogElement?.querySelector<HTMLElement>('.app-modal-form-body');
			if (trigger && body) {
				const rect = trigger.getBoundingClientRect();
				const bounds = body.getBoundingClientRect();
				sourceDateAbove = bounds.bottom - rect.bottom < 340 && rect.top - bounds.top > bounds.bottom - rect.bottom;
			}
		}
		sourceDateOpen = !sourceDateOpen;
	}
	function officialUrlHref(value: string | null): string | null {
		if (!value) return null;
		try {
			const url = new URL(value);
			return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
		} catch { return null; }
	}
	function validate(): boolean {
		const next: Partial<Record<FormField, string>> = {};
		for (const field of ['displayName', 'series', 'modelNumber'] as const) if (!form[field].trim()) next[field] = 'This field is required.';
		if (!manufacturers.some((item) => String(item.id) === form.manufacturerId)) next.manufacturerId = 'Select a manufacturer.';
		if (!/^\d+$/.test(form.sortOrder) || !Number.isSafeInteger(Number(form.sortOrder))) next.sortOrder = 'Enter a non-negative whole number.';
		if (form.officialUrl) { try { const url = new URL(form.officialUrl); if (!['http:', 'https:'].includes(url.protocol)) next.officialUrl = 'Enter a valid URL.'; } catch { next.officialUrl = 'Enter a valid URL.'; } }
		if (form.sourceCheckedOn && !/^\d{4}-\d{2}-\d{2}$/.test(form.sourceCheckedOn)) next.sourceCheckedOn = 'Enter a valid date.';
		errors = next;
		if (!Object.keys(next).length) return true;
		formError = 'Correct the highlighted fields.';
		const first = Object.keys(next)[0];
		void tick().then(() => dialogElement?.querySelector<HTMLElement>(`[name="${first}"], [data-field="${first}"] button`)?.focus());
		return false;
	}
	async function save() {
		if (!canManage || !mode || mode === 'detail' || !validate()) return;
		saving = true;
		formError = '';
		try {
			const response = await fetch(`/v1/cpu-types${mode === 'edit' && selected ? `/${selected.id}` : ''}`, { method: mode === 'edit' ? 'PATCH' : 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(form) });
			if (!response.ok) {
				const payload = await response.json().catch(() => null) as { error?: { details?: { field?: string; reason: string }[] } } | null;
				const field = payload?.error?.details?.[0]?.field;
				if (response.status === 409 && field && ['displayName', 'modelNumber'].includes(field)) {
					errors = { [field]: 'This value is already in use.' };
					formError = 'Correct the highlighted field.';
					void tick().then(() => dialogElement?.querySelector<HTMLElement>(`[name="${field}"]`)?.focus());
				} else formError = response.status === 403 ? 'You do not have permission to save CPU types.' : 'Unable to save. Check the fields and try again.';
				return;
			}
			mode = null;
			selected = null;
			notice = 'CPU type saved.';
			await list?.refresh();
			void tick().then(() => returnFocus?.focus());
		} catch { formError = 'Unable to save CPU type.'; }
		finally { saving = false; }
	}
	async function remove(item: CpuType) {
		if (removing || !canManage || !confirm(`Delete ${item.displayName}?`)) return;
		removing = true;
		try {
			const response = await fetch(`/v1/cpu-types/${item.id}`, { method: 'DELETE' });
			if (!response.ok) { notice = response.status === 409 ? 'This CPU type is in use.' : 'Unable to delete CPU type.'; return; }
			notice = 'CPU type deleted.';
			await list?.refresh();
			void tick().then(() => document.querySelector<HTMLInputElement>('.search-box input')?.focus());
		} catch { notice = 'Unable to delete CPU type.'; }
		finally { removing = false; }
	}
	function handleWindowKeydown(event: KeyboardEvent) {
		if (event.defaultPrevented || confirmingDiscard) return;
		if (!mode || mode === 'detail' || !dialogElement) return;
		if (event.key === 'Escape') {
			event.preventDefault();
			if (sourceDateOpen) { sourceDateOpen = false; dialogElement.querySelector<HTMLButtonElement>('[data-field="sourceCheckedOn"] .date-trigger')?.focus(); }
			else requestCloseModal();
			return;
		}
		if (event.key !== 'Tab') return;
		const focusable = [...dialogElement.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), a[href]')];
		if (!focusable.length) return;
		const first = focusable[0], last = focusable[focusable.length - 1];
		if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
		else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
	}
	onMount(() => { void initialize(); });
</script>

{#snippet headerActions()}{#if canManage}<AddButton bind:element={addButton} label="Add CPU type" ariaLabel="Add CPU type" onclick={() => openModal('add')} />{/if}{/snippet}

<svelte:window onkeydown={handleWindowKeydown} />
<AssetManagementShell title="CPU types" active="">
	<div class="cpu-page">
		<MasterPageHeader title="CPU types" description="Manage CPU models available to IT assets." actions={headerActions} />
		{#if notice}<p class="notice" role="status">{notice}</p>{/if}
		<MasterList bind:this={list} endpoint="/v1/cpu-types" title="CPU types" listHeading="All CPU types" description="Search and manage CPU models." {columns} {canManage} initialSortBy="displayName" pageSizeStorageKey="cpu-types-page-size" minTableWidth={760} onDetail={(item, trigger) => openModal('detail', item as CpuType, trigger)} onEdit={(item, trigger) => openModal('edit', item as CpuType, trigger)} onDelete={(item) => remove(item as CpuType)} />
	</div>
</AssetManagementShell>

{#if mode === 'detail' && selected}
	{@const officialUrl = officialUrlHref(selected.officialUrl)}
	<DetailModal title="CPU type details" titleId="cpu-detail-title" closeLabel="Close CPU type details" {returnFocus} compact dialogClass="cpu-dialog" onClose={closeDetail}>
		<section class="app-detail-section"><h3>Basic information</h3><dl class="app-detail-grid"><div><dt>Display name</dt><dd>{selected.displayName}</dd></div><div><dt>Manufacturer</dt><dd>{selected.manufacturer?.name}</dd></div><div><dt>Series</dt><dd>{selected.series}</dd></div><div><dt>Model number</dt><dd>{selected.modelNumber}</dd></div><div><dt>Sort order</dt><dd>{selected.sortOrder}</dd></div></dl></section>
		<section class="app-detail-section"><h3>Reference information</h3><dl class="app-detail-grid"><div class="app-detail-wide"><dt>Official URL</dt><dd>{#if officialUrl}<a class="detail-link" href={officialUrl} target="_blank" rel="noopener noreferrer">{selected.officialUrl}</a>{:else}{selected.officialUrl ?? ''}{/if}</dd></div><div><dt>Source checked</dt><dd>{selected.sourceCheckedOn?.slice(0, 10) ?? ''}</dd></div></dl></section>
	</DetailModal>
{:else if mode}
	<ModalBackdrop onDismiss={requestCloseModal} disabled={saving || removing}><dialog bind:this={dialogElement} class="cpu-dialog app-modal app-modal--compact" open aria-modal="true" aria-labelledby="cpu-dialog-title">
		<header><h2 id="cpu-dialog-title">{mode === 'add' ? 'Add cpu type' : 'Edit cpu type'}</h2><button class="modal-close app-modal-close" type="button" aria-label="Close CPU type dialog" onclick={requestCloseModal}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg></button></header>
		<form id="cpu-form" class="cpu-form app-modal-form" novalidate onsubmit={(event) => { event.preventDefault(); void save(); }}>
			<div class="cpu-form-body app-modal-form-body">
				{#if formError}<div class="app-modal-error-summary" role="alert"><strong>Unable to save CPU type</strong><span>{formError}</span></div>{/if}
				<FormSection title="Basic information" framed>
				<label><span>Display name <span class="required" aria-hidden="true">*</span></span><input name="displayName" value={form.displayName} required maxlength="255" class:invalid={Boolean(errors.displayName)} aria-invalid={Boolean(errors.displayName)} aria-describedby={errors.displayName ? 'displayName-error' : undefined} oninput={(event) => updateField('displayName', event.currentTarget.value)} />{#if errors.displayName}<span class="field-error" id="displayName-error" role="alert">{errors.displayName}</span>{/if}</label>
				<SearchSelect label="Manufacturer" field="manufacturerId" name="manufacturerId" value={form.manufacturerId} options={manufacturers.map((item) => ({ value: String(item.id), label: item.name }))} required disabled={!manufacturers.length} error={errors.manufacturerId ?? ''} onOpen={() => sourceDateOpen = false} onSelect={(value) => updateField('manufacturerId', value)} />
				<label><span>Series <span class="required" aria-hidden="true">*</span></span><input name="series" value={form.series} required maxlength="128" class:invalid={Boolean(errors.series)} aria-invalid={Boolean(errors.series)} aria-describedby={errors.series ? 'series-error' : undefined} oninput={(event) => updateField('series', event.currentTarget.value)} />{#if errors.series}<span class="field-error" id="series-error" role="alert">{errors.series}</span>{/if}</label>
				<label><span>Model number <span class="required" aria-hidden="true">*</span></span><input name="modelNumber" value={form.modelNumber} required maxlength="128" class:invalid={Boolean(errors.modelNumber)} aria-invalid={Boolean(errors.modelNumber)} aria-describedby={errors.modelNumber ? 'modelNumber-error' : undefined} oninput={(event) => updateField('modelNumber', event.currentTarget.value)} />{#if errors.modelNumber}<span class="field-error" id="modelNumber-error" role="alert">{errors.modelNumber}</span>{/if}</label>
				<label><span>Sort order <span class="required" aria-hidden="true">*</span></span><input name="sortOrder" type="number" min="0" step="1" value={form.sortOrder} required class:invalid={Boolean(errors.sortOrder)} aria-invalid={Boolean(errors.sortOrder)} aria-describedby={errors.sortOrder ? 'sortOrder-error' : undefined} oninput={(event) => updateField('sortOrder', event.currentTarget.value)} />{#if errors.sortOrder}<span class="field-error" id="sortOrder-error" role="alert">{errors.sortOrder}</span>{/if}</label>
				</FormSection>
				<FormSection title="Reference information" framed>
				<label><span>Official URL</span><input name="officialUrl" type="url" value={form.officialUrl} maxlength="1000" class:invalid={Boolean(errors.officialUrl)} aria-invalid={Boolean(errors.officialUrl)} aria-describedby={errors.officialUrl ? 'officialUrl-error' : undefined} oninput={(event) => updateField('officialUrl', event.currentTarget.value)} />{#if errors.officialUrl}<span class="field-error" id="officialUrl-error" role="alert">{errors.officialUrl}</span>{/if}</label>
				<DatePicker label="Source checked" field="sourceCheckedOn" value={form.sourceCheckedOn} error={errors.sourceCheckedOn ?? ''} above={sourceDateAbove} open={sourceDateOpen} onToggle={toggleSourceDate} onSelect={(value) => { updateField('sourceCheckedOn', value); sourceDateOpen = false; }} />
				</FormSection>
			</div>
			<footer class="app-modal-footer"><button class="secondary" type="button" disabled={saving} onclick={requestCloseModal}>Cancel</button><button class="app-primary-action" type="submit" disabled={saving}>{saving ? 'Saving...' : mode === 'add' ? 'Add cpu type' : 'Save changes'}</button></footer>
		</form>
	</dialog></ModalBackdrop>
	{#if confirmingDiscard}<DiscardChangesDialog onContinue={() => confirmingDiscard = false} onDiscard={closeModalImmediately} />{/if}
{/if}

<style>
	.cpu-page{display:flex;min-width:0;width:100%;height:calc(100dvh - 124px);min-height:0;flex-direction:column}.notice{margin:0 0 14px;color:var(--text-secondary);font-size:13px}
	.detail-link{color:#337ab7;text-decoration:underline;text-underline-offset:2px}:global(html[data-theme='dark']) .detail-link{color:#77b9f0}
	input:focus-visible{outline:2px solid #1abb9c;outline-offset:2px}@media(max-width:760px){.cpu-page{width:calc(100vw - 96px);max-width:calc(100vw - 96px)}}
</style>
