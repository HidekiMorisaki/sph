<script lang="ts">
	import { afterNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import { tick } from 'svelte';
	import { apiData } from '$lib/api';
	import AddButton from '$lib/components/AddButton.svelte';
	import AssetManagementShell from '$lib/components/AssetManagementShell.svelte';
	import FormSection from '$lib/components/FormSection.svelte';
	import MasterList from '$lib/components/MasterList.svelte';
	import MasterPageHeader from '$lib/components/MasterPageHeader.svelte';
	import '$lib/styles/add-button.css';

	type Item = { id: number; code?: string; name: string };
	const labels: Record<string, string> = { departments: 'Departments', 'employee-groups': 'Groups', positions: 'Positions', 'employment-types': 'Types', branches: 'Branches' };
	const singularLabels: Record<string, string> = { departments: 'department', 'employee-groups': 'group', positions: 'position', 'employment-types': 'type', branches: 'branch' };
	const employmentResources = new Set(['departments', 'employee-groups', 'positions', 'employment-types']);
	let resource = $derived(page.params.resource ?? '');
	let usesCode = $derived(resource === 'employee-groups');
	let columns = $derived(usesCode ? [{ key: 'code', label: 'Code', value: (item: Item) => item.code ?? '' }, { key: 'name', label: 'Name', value: (item: Item) => item.name }] : [{ key: 'name', label: 'Name', value: (item: Item) => item.name }]);
	let title = $derived(labels[resource] ?? 'Employee masters');
	let addLabel = $derived(`Add ${singularLabels[resource] ?? 'item'}`);
	let eyebrow = $derived(employmentResources.has(resource) ? 'EMPLOYMENT CONFIGURATION' : 'CONFIGURATION');
	let endpoint = $derived('/v1/' + resource);
	let canManage = $state(false);
	let list = $state<MasterList>();
	let code = $state('');
	let name = $state('');
	let editing = $state<Item | null>(null);
	let formOpen = $state(false);
	let saving = $state(false);
	let message = $state('');
	let formError = $state('');
	let errors = $state<{ code?: string; name?: string }>({});
	let codeInput = $state<HTMLInputElement>();
	let nameInput = $state<HTMLInputElement>();
	let dialogElement = $state<HTMLDialogElement>();
	let addButton = $state<HTMLButtonElement>();
	let returnFocus: HTMLElement | null = null;

	function resetForm() { editing = null; code = ''; name = ''; errors = {}; formError = ''; formOpen = false; }
	function edit(item: Item, trigger: HTMLButtonElement | null) {
		returnFocus = trigger;
		editing = item; code = item.code ?? ''; name = item.name; errors = {}; formError = ''; formOpen = true;
		void tick().then(() => (usesCode ? codeInput : nameInput)?.focus());
	}
	function add() {
		returnFocus = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : addButton ?? null;
		resetForm(); formOpen = true; void tick().then(() => (usesCode ? codeInput : nameInput)?.focus());
	}
	function closeForm() {
		if (saving) return;
		const focusTarget = returnFocus; resetForm(); void tick().then(() => focusTarget?.focus());
	}
	async function save() {
		if (saving) return;
		errors = { ...(usesCode && !code.trim() ? { code: 'Code is required.' } : {}), ...(!name.trim() ? { name: 'Name is required.' } : {}) };
		if (Object.keys(errors).length) { formError = 'Correct the highlighted fields.'; await tick(); (errors.code ? codeInput : nameInput)?.focus(); return; }
		saving = true; formError = '';
		try {
			const response = await fetch(endpoint + (editing ? '/' + editing.id : ''), { method: editing ? 'PATCH' : 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(usesCode ? { code, name } : { name }) });
			if (!response.ok) {
				const payload = await response.json().catch(() => null) as { error?: { details?: { field?: string }[] } } | null;
				const field = payload?.error?.details?.[0]?.field;
				if (field === 'code' || field === 'name') { errors = { [field]: `${field === 'code' ? 'Code' : 'Name'} already exists.` }; formError = 'Correct the highlighted field.'; await tick(); (field === 'code' ? codeInput : nameInput)?.focus(); }
				else formError = response.status === 403 ? 'You do not have permission to save this item.' : `Unable to save this item. Check the ${usesCode ? 'code and name' : 'name'}.`;
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
		if (event.defaultPrevented || !formOpen || !dialogElement) return;
		if (event.key === 'Escape') { event.preventDefault(); closeForm(); return; }
		if (event.key !== 'Tab') return;
		const focusable = [...dialogElement.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled])')];
		if (!focusable.length) return;
		const first = focusable[0], last = focusable[focusable.length - 1];
		if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
		else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
	}
	afterNavigate(() => {
		resetForm(); message = '';
		void (async () => { const response = await fetch('/v1/auth/session'); if (response.ok) { const session = await apiData<{ user: { role: string } }>(response); canManage = ['system_administrator', 'business_administrator'].includes(session.user.role); } })();
	});
</script>

{#snippet headerActions()}
	{#if canManage}<AddButton bind:element={addButton} label={addLabel} onclick={add} />{/if}
{/snippet}

<svelte:window onkeydown={handleWindowKeydown} />
<AssetManagementShell {title} active="">
	<MasterPageHeader {eyebrow} {title} description="Maintain the controlled values used by employee records." actions={headerActions} />
	{#if message}<p class="notice" role="alert">{message}</p>{/if}
	<section class="panel"><MasterList bind:this={list} {endpoint} {columns} {title} {canManage} initialSortBy={usesCode ? 'code' : 'name'} onEdit={(item, trigger) => edit(item as Item, trigger)} onDelete={(item) => remove(item as Item)} /></section>
</AssetManagementShell>

{#if canManage && formOpen}
	<div class="app-modal-backdrop" role="presentation"><dialog bind:this={dialogElement} class="master-dialog app-modal app-modal--compact" open aria-modal="true" aria-labelledby="employee-master-dialog-title">
		<header><h2 id="employee-master-dialog-title">{editing ? 'Edit item' : 'Add item'}</h2><button class="app-modal-close" type="button" aria-label="Close item form" disabled={saving} onclick={closeForm}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg></button></header>
		<form class="app-modal-form" novalidate onsubmit={(event) => { event.preventDefault(); void save(); }}>
			<div class="master-form-body app-modal-form-body">
				{#if formError}<div class="app-modal-error-summary" role="alert"><strong>Unable to save item</strong><span>{formError}</span></div>{/if}
				<FormSection title="Basic information" columns={2} framed>
				{#if usesCode}<label><span>Code <span class="required" aria-hidden="true">*</span></span><input bind:this={codeInput} bind:value={code} maxlength="64" placeholder="e.g. CODE001" class:invalid={!!errors.code} aria-invalid={!!errors.code} aria-describedby={errors.code ? 'code-error' : undefined} oninput={() => { errors.code = undefined; formError = ''; }} />{#if errors.code}<small id="code-error" class="field-error">{errors.code}</small>{/if}</label>{/if}
				<label><span>Name <span class="required" aria-hidden="true">*</span></span><input bind:this={nameInput} bind:value={name} maxlength="128" placeholder="e.g. Example name" class:invalid={!!errors.name} aria-invalid={!!errors.name} aria-describedby={errors.name ? 'name-error' : undefined} oninput={() => { errors.name = undefined; formError = ''; }} />{#if errors.name}<small id="name-error" class="field-error">{errors.name}</small>{/if}</label>
				</FormSection>
			</div>
			<footer class="app-modal-footer"><button class="secondary" type="button" disabled={saving} onclick={closeForm}>Cancel</button><button class="app-primary-action" type="submit" disabled={saving}>{saving ? 'Saving...' : editing ? 'Save changes' : 'Add item'}</button></footer>
		</form>
	</dialog></div>
{/if}

<style>
	.panel{width:100%;min-width:0}.notice{margin:0 0 14px;color:var(--danger);font-size:13px}.master-dialog{width:min(calc(100% - 32px),620px)}.master-form-body{grid-template-columns:repeat(2,minmax(0,1fr))}@media(max-width:700px){.master-form-body{grid-template-columns:1fr}}
</style>
