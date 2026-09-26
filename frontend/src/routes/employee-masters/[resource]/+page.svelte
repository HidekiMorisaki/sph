<script lang="ts">
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

	type Item = EmployeeMaster;
	const labels: Record<string, string> = { departments: 'Departments', 'employee-groups': 'Groups', positions: 'Positions', 'employment-types': 'Types', branches: 'Branches' };
	const singularLabels: Record<string, string> = { departments: 'department', 'employee-groups': 'group', positions: 'position', 'employment-types': 'employment type', branches: 'branch' };
	let resource = $derived(page.params.resource ?? '');
	let columns = $derived(resource === 'employee-groups'
		? [{ key: 'department', label: 'Department', value: (item: Item) => item.department?.name }, { key: 'name', label: 'Name', value: (item: Item) => item.name }]
		: [{ key: 'name', label: 'Name', value: (item: Item) => item.name }]);
	let title = $derived(labels[resource] ?? 'Employee masters');
	let itemLabel = $derived(singularLabels[resource] ?? 'item');
	let addLabel = $derived(`Add ${itemLabel}`);
	let endpoint = $derived('/v1/' + resource);
	let canManage = $state(false);
	let list = $state<MasterList>();
	let name = $state('');
	let departmentId = $state('');
	let departments = $state<EmployeeMaster[]>([]);
	let editing = $state<Item | null>(null);
	let modalTitle = $derived(`${editing ? 'Edit' : 'Add'} ${itemLabel}`);
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
	let hasUnsavedChanges = $derived(Boolean(editing) && initialSnapshot !== '' && formSnapshot({ name, departmentId }) !== initialSnapshot);
	function focusFirstField() {
		if (isGroup) dialogElement?.querySelector<HTMLButtonElement>('[data-field="departmentId"] .form-select-trigger')?.focus();
		else nameInput?.focus();
	}
	function resetForm() { editing = null; name = ''; departmentId = ''; errors = {}; formError = ''; formOpen = false; initialSnapshot = ''; confirmingDiscard = false; }
	function edit(item: Item, trigger: HTMLButtonElement | null) {
		returnFocus = trigger;
		editing = item; name = item.name; departmentId = item.departmentId == null ? '' : String(item.departmentId); errors = {}; formError = ''; formOpen = true; initialSnapshot = formSnapshot({ name, departmentId }); confirmingDiscard = false;
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
		errors = { ...(!name.trim() ? { name: 'Name is required.' } : {}), ...(isGroup && !departmentId ? { departmentId: 'Department is required.' } : {}) };
		if (Object.keys(errors).length) { formError = 'Correct the highlighted fields.'; await tick(); if (errors.departmentId) focusFirstField(); else nameInput?.focus(); return; }
		saving = true; formError = '';
		try {
			const response = await fetch(endpoint + (editing ? '/' + editing.id : ''), { method: editing ? 'PATCH' : 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(isGroup ? { name, departmentId } : { name }) });
			if (!response.ok) {
				const payload = await response.json().catch(() => null) as { error?: { code?: string; details?: { field?: string }[] } } | null;
				const field = payload?.error?.details?.[0]?.field;
				if (field === 'name') { errors = { name: 'Name already exists.' }; formError = 'Correct the highlighted field.'; await tick(); nameInput?.focus(); }
				else if (field === 'departmentId') { errors = { departmentId: 'Select an active department.' }; formError = 'Correct the highlighted field.'; await tick(); focusFirstField(); }
				else if (payload?.error?.code === 'RESOURCE_IN_USE') formError = 'This group is used by employees in another department.';
				else formError = response.status === 403 ? 'You do not have permission to save this item.' : 'Unable to save this item. Check the name.';
				return;
			}
			const focusTarget = returnFocus; resetForm(); await list?.refresh(); void tick().then(() => focusTarget?.focus());
		} catch { formError = 'Unable to save this item. Try again.'; }
		finally { saving = false; }
	}
	async function remove(item: Item) {
		if (!confirm(`Delete ${item.name}?`)) return;
		const response = await fetch(`${endpoint}/${item.id}`, { method: 'DELETE' });
		if (!response.ok) { message = response.status === 403 ? 'You do not have permission to delete this item.' : 'This item is in use or could not be deleted.'; return; }
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
			if (sessionResponse.ok) { const session = await apiData<{ user: { role: string } }>(sessionResponse); canManage = ['system_administrator', 'business_administrator'].includes(session.user.role); }
			departments = departmentResponse?.ok ? await apiData<EmployeeMaster[]>(departmentResponse) : [];
		})();
	});
</script>

{#snippet headerActions()}
	{#if canManage}<AddButton bind:element={addButton} label={addLabel} onclick={add} />{/if}
{/snippet}

<svelte:window onkeydown={handleWindowKeydown} />
<AssetManagementShell {title} active="">
	<MasterPageHeader {title} description="Maintain the controlled values used by employee records." actions={headerActions} />
	{#if message}<p class="notice" role="alert">{message}</p>{/if}
	<section class="panel"><MasterList bind:this={list} {endpoint} {columns} {title} {canManage} initialSortBy="name" onEdit={(item, trigger) => edit(item as Item, trigger)} onDelete={(item) => remove(item as Item)} /></section>
</AssetManagementShell>

{#if canManage && formOpen}
	<ModalBackdrop onDismiss={requestCloseForm} disabled={saving}><dialog bind:this={dialogElement} class="master-dialog app-modal app-modal--compact" open aria-modal="true" aria-labelledby="employee-master-dialog-title">
		<ModalHeader title={modalTitle} titleId="employee-master-dialog-title" closeLabel={`Close ${itemLabel} form`} disabled={saving} onClose={requestCloseForm} />
		<form class="app-modal-form" novalidate onsubmit={(event) => { event.preventDefault(); void save(); }}>
			<div class="master-form-body app-modal-form-body">
				{#if formError}<div class="app-modal-error-summary" role="alert"><strong>Unable to save item</strong><span>{formError}</span></div>{/if}
				<FormSection title="Basic information" columns={2} framed>
				{#if isGroup}<SearchSelect label="Department" field="departmentId" value={departmentId} options={[{ value: '', label: '-' }, ...departments.map((item) => ({ value: String(item.id), label: item.name }))]} required error={errors.departmentId ?? ''} onSelect={(value) => { departmentId = value; errors.departmentId = undefined; formError = ''; }} />{/if}
				<label><span>Name <span class="required" aria-hidden="true">*</span></span><input bind:this={nameInput} bind:value={name} maxlength="128" placeholder="e.g. Example name" class:invalid={!!errors.name} aria-invalid={!!errors.name} aria-describedby={errors.name ? 'name-error' : undefined} oninput={() => { errors.name = undefined; formError = ''; }} />{#if errors.name}<small id="name-error" class="field-error">{errors.name}</small>{/if}</label>
				</FormSection>
			</div>
			<footer class="app-modal-footer"><button class="secondary" type="button" disabled={saving} onclick={requestCloseForm}>Cancel</button><button class="app-primary-action" type="submit" disabled={saving}>{saving ? 'Saving...' : editing ? 'Save changes' : addLabel}</button></footer>
		</form>
	</dialog></ModalBackdrop>
	{#if confirmingDiscard}<DiscardChangesDialog onContinue={() => confirmingDiscard = false} onDiscard={closeFormImmediately} />{/if}
{/if}

<style>
	.panel{width:100%;min-width:0}.notice{margin:0 0 14px;color:var(--danger);font-size:13px}.master-dialog{width:min(calc(100% - 32px),620px)}.master-form-body{grid-template-columns:repeat(2,minmax(0,1fr))}@media(max-width:700px){.master-form-body{grid-template-columns:1fr}}
</style>
