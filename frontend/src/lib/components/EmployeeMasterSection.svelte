<script lang="ts">
	import { localeMessages, formatLocaleTemplate } from '$lib/locale-messages';
	import { localization } from '$lib/localization';
	import { onMount, tick } from 'svelte';
	import AddButton from '$lib/components/AddButton.svelte';
	import DiscardChangesDialog from '$lib/components/DiscardChangesDialog.svelte';
	import FormSection from '$lib/components/FormSection.svelte';
	import MasterList from '$lib/components/MasterList.svelte';
	import MasterRecordDetailModal from '$lib/components/MasterRecordDetailModal.svelte';
	import ModalBackdrop from '$lib/components/ModalBackdrop.svelte';
	import ModalHeader from '$lib/components/ModalHeader.svelte';
	import SearchSelect from '$lib/components/SearchSelect.svelte';
	import StatusNotice from '$lib/components/StatusNotice.svelte';
	import type { EmployeeMaster } from '$lib/employees';
	import { formSnapshot } from '$lib/modalForm';
	import '$lib/styles/add-button.css';

	let text = $derived(localeMessages[$localization.displayLanguage].masters);
	let commonText = $derived(localeMessages[$localization.displayLanguage].common);
	function m(key: string | undefined): string { return key ? text[key as keyof typeof text] ?? text.invalidValue : ''; }
	function t(key: keyof typeof text, ...values: (string | number)[]) { return formatLocaleTemplate(text[key], ...values); }

	type Item = EmployeeMaster;
	let labels: Record<string, string> = $derived({ departments: text.departments, 'employee-groups': text.employeeGroups, positions: text.positions, 'employment-types': text.employmentTypes, branches: text.branches });
	let singularLabels: Record<string, string> = $derived({ departments: text.departmentItem, 'employee-groups': text.groupItem, positions: text.positionItem, 'employment-types': text.employmentTypeItem, branches: text.branchItem });
	let { resource, canManage }: { resource: string; canManage: boolean } = $props();
	let columns = $derived([{ key: 'name', label: text.name, width: 86, sortable: false, value: (item: Item) => item.name }]);
	let departmentOrderIds = $state<number[]>([]);
	let treeParent = $derived.by(() => {
		const orderedIds = departmentOrderIds;
		return resource === 'employee-groups' ? (item: { id: number; [key: string]: unknown }) => {
			const department = (item as Item).department;
			if (!department) return null;
			const order = orderedIds.indexOf(department.id);
			return { id: department.id, label: department.name, order: order < 0 ? Number.MAX_SAFE_INTEGER : order };
		} : undefined;
	});
	let title = $derived(labels[resource] ?? text.employeeMasters);
	let sectionDescription = $derived(({ 'employment-types': text.employmentTypesSectionDescription, positions: text.positionsSectionDescription, departments: text.departmentsSectionDescription, 'employee-groups': text.employeeGroupsSectionDescription } as Record<string, string>)[resource] ?? '');
	let itemLabel = $derived(singularLabels[resource] ?? text.item);
	let addLabel = $derived(t('addItem', itemLabel));
	let endpoint = $derived('/v1/' + resource);
	let list = $state<MasterList>();
	let name = $state('');
	let notes = $state('');
	let departmentId = $state('');
	let departments = $state<EmployeeMaster[]>([]);
	const departmentOrderEvent = 'employee-department-order-changed';
	function handleReordered(orderedIds: number[]) {
		if (resource === 'departments') window.dispatchEvent(new CustomEvent(departmentOrderEvent, { detail: orderedIds }));
	}
	async function loadDepartments() {
		const all: EmployeeMaster[] = [];
		let total = Infinity;
		while (all.length < total) {
			const response = await fetch(`/v1/departments?sortBy=sortOrder&sortOrder=asc&offset=${all.length}&limit=500`);
			if (!response.ok) return;
			const payload = await response.json() as { data: EmployeeMaster[]; meta: { total: number } };
			if (!payload.data.length && all.length < payload.meta.total) return;
			all.push(...payload.data);
			total = payload.meta.total;
		}
		departments = [...all].sort((left, right) => left.name.localeCompare(right.name));
		if (!departmentOrderIds.length) departmentOrderIds = all.map((item) => item.id);
	}
	let editing = $state<Item | null>(null);
	let detailItem = $state<Item | null>(null);
	let detailReturnFocus = $state<HTMLElement | null>(null);
	let modalTitle = $derived(t(editing ? 'editItem' : 'addItem', itemLabel));
	let formOpen = $state(false);
	let saving = $state(false);
	let message = $state('');
	let formError = $state('');
	let errors = $state<{ name?: string; departmentId?: string }>({});
	let nameInput = $state<HTMLInputElement>();
	let dialogElement = $state<HTMLDialogElement>();
	let addButton = $state<HTMLButtonElement>();
	let returnFocus: HTMLElement | null = null;
	let initialSnapshot = $state('');
	let confirmingDiscard = $state(false);

	let isGroup = $derived(resource === 'employee-groups');
	let hasDraftChanges = $derived(initialSnapshot !== '' && formSnapshot({ name, departmentId, notes }) !== initialSnapshot);
	let hasUnsavedChanges = $derived(Boolean(editing) && hasDraftChanges);
	function focusFirstField() {
		if (isGroup) dialogElement?.querySelector<HTMLButtonElement>('[data-field="departmentId"] .form-select-trigger')?.focus();
		else nameInput?.focus();
	}
	function resetForm() { editing = null; name = ''; departmentId = ''; notes = ''; errors = {}; formError = ''; formOpen = false; initialSnapshot = ''; confirmingDiscard = false; }
	function edit(item: Item, trigger: HTMLButtonElement | null) {
		returnFocus = trigger;
		editing = item; name = item.name; departmentId = item.departmentId == null ? '' : String(item.departmentId); notes = item.notes ?? ''; errors = {}; formError = ''; formOpen = true; initialSnapshot = formSnapshot({ name, departmentId, notes }); confirmingDiscard = false;
		void tick().then(focusFirstField);
	}
	function add() {
		returnFocus = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : addButton ?? null;
		resetForm(); initialSnapshot = formSnapshot({ name, departmentId, notes }); formOpen = true; void tick().then(focusFirstField);
	}
	function closeFormImmediately() {
		if (saving) return;
		const focusTarget = returnFocus; resetForm(); void tick().then(() => focusTarget?.focus());
	}
	function requestCloseForm() { if (saving) return; if (hasUnsavedChanges) { confirmingDiscard = true; return; } closeFormImmediately(); }
	async function save() {
		if (saving) return;
		errors = { ...(!name.trim() ? { name: 'nameRequired' } : {}), ...(isGroup && !departmentId ? { departmentId: 'departmentRequired' } : {}) };
		if (Object.keys(errors).length) { formError = 'correctFields'; await tick(); if (errors.departmentId) focusFirstField(); else nameInput?.focus(); return; }
		saving = true; formError = '';
		try {
			const payload = isGroup ? { name, departmentId, notes } : { name, notes };
			const response = await fetch(endpoint + (editing ? '/' + editing.id : ''), { method: editing ? 'PATCH' : 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
			if (!response.ok) {
				const payload = await response.json().catch(() => null) as { error?: { code?: string; details?: { field?: string }[] } } | null;
				const field = payload?.error?.details?.[0]?.field;
				if (field === 'name') { errors = { name: 'nameDuplicate' }; formError = 'correctField'; await tick(); nameInput?.focus(); }
				else if (field === 'departmentId') { errors = { departmentId: 'activeDepartment' }; formError = 'correctField'; await tick(); focusFirstField(); }
				else if (payload?.error?.code === 'RESOURCE_IN_USE') formError = 'groupInUse';
				else formError = response.status === 403 ? 'saveForbidden' : 'saveFailed';
				return;
			}
			const focusTarget = returnFocus; resetForm(); await list?.refresh(); void tick().then(() => focusTarget?.focus());
		} catch { formError = 'saveRetry'; }
		finally { saving = false; }
	}
	async function remove(item: Item) {
		if (item.usageCount && item.usageCount > 0) { message = 'deleteInUse'; return; }
		message = '';
		if (!confirm(t('deleteConfirm', item.name))) return;
		const response = await fetch(`${endpoint}/${item.id}`, { method: 'DELETE' });
		if (!response.ok) { message = response.status === 409 ? 'deleteInUse' : response.status === 403 ? 'deleteForbidden' : 'deleteFailed'; return; }
		message = ''; await list?.refresh();
	}
	function handleWindowKeydown(event: KeyboardEvent) {
		if (event.defaultPrevented || confirmingDiscard || !formOpen || !dialogElement) return;
		if (event.key === 'Escape') { event.preventDefault(); if (!editing && hasDraftChanges && !saving) confirmingDiscard = true; else requestCloseForm(); return; }
		if (event.key !== 'Tab') return;
		const focusable = [...dialogElement.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),textarea:not([disabled])')];
		if (!focusable.length) return;
		const first = focusable[0], last = focusable[focusable.length - 1];
		if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
		else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
	}
	onMount(() => {
		if (!isGroup) return;
		const updateOrder = (event: Event) => { departmentOrderIds = (event as CustomEvent<number[]>).detail; };
		window.addEventListener(departmentOrderEvent, updateOrder);
		void loadDepartments();
		return () => window.removeEventListener(departmentOrderEvent, updateOrder);
	});
</script>

{#snippet headerActions()}
	{#if canManage}<AddButton bind:element={addButton} label={text.addButton} ariaLabel={addLabel} onclick={add} />{/if}
{/snippet}

<svelte:window onkeydown={handleWindowKeydown} />
<div class="master-section">
	{#if message}<StatusNotice message={m(message)} tone="error" onDismiss={() => message = ''} />{/if}
	<div class="panel"><MasterList bind:this={list} {endpoint} {columns} {title} listHeading={title} description={sectionDescription} {canManage} unpaged showNameIcon {treeParent} minTableWidth={0} actionWidth={14} headerActions={headerActions} initialSortBy="sortOrder" reorderEndpoint={`/v1/workforce-orders/${resource}`} reorderHint={text.reorderHint} reorderSavingLabel={text.reorderSaving} onReorderError={(reason) => message = reason === 'conflict' ? 'reorderConflict' : reason === 'forbidden' ? 'reorderForbidden' : 'reorderFailed'} onReordered={handleReordered} onDetail={(item, trigger) => { detailItem = item as Item; detailReturnFocus = trigger; }} onEdit={(item, trigger) => edit(item as Item, trigger)} onDelete={(item) => remove(item as Item)} /></div>
</div>

{#if detailItem}<MasterRecordDetailModal title={`${title} ${commonText.detail}`} titleId="employee-master-detail-title" sectionTitle={text.basicInformation} closeLabel={commonText.close} returnFocus={detailReturnFocus} {endpoint} itemId={detailItem.id} fields={[{ key: 'name', label: text.name, value: detailItem.name }, ...(isGroup ? [{ key: 'departmentId', label: text.department, value: detailItem.department?.name ?? detailItem.departmentId }] : []), { key: 'notes', label: text.notes, value: detailItem.notes }]} hiddenHistoryFields={['sortOrder']} onClose={() => detailItem = null} />{/if}

{#if canManage && formOpen}
	<ModalBackdrop><dialog bind:this={dialogElement} class="master-dialog app-modal app-modal--compact" open aria-modal="true" aria-labelledby="employee-master-dialog-title">
		<ModalHeader title={modalTitle} titleId="employee-master-dialog-title" closeLabel={t('closeForm', itemLabel)} disabled={saving} onClose={requestCloseForm} />
		<form class="app-modal-form" novalidate onsubmit={(event) => { event.preventDefault(); void save(); }}>
			<div class="master-form-body app-modal-form-body">
				{#if formError}<StatusNotice title={text.saveTitle} message={m(formError)} tone="error" onDismiss={() => formError = ''} />{/if}
				<FormSection title={text.basicInformation} columns={2} framed>
				{#if isGroup}<SearchSelect label={text.department} field="departmentId" value={departmentId} options={[{ value: '', label: '-' }, ...departments.map((item) => ({ value: String(item.id), label: item.name }))]} required error={m(errors.departmentId ?? '')} onSelect={(value) => { departmentId = value; errors.departmentId = undefined; formError = ''; }} />{/if}
				<label><span>{text.name} <span class="required" aria-hidden="true">*</span></span><input bind:this={nameInput} bind:value={name} maxlength="128" placeholder={text.nameExample} class:invalid={!!errors.name} aria-invalid={!!errors.name} aria-describedby={errors.name ? 'name-error' : undefined} oninput={() => { errors.name = undefined; formError = ''; }} />{#if errors.name}<small id="name-error" class="field-error">{m(errors.name)}</small>{/if}</label>
					</FormSection>
					<FormSection title={text.additionalInformation} framed><label class="notes-field"><span>{text.notes}</span><textarea name="notes" bind:value={notes} maxlength="5000"></textarea></label></FormSection>
				</div>
			<footer class="app-modal-footer"><button class="secondary" type="button" disabled={saving} onclick={requestCloseForm}>{text.cancel}</button><button class="app-primary-action" type="submit" disabled={saving || (Boolean(editing) && !hasUnsavedChanges)}>{saving ? text.saving : editing ? text.saveChanges : addLabel}</button></footer>
		</form>
	</dialog></ModalBackdrop>
	{#if confirmingDiscard}<DiscardChangesDialog onContinue={() => confirmingDiscard = false} onDiscard={closeFormImmediately} />{/if}
{/if}

<style>
	.master-section{display:flex;min-width:0;height:100%;flex-direction:column}.panel{width:100%;min-width:0;flex:1}.panel :global(.master-list){height:100%}.panel :global(.master-header){flex-wrap:wrap}.panel :global(thead){display:none}.panel :global(th),.panel :global(td){padding-right:6px;padding-left:6px;overflow-wrap:anywhere}.panel :global(td:first-child){padding-left:10px}.panel :global(th:first-child){padding-left:35px}.panel :global(.sort-button){white-space:normal;overflow-wrap:anywhere}.panel :global(.actions-cell){padding-right:6px;padding-left:2px}.master-dialog{width:min(calc(100% - 32px),620px)}.master-form-body{grid-template-columns:repeat(2,minmax(0,1fr))}.notes-field{grid-column:1/-1}@media(max-width:700px){.master-form-body{grid-template-columns:1fr}}
	.panel :global(.tree-child td:first-child){padding-left:38px}
</style>
