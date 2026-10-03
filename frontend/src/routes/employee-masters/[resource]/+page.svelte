<script lang="ts">
	import { localeMessages, formatLocaleTemplate } from '$lib/locale-messages';
	import { localization } from '$lib/localization';
	import { afterNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import { tick } from 'svelte';
	import { apiData } from '$lib/api';
	import AddButton from '$lib/components/AddButton.svelte';
	import AssetManagementShell from '$lib/components/AssetManagementShell.svelte';
	import DiscardChangesDialog from '$lib/components/DiscardChangesDialog.svelte';
	import FormSection from '$lib/components/FormSection.svelte';
	import MasterList from '$lib/components/MasterList.svelte';
	import MasterPageHeader from '$lib/components/MasterPageHeader.svelte';
	import ModalBackdrop from '$lib/components/ModalBackdrop.svelte';
	import ModalHeader from '$lib/components/ModalHeader.svelte';
	import SearchSelect from '$lib/components/SearchSelect.svelte';
	import type { EmployeeMaster } from '$lib/employees';
	import { formSnapshot } from '$lib/modalForm';
	import '$lib/styles/add-button.css';

	let text = $derived(localeMessages[$localization.displayLanguage].masters);
	function m(key: string | undefined): string { return key ? text[key as keyof typeof text] ?? text.invalidValue : ''; }
	function t(key: keyof typeof text, ...values: (string | number)[]) { return formatLocaleTemplate(text[key], ...values); }

	type Item = EmployeeMaster;
	let labels: Record<string, string> = $derived({ departments: text.departments, 'employee-groups': text.employeeGroups, positions: text.positions, 'employment-types': text.employmentTypes, branches: text.branches });
	let singularLabels: Record<string, string> = $derived({ departments: text.departmentItem, 'employee-groups': text.groupItem, positions: text.positionItem, 'employment-types': text.employmentTypeItem, branches: text.branchItem });
	let resource = $derived(page.params.resource ?? '');
	let hasSortOrder = $derived(resource !== 'branches');
	let columns = $derived(resource === 'employee-groups'
		? [{ key: 'name', label: text.name, value: (item: Item) => item.name }, { key: 'department', label: text.department, value: (item: Item) => item.department?.name }, { key: 'sortOrder', label: text.sortOrder, value: (item: Item) => item.sortOrder }]
		: hasSortOrder
			? [{ key: 'name', label: text.name, value: (item: Item) => item.name }, { key: 'sortOrder', label: text.sortOrder, value: (item: Item) => item.sortOrder }]
			: [{ key: 'name', label: text.name, value: (item: Item) => item.name }]);
	let title = $derived(labels[resource] ?? text.employeeMasters);
	let itemLabel = $derived(singularLabels[resource] ?? text.item);
	let addLabel = $derived(t('addItem', itemLabel));
	let endpoint = $derived('/v1/' + resource);
	let canManage = $state(false);
	let list = $state<MasterList>();
	let name = $state('');
	let sortOrder = $state('9999');
	let departmentId = $state('');
	let departments = $state<EmployeeMaster[]>([]);
	let editing = $state<Item | null>(null);
	let modalTitle = $derived(t(editing ? 'editItem' : 'addItem', itemLabel));
	let formOpen = $state(false);
	let saving = $state(false);
	let message = $state('');
	let formError = $state('');
	let errors = $state<{ name?: string; departmentId?: string; sortOrder?: string }>({});
	let nameInput = $state<HTMLInputElement>();
	let sortOrderInput = $state<HTMLInputElement>();
	let dialogElement = $state<HTMLDialogElement>();
	let addButton = $state<HTMLButtonElement>();
	let returnFocus: HTMLElement | null = null;
	let initialSnapshot = $state('');
	let confirmingDiscard = $state(false);

	let isGroup = $derived(resource === 'employee-groups');
	let hasUnsavedChanges = $derived(Boolean(editing) && initialSnapshot !== '' && formSnapshot({ name, departmentId, sortOrder }) !== initialSnapshot);
	function focusFirstField() {
		if (isGroup) dialogElement?.querySelector<HTMLButtonElement>('[data-field="departmentId"] .form-select-trigger')?.focus();
		else nameInput?.focus();
	}
	function resetForm() { editing = null; name = ''; departmentId = ''; sortOrder = '9999'; errors = {}; formError = ''; formOpen = false; initialSnapshot = ''; confirmingDiscard = false; }
	function edit(item: Item, trigger: HTMLButtonElement | null) {
		returnFocus = trigger;
		editing = item; name = item.name; departmentId = item.departmentId == null ? '' : String(item.departmentId); sortOrder = String(item.sortOrder ?? 9999); errors = {}; formError = ''; formOpen = true; initialSnapshot = formSnapshot({ name, departmentId, sortOrder }); confirmingDiscard = false;
		void tick().then(focusFirstField);
	}
	function add() {
		returnFocus = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : addButton ?? null;
		resetForm(); formOpen = true; void tick().then(focusFirstField);
	}
	function closeFormImmediately() {
		if (saving) return;
		const focusTarget = returnFocus; resetForm(); void tick().then(() => focusTarget?.focus());
	}
	function requestCloseForm() { if (saving) return; if (hasUnsavedChanges) { confirmingDiscard = true; return; } closeFormImmediately(); }
	async function save() {
		if (saving) return;
		errors = { ...(!name.trim() ? { name: 'nameRequired' } : {}), ...(isGroup && !departmentId ? { departmentId: 'departmentRequired' } : {}), ...(hasSortOrder && (!/^\d+$/.test(sortOrder) || !Number.isSafeInteger(Number(sortOrder))) ? { sortOrder: 'sortInvalid' } : {}) };
		if (Object.keys(errors).length) { formError = 'correctFields'; await tick(); if (errors.departmentId) focusFirstField(); else if (errors.name) nameInput?.focus(); else sortOrderInput?.focus(); return; }
		saving = true; formError = '';
		try {
			const payload = isGroup ? { name, departmentId, sortOrder: Number(sortOrder) } : hasSortOrder ? { name, sortOrder: Number(sortOrder) } : { name };
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
		if (!confirm(t('deleteConfirm', item.name))) return;
		const response = await fetch(`${endpoint}/${item.id}`, { method: 'DELETE' });
		if (!response.ok) { message = response.status === 403 ? 'deleteForbidden' : 'deleteFailed'; return; }
		message = ''; await list?.refresh();
	}
	function handleWindowKeydown(event: KeyboardEvent) {
		if (event.defaultPrevented || confirmingDiscard || !formOpen || !dialogElement) return;
		if (event.key === 'Escape') { event.preventDefault(); requestCloseForm(); return; }
		if (event.key !== 'Tab') return;
		const focusable = [...dialogElement.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled])')];
		if (!focusable.length) return;
		const first = focusable[0], last = focusable[focusable.length - 1];
		if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
		else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
	}
	afterNavigate(() => {
		resetForm(); message = '';
		void (async () => {
			const [sessionResponse, departmentResponse] = await Promise.all([
				fetch('/v1/auth/session'),
				isGroup ? fetch('/v1/departments?sortBy=name&sortOrder=asc&limit=500') : Promise.resolve(null)
			]);
			if (sessionResponse.ok) { const session = await apiData<{ user: { capabilities: { canManageAdministration: boolean } } }>(sessionResponse); canManage = session.user.capabilities.canManageAdministration; }
			departments = departmentResponse?.ok ? await apiData<EmployeeMaster[]>(departmentResponse) : [];
		})();
	});
</script>

{#snippet headerActions()}
	{#if canManage}<AddButton bind:element={addButton} label={addLabel} onclick={add} />{/if}
{/snippet}

<svelte:window onkeydown={handleWindowKeydown} />
<AssetManagementShell {title} active="">
	<MasterPageHeader {title} description={text.employeeDescription} actions={headerActions} />
	{#if message}<p class="notice" role="alert">{m(message)}</p>{/if}
	<section class="panel"><MasterList bind:this={list} {endpoint} {columns} {title} {canManage} initialSortBy="sortOrder" sortStorageKey={`master-sort:${endpoint}`} onEdit={(item, trigger) => edit(item as Item, trigger)} onDelete={(item) => remove(item as Item)} /></section>
</AssetManagementShell>

{#if canManage && formOpen}
	<ModalBackdrop onDismiss={requestCloseForm} disabled={saving}><dialog bind:this={dialogElement} class="master-dialog app-modal app-modal--compact" open aria-modal="true" aria-labelledby="employee-master-dialog-title">
		<ModalHeader title={modalTitle} titleId="employee-master-dialog-title" closeLabel={t('closeForm', itemLabel)} disabled={saving} onClose={requestCloseForm} />
		<form class="app-modal-form" novalidate onsubmit={(event) => { event.preventDefault(); void save(); }}>
			<div class="master-form-body app-modal-form-body">
				{#if formError}<div class="app-modal-error-summary" role="alert"><strong>{text.saveTitle}</strong><span>{m(formError)}</span></div>{/if}
				<FormSection title={text.basicInformation} columns={2} framed>
				{#if isGroup}<SearchSelect label={text.department} field="departmentId" value={departmentId} options={[{ value: '', label: '-' }, ...departments.map((item) => ({ value: String(item.id), label: item.name }))]} required error={m(errors.departmentId ?? '')} onSelect={(value) => { departmentId = value; errors.departmentId = undefined; formError = ''; }} />{/if}
				<label><span>{text.name} <span class="required" aria-hidden="true">*</span></span><input bind:this={nameInput} bind:value={name} maxlength="128" placeholder={text.nameExample} class:invalid={!!errors.name} aria-invalid={!!errors.name} aria-describedby={errors.name ? 'name-error' : undefined} oninput={() => { errors.name = undefined; formError = ''; }} />{#if errors.name}<small id="name-error" class="field-error">{m(errors.name)}</small>{/if}</label>
				{#if hasSortOrder}<label><span>{text.sortOrder} <span class="required" aria-hidden="true">*</span></span><input bind:this={sortOrderInput} name="sortOrder" bind:value={sortOrder} type="number" min="0" step="1" required class:invalid={!!errors.sortOrder} aria-invalid={!!errors.sortOrder} aria-describedby={errors.sortOrder ? 'sort-order-error' : undefined} oninput={() => { errors.sortOrder = undefined; formError = ''; }} />{#if errors.sortOrder}<small id="sort-order-error" class="field-error">{m(errors.sortOrder)}</small>{/if}</label>{/if}
				</FormSection>
			</div>
			<footer class="app-modal-footer"><button class="secondary" type="button" disabled={saving} onclick={requestCloseForm}>{text.cancel}</button><button class="app-primary-action" type="submit" disabled={saving}>{saving ? text.saving : editing ? text.saveChanges : addLabel}</button></footer>
		</form>
	</dialog></ModalBackdrop>
	{#if confirmingDiscard}<DiscardChangesDialog onContinue={() => confirmingDiscard = false} onDiscard={closeFormImmediately} />{/if}
{/if}

<style>
	.panel{width:100%;min-width:0}.notice{margin:0 0 14px;color:var(--danger);font-size:13px}.master-dialog{width:min(calc(100% - 32px),620px)}.master-form-body{grid-template-columns:repeat(2,minmax(0,1fr))}@media(max-width:700px){.master-form-body{grid-template-columns:1fr}}
</style>
