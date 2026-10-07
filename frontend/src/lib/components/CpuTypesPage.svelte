<script lang="ts">
	import { localeMessages, formatLocaleTemplate } from '$lib/locale-messages';
	import { onMount, tick } from 'svelte';
	import AddButton from '$lib/components/AddButton.svelte';
	import DatePicker from '$lib/components/DatePicker.svelte';
	import DetailModal from '$lib/components/DetailModal.svelte';
	import MasterHistorySection from '$lib/components/MasterHistorySection.svelte';
	import DiscardChangesDialog from '$lib/components/DiscardChangesDialog.svelte';
	import FormSection from '$lib/components/FormSection.svelte';
	import MasterList from '$lib/components/MasterList.svelte';
	import ModalBackdrop from '$lib/components/ModalBackdrop.svelte';
	import SearchSelect from '$lib/components/SearchSelect.svelte';
	import StatusNotice from '$lib/components/StatusNotice.svelte';
	import { apiData } from '$lib/api';
	import { formatDate, localization } from '$lib/localization';
	import { formSnapshot } from '$lib/modalForm';

	let text = $derived(localeMessages[$localization.displayLanguage].masters);
	function m(key: string | undefined): string { return key ? text[key as keyof typeof text] ?? text.invalidValue : ''; }
	function t(key: keyof typeof text, ...values: (string | number)[]) { return formatLocaleTemplate(text[key], ...values); }

	type Manufacturer = { id: number; name: string; sortOrder?: number };
	type CpuType = { id: number; name: string; manufacturerId: number; manufacturer: Manufacturer; series: string; modelNumber: string; sortOrder: number; usageCount?: number; officialUrl: string | null; sourceCheckedOn: string | null; notes: string | null };
	type ModalMode = 'add' | 'edit' | 'detail' | null;
	type FormField = 'name' | 'manufacturerId' | 'series' | 'modelNumber' | 'officialUrl' | 'sourceCheckedOn' | 'notes';
	const emptyForm = () => ({ name: '', manufacturerId: '', series: '', modelNumber: '', officialUrl: '', sourceCheckedOn: '', notes: '' });
	const columns = $derived([{ key: 'name', label: text.modelNumber, width: 86, sortable: false, value: (item: CpuType) => item.modelNumber }]);
	const seriesIds = new Map<string, number>();
	let nextSeriesId = 1;
	function treeParent(row: { id: number; [key: string]: unknown }) {
		const item = row as CpuType;
		if (!item.manufacturer) return null;
		const key = JSON.stringify([item.manufacturerId, item.series]);
		let id = seriesIds.get(key);
		if (id === undefined) { id = nextSeriesId++; seriesIds.set(key, id); }
		return { id, label: item.series, order: item.sortOrder, ancestor: { id: item.manufacturerId, label: item.manufacturer.name, order: item.manufacturer.sortOrder } };
	}

	let canManage = $state(false);
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
	let hasDraftChanges = $derived(initialSnapshot !== '' && formSnapshot(form) !== initialSnapshot);
	let hasUnsavedChanges = $derived(mode === 'edit' && hasDraftChanges);

	async function initialize() {
		try {
			const session = await fetch('/v1/auth/session');
			if (!session.ok) return;
			canManage = (await apiData<{ user: { capabilities: { canManageMasters: boolean } } }>(session)).user.capabilities.canManageMasters;
			const response = await fetch('/v1/manufacturers?limit=500');
			manufacturers = response.ok ? await apiData<Manufacturer[]>(response) : [];
		} catch { notice = 'manufacturersFailed'; }
	}
	function generatedName() {
		const manufacturer = manufacturers.find((item) => String(item.id) === form.manufacturerId)?.name ?? '';
		return [manufacturer, form.series, form.modelNumber].map((value) => value.trim()).filter(Boolean).join(' ');
	}
	function updateGeneratedName() {
		if (mode === 'add' || mode === 'edit') form.name = generatedName();
	}
	function openModal(next: Exclude<ModalMode, null>, item: CpuType | null = null, trigger: HTMLElement | null = null) {
		if (next !== 'detail' && !canManage) return;
		returnFocus = trigger ?? (document.activeElement instanceof HTMLElement ? document.activeElement : addButton ?? null);
		selected = item;
		mode = next;
		form = item ? { name: item.name, manufacturerId: String(item.manufacturerId), series: item.series, modelNumber: item.modelNumber, officialUrl: item.officialUrl ?? '', sourceCheckedOn: item.sourceCheckedOn?.slice(0, 10) ?? '', notes: item.notes ?? '' } : { ...emptyForm(), manufacturerId: manufacturers[0] ? String(manufacturers[0].id) : '' };
		updateGeneratedName();
		errors = {};
		formError = '';
		sourceDateOpen = false;
		initialSnapshot = formSnapshot(form);
		confirmingDiscard = false;
		if (next !== 'detail') void tick().then(() => dialogElement?.querySelector<HTMLElement>('[name="manufacturerId"]')?.focus());
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
		const regeneratesName = (mode === 'add' || mode === 'edit') && ['manufacturerId', 'series', 'modelNumber'].includes(field);
		if (regeneratesName) updateGeneratedName();
		if (errors[field]) { const next = { ...errors }; delete next[field]; errors = next; }
		if (regeneratesName && errors.name) { const next = { ...errors }; delete next.name; errors = next; }
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
		for (const field of ['name', 'series', 'modelNumber'] as const) if (!form[field].trim()) next[field] = 'fieldRequired';
		if (!manufacturers.some((item) => String(item.id) === form.manufacturerId)) next.manufacturerId = 'manufacturerRequired';
		if (form.officialUrl) { try { const url = new URL(form.officialUrl); if (!['http:', 'https:'].includes(url.protocol)) next.officialUrl = 'urlInvalid'; } catch { next.officialUrl = 'urlInvalid'; } }
		if (form.sourceCheckedOn && !/^\d{4}-\d{2}-\d{2}$/.test(form.sourceCheckedOn)) next.sourceCheckedOn = 'dateInvalid';
		errors = next;
		if (!Object.keys(next).length) return true;
		formError = 'correctFields';
		const first = Object.keys(next)[0];
		void tick().then(() => dialogElement?.querySelector<HTMLElement>(`[name="${first}"], [data-field="${first}"] button`)?.focus());
		return false;
	}
	async function save() {
		updateGeneratedName();
		if (!canManage || !mode || mode === 'detail' || !validate()) return;
		saving = true;
		formError = '';
		try {
			const response = await fetch(`/v1/cpu-types${mode === 'edit' && selected ? `/${selected.id}` : ''}`, { method: mode === 'edit' ? 'PATCH' : 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...form, sortOrder: mode === 'edit' ? selected?.sortOrder ?? 2_147_483_647 : 2_147_483_647 }) });
			if (!response.ok) {
				const payload = await response.json().catch(() => null) as { error?: { details?: { field?: string; reason: string }[] } } | null;
				const field = payload?.error?.details?.[0]?.field;
				if (response.status === 409 && field && ['name', 'modelNumber'].includes(field)) {
					errors = { [field]: 'valueInUse' };
					formError = 'correctField';
					void tick().then(() => dialogElement?.querySelector<HTMLElement>(`[name="${field}"]`)?.focus());
				} else formError = response.status === 403 ? 'cpuSaveForbidden' : 'cpuSaveFailed';
				return;
			}
			mode = null;
			selected = null;
			notice = 'cpuSaved';
			await list?.refresh();
			void tick().then(() => returnFocus?.focus());
		} catch { formError = 'cpuSaveRetry'; }
		finally { saving = false; }
	}
	async function remove(item: CpuType) {
		if (removing || !canManage) return;
		if (item.usageCount && item.usageCount > 0) { notice = 'deleteInUse'; return; }
		notice = '';
		if (!confirm(t('deleteConfirm', item.name))) return;
		removing = true;
		try {
			const response = await fetch(`/v1/cpu-types/${item.id}`, { method: 'DELETE' });
			if (!response.ok) { notice = response.status === 409 ? 'deleteInUse' : 'cpuDeleteFailed'; return; }
			notice = 'cpuDeleted';
			await list?.refresh();
			void tick().then(() => addButton?.focus());
		} catch { notice = 'cpuDeleteFailed'; }
		finally { removing = false; }
	}
	function handleWindowKeydown(event: KeyboardEvent) {
		if (event.defaultPrevented || confirmingDiscard) return;
		if (!mode || mode === 'detail' || !dialogElement) return;
		if (event.key === 'Escape') {
			event.preventDefault();
			if (sourceDateOpen) { sourceDateOpen = false; dialogElement.querySelector<HTMLButtonElement>('[data-field="sourceCheckedOn"] .date-trigger')?.focus(); }
			else if (mode === 'add' && hasDraftChanges && !saving) confirmingDiscard = true;
			else requestCloseModal();
			return;
		}
		if (event.key !== 'Tab') return;
		const focusable = [...dialogElement.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href]')];
		if (!focusable.length) return;
		const first = focusable[0], last = focusable[focusable.length - 1];
		if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
		else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
	}
	onMount(() => { void initialize(); });
</script>

{#snippet headerActions()}{#if canManage}<AddButton bind:element={addButton} label={text.addButton} ariaLabel={text.cpuAdd} onclick={() => openModal('add')} />{/if}{/snippet}

<svelte:window onkeydown={handleWindowKeydown} />
	<div class="cpu-page">
		{#if notice}<StatusNotice message={m(notice)} tone={notice === 'cpuSaved' || notice === 'cpuDeleted' ? 'success' : 'error'} onDismiss={() => notice = ''} />{/if}
		<MasterList bind:this={list} endpoint="/v1/cpu-types" title={text.cpuTitle} listHeading={text.cpuTitle} description={text.cpuDescription} {columns} {canManage} unpaged showNameIcon {treeParent} initialSortBy="sortOrder" minTableWidth={0} actionWidth={14} headerActions={headerActions} reorderEndpoint="/v1/it-asset-orders/cpu-types" reorderHint={text.reorderHint} reorderSavingLabel={text.reorderSaving} onReorderError={(reason) => notice = reason === 'conflict' ? 'reorderConflict' : reason === 'forbidden' ? 'reorderForbidden' : 'reorderFailed'} onDetail={(item, trigger) => openModal('detail', item as CpuType, trigger)} onEdit={(item, trigger) => openModal('edit', item as CpuType, trigger)} onDelete={(item) => remove(item as CpuType)} />
	</div>

{#if mode === 'detail' && selected}
	{@const officialUrl = officialUrlHref(selected.officialUrl)}
	<DetailModal title={text.cpuDetail} titleId="cpu-detail-title" closeLabel={text.cpuDetailClose} {returnFocus} compact dialogClass="cpu-dialog" onClose={closeDetail}>
		<section class="app-detail-section"><h3>{text.basicInformation}</h3><dl class="app-detail-grid"><div><dt>{text.name}</dt><dd>{selected.name}</dd></div><div><dt>{text.manufacturer}</dt><dd>{selected.manufacturer?.name}</dd></div><div><dt>{text.series}</dt><dd>{selected.series}</dd></div><div><dt>{text.modelNumber}</dt><dd>{selected.modelNumber}</dd></div></dl></section>
		<section class="app-detail-section"><h3>{text.referenceInformation}</h3><dl class="app-detail-grid"><div class="app-detail-wide"><dt>{text.officialUrl}</dt><dd>{#if officialUrl}<a class="detail-link" href={officialUrl} target="_blank" rel="noopener noreferrer">{selected.officialUrl}</a>{:else}{selected.officialUrl ?? ''}{/if}</dd></div><div><dt>{text.sourceChecked}</dt><dd>{formatDate(selected.sourceCheckedOn,$localization)}</dd></div><div class="app-detail-wide"><dt>{text.notes}</dt><dd class="app-detail-notes">{selected.notes ?? ''}</dd></div></dl></section>
		<MasterHistorySection endpoint="/v1/cpu-types" itemId={selected.id} fieldLabels={{ name: text.name, manufacturerId: text.manufacturer, series: text.series, modelNumber: text.modelNumber, officialUrl: text.officialUrl, sourceCheckedOn: text.sourceChecked, notes: text.notes }} hiddenFields={['sortOrder']} dateFields={['sourceCheckedOn']} />
	</DetailModal>
{:else if mode}
	<ModalBackdrop><dialog bind:this={dialogElement} class="cpu-dialog app-modal app-modal--compact" open aria-modal="true" aria-labelledby="cpu-dialog-title">
		<header><h2 id="cpu-dialog-title">{mode === 'add' ? text.cpuAdd : text.cpuEdit}</h2><button class="modal-close app-modal-close" type="button" aria-label={text.cpuClose} onclick={requestCloseModal}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg></button></header>
		<form id="cpu-form" class="cpu-form app-modal-form" novalidate onsubmit={(event) => { event.preventDefault(); void save(); }}>
			<div class="cpu-form-body app-modal-form-body">
				{#if formError}<StatusNotice title={text.cpuSaveTitle} message={m(formError)} tone="error" onDismiss={() => formError = ''} />{/if}
				<FormSection title={text.basicInformation} framed>
				<SearchSelect label={text.manufacturer} field="manufacturerId" name="manufacturerId" value={form.manufacturerId} options={manufacturers.map((item) => ({ value: String(item.id), label: item.name }))} required disabled={!manufacturers.length} error={m(errors.manufacturerId ?? '')} onOpen={() => sourceDateOpen = false} onSelect={(value) => updateField('manufacturerId', value)} />
				<label><span>{text.series} <span class="required" aria-hidden="true">*</span></span><input name="series" value={form.series} required maxlength="128" class:invalid={Boolean(errors.series)} aria-invalid={Boolean(errors.series)} aria-describedby={errors.series ? 'series-error' : undefined} oninput={(event) => updateField('series', event.currentTarget.value)} />{#if errors.series}<span class="field-error" id="series-error" role="alert">{m(errors.series)}</span>{/if}</label>
				<label><span>{text.modelNumber} <span class="required" aria-hidden="true">*</span></span><input name="modelNumber" value={form.modelNumber} required maxlength="128" class:invalid={Boolean(errors.modelNumber)} aria-invalid={Boolean(errors.modelNumber)} aria-describedby={errors.modelNumber ? 'modelNumber-error' : undefined} oninput={(event) => updateField('modelNumber', event.currentTarget.value)} />{#if errors.modelNumber}<span class="field-error" id="modelNumber-error" role="alert">{m(errors.modelNumber)}</span>{/if}</label>
				<label><span>{text.displayName} <span class="required" aria-hidden="true">*</span></span><input name="name" value={form.name} readonly required maxlength="255" class:invalid={Boolean(errors.name)} aria-invalid={Boolean(errors.name)} aria-describedby={errors.name ? 'name-error' : undefined} />{#if errors.name}<span class="field-error" id="name-error" role="alert">{m(errors.name)}</span>{/if}</label>
				</FormSection>
				<FormSection title={text.referenceInformation} framed>
					<label><span>{text.officialUrl}</span><input name="officialUrl" type="url" value={form.officialUrl} maxlength="1000" class:invalid={Boolean(errors.officialUrl)} aria-invalid={Boolean(errors.officialUrl)} aria-describedby={errors.officialUrl ? 'officialUrl-error' : undefined} oninput={(event) => updateField('officialUrl', event.currentTarget.value)} />{#if errors.officialUrl}<span class="field-error" id="officialUrl-error" role="alert">{m(errors.officialUrl)}</span>{/if}</label>
					<DatePicker label={text.sourceChecked} field="sourceCheckedOn" value={form.sourceCheckedOn} error={m(errors.sourceCheckedOn ?? '')} above={sourceDateAbove} open={sourceDateOpen} onToggle={toggleSourceDate} onSelect={(value) => { updateField('sourceCheckedOn', value); sourceDateOpen = false; }} />
					<label class="notes-field"><span>{text.notes}</span><textarea name="notes" value={form.notes} maxlength="5000" oninput={(event) => updateField('notes', event.currentTarget.value)}></textarea></label>
				</FormSection>
			</div>
			<footer class="app-modal-footer"><button class="secondary" type="button" disabled={saving} onclick={requestCloseModal}>{text.cancel}</button><button class="app-primary-action" type="submit" disabled={saving || (mode === 'edit' && !hasUnsavedChanges)}>{saving ? text.saving : mode === 'add' ? text.cpuAdd : text.saveChanges}</button></footer>
		</form>
	</dialog></ModalBackdrop>
	{#if confirmingDiscard}<DiscardChangesDialog onContinue={() => confirmingDiscard = false} onDiscard={closeModalImmediately} />{/if}
{/if}

<style>
	.cpu-page{display:flex;min-width:0;width:100%;min-height:0;flex-direction:column}.cpu-page :global(.master-list){max-height:none}.cpu-page :global(.master-header){flex-wrap:wrap}.cpu-page :global(thead){display:none}.cpu-page :global(th),.cpu-page :global(td){padding-right:6px;padding-left:6px;overflow-wrap:anywhere}.cpu-page :global(td:first-child){padding-left:10px}.cpu-page :global(.tree-child td:first-child){padding-left:38px}.cpu-page :global(.tree-grandchild td:first-child){padding-left:58px}.cpu-page :global(.actions-cell){padding-right:6px;padding-left:2px}
	.detail-link{color:#337ab7;text-decoration:underline;text-underline-offset:2px}.notes-field{grid-column:1/-1}:global(html[data-theme='dark']) .detail-link{color:#77b9f0}
	input:focus-visible{outline:2px solid #1abb9c;outline-offset:2px}@media(max-width:760px){.cpu-page{width:calc(100vw - 96px);max-width:calc(100vw - 96px)}}
</style>
