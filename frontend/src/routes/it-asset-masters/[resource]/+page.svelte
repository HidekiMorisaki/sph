<script lang="ts">
	import { afterNavigate } from '$app/navigation';
	import { tick } from 'svelte';
	import { apiData } from '$lib/api';
	import AddButton from '$lib/components/AddButton.svelte';
	import AssetManagementShell from '$lib/components/AssetManagementShell.svelte';
	import CpuTypesPage from '$lib/components/CpuTypesPage.svelte';
	import DatePicker from '$lib/components/DatePicker.svelte';
	import MasterList from '$lib/components/MasterList.svelte';
	import MasterPageHeader from '$lib/components/MasterPageHeader.svelte';
	import SearchSelect from '$lib/components/SearchSelect.svelte';
	import '$lib/styles/add-button.css';

	type Resource = 'it-asset-types' | 'manufacturers' | 'cpu-types' | 'operating-systems' | 'it-asset-statuses';
	type Item = { id: number; code: string; name?: string; managementCodePrefix?: string; displayName?: string; sortOrder: number; manufacturerId?: number; series?: string; modelNumber?: string; vendor?: string; product?: string; version?: string; edition?: string | null; architecture?: string | null; officialUrl?: string | null; sourceCheckedOn?: string | null; supportsCpu?: boolean; supportsRam?: boolean; supportsOs?: boolean; supportsLoginUsername?: boolean; disposalDatePolicy?: string };
	const labels: Record<Resource, string> = { 'it-asset-types': 'Asset types', manufacturers: 'Manufacturers', 'cpu-types': 'CPU types', 'operating-systems': 'Operating systems', 'it-asset-statuses': 'Asset statuses' };
	const singularLabels: Record<Resource, string> = { 'it-asset-types': 'asset types', manufacturers: 'manufacturer', 'cpu-types': 'CPU type', 'operating-systems': 'operating system', 'it-asset-statuses': 'asset status' };
	const allowed = new Set(Object.keys(labels));
	const normalizeResource = (value: string): Resource => allowed.has(value) ? value as Resource : 'it-asset-types';
	const blank = () => ({ code: '', name: '', managementCodePrefix: '', displayName: '', sortOrder: '0', manufacturerId: '', series: '', modelNumber: '', vendor: '', product: '', version: '', edition: '', architecture: '', officialUrl: '', sourceCheckedOn: '', supportsCpu: false, supportsRam: false, supportsOs: false, supportsLoginUsername: false, disposalDatePolicy: 'prohibited' });

	let { data }: { data: { resource: string } } = $props();
	const resource = $derived(normalizeResource(data.resource));
	const title = $derived(labels[resource]);
	const addLabel = $derived(`Add ${singularLabels[resource]}`);
	let role = $state('');
	let manufacturers = $state<Item[]>([]);
	let editing = $state<Item | null>(null);
	let message = $state('');
	let form = $state(blank());
	let list = $state<MasterList>();
	let formOpen = $state(false);
	let saving = $state(false);
	let errors = $state<Record<string, string>>({});
	let formError = $state('');
	let formElement = $state<HTMLFormElement>();
	let dialogElement = $state<HTMLDialogElement>();
	let addButton = $state<HTMLButtonElement>();
	let returnFocus: HTMLElement | null = null;
	let sourceDateOpen = $state(false);
	let canManage = $derived(role === 'system_administrator' || role === 'business_administrator');
	let minTableWidth = $derived(resource === 'operating-systems' ? 920 : resource === 'it-asset-types' || resource === 'manufacturers' ? 780 : 720);
	let columns = $derived(resource === 'it-asset-types'
		? [{ key: 'code', label: 'Code', value: (item: Item) => item.code }, { key: 'name', label: 'Name', value: (item: Item) => item.name }, { key: 'managementCodePrefix', label: 'Prefix', value: (item: Item) => item.managementCodePrefix }, { key: 'sortOrder', label: 'Order', value: (item: Item) => item.sortOrder }]
		: resource === 'manufacturers'
			? [{ key: 'code', label: 'Code', value: (item: Item) => item.code }, { key: 'name', label: 'Name', value: (item: Item) => item.name }, { key: 'officialUrl', label: 'Official URL', value: (item: Item) => item.officialUrl ?? '' }, { key: 'sortOrder', label: 'Order', value: (item: Item) => item.sortOrder }]
			: resource === 'operating-systems'
				? [{ key: 'code', label: 'Code', value: (item: Item) => item.code }, { key: 'displayName', label: 'Name', value: (item: Item) => item.displayName }, { key: 'vendor', label: 'Vendor', value: (item: Item) => item.vendor }, { key: 'product', label: 'Product', value: (item: Item) => item.product }, { key: 'version', label: 'Version', value: (item: Item) => item.version }, { key: 'sortOrder', label: 'Order', value: (item: Item) => item.sortOrder }]
				: [{ key: 'code', label: 'Code', value: (item: Item) => item.code }, { key: 'name', label: 'Name', value: (item: Item) => item.name }, { key: 'disposalDatePolicy', label: 'Disposal date', value: (item: Item) => item.disposalDatePolicy }, { key: 'sortOrder', label: 'Order', value: (item: Item) => item.sortOrder }]);

	function resetForm() { editing = null; formOpen = false; sourceDateOpen = false; errors = {}; formError = ''; form = blank(); form.manufacturerId = manufacturers[0] ? String(manufacturers[0].id) : ''; }
	async function load() {
		const session = await fetch('/v1/auth/session');
		if (!session.ok) { message = 'Please sign in to continue.'; return; }
		role = (await apiData<{ user: { role: string } }>(session)).user.role;
		const response = await fetch('/v1/manufacturers?limit=500');
		manufacturers = response.ok ? await apiData<Item[]>(response) : [];
		if (!editing) resetForm();
	}
	function edit(item: Item, trigger: HTMLButtonElement | null) {
		returnFocus = trigger; editing = item; formOpen = true; errors = {}; formError = '';
		form = { code: item.code, name: item.name ?? '', managementCodePrefix: item.managementCodePrefix ?? '', displayName: item.displayName ?? '', sortOrder: String(item.sortOrder), manufacturerId: item.manufacturerId ? String(item.manufacturerId) : '', series: item.series ?? '', modelNumber: item.modelNumber ?? '', vendor: item.vendor ?? '', product: item.product ?? '', version: item.version ?? '', edition: item.edition ?? '', architecture: item.architecture ?? '', officialUrl: item.officialUrl ?? '', sourceCheckedOn: item.sourceCheckedOn?.slice(0, 10) ?? '', supportsCpu: item.supportsCpu ?? false, supportsRam: item.supportsRam ?? false, supportsOs: item.supportsOs ?? false, supportsLoginUsername: item.supportsLoginUsername ?? false, disposalDatePolicy: item.disposalDatePolicy ?? 'prohibited' };
		void tick().then(() => formElement?.querySelector<HTMLInputElement>('[name="code"]')?.focus());
	}
	function add() { returnFocus = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : addButton ?? null; resetForm(); formOpen = true; void tick().then(() => formElement?.querySelector<HTMLInputElement>('[name="code"]')?.focus()); }
	function closeForm() { if (saving) return; const focusTarget = returnFocus; resetForm(); void tick().then(() => focusTarget?.focus()); }
	function clearError(field: string) { errors[field] = ''; formError = ''; }
	async function save() {
		if (saving) return;
		const required = ['code', ...(resource === 'operating-systems' ? ['vendor', 'product', 'version', 'displayName'] : ['name']), ...(resource === 'it-asset-types' ? ['managementCodePrefix'] : [])];
		errors = {};
		for (const key of required) if (!String(form[key as keyof typeof form] ?? '').trim()) errors[key] = `${key.replace(/([A-Z])/g, ' $1')} is required.`;
		if (resource === 'it-asset-types' && form.managementCodePrefix && !/^[A-Z]{3,5}$/.test(form.managementCodePrefix)) errors.managementCodePrefix = 'Use 3 to 5 uppercase letters.';
		if (!/^\d+$/.test(form.sortOrder)) errors.sortOrder = 'Enter a non-negative whole number.';
		if (form.officialUrl && !/^https?:\/\//i.test(form.officialUrl)) errors.officialUrl = 'Enter a valid URL.';
		if (Object.keys(errors).length) { formError = 'Correct the highlighted fields.'; await tick(); formElement?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(); return; }
		saving = true; formError = '';
		try {
			const response = await fetch(`/v1/${resource}${editing ? '/' + editing.id : ''}`, { method: editing ? 'PATCH' : 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(form) });
			if (!response.ok) {
				const payload = await response.json().catch(() => null) as { error?: { details?: { field?: string }[] } } | null;
				const field = payload?.error?.details?.[0]?.field;
				if (field && ['code', 'name', 'displayName', 'managementCodePrefix'].includes(field)) { errors[field] = 'This value already exists.'; formError = 'Correct the highlighted field.'; await tick(); formElement?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(); }
				else formError = response.status === 403 ? 'You do not have permission to save this item.' : 'Unable to save this item. Check required fields and duplicate values.';
				return;
			}
			const focusTarget = returnFocus; resetForm(); await list?.refresh(); void tick().then(() => focusTarget?.focus());
		} catch { formError = 'Unable to save this item. Try again.'; }
		finally { saving = false; }
	}
	async function remove(item: Item) {
		if (!confirm(`Delete ${item.name ?? item.displayName ?? item.code}?`)) return;
		const response = await fetch(`/v1/${resource}/${item.id}`, { method: 'DELETE' });
		if (!response.ok) { message = response.status === 403 ? 'You do not have permission to delete this item.' : 'This item is in use or could not be deleted.'; return; }
		message = ''; await load(); resetForm(); await list?.refresh();
	}
	function handleWindowKeydown(event: KeyboardEvent) {
		if (event.defaultPrevented || !formOpen || !dialogElement) return;
		if (event.key === 'Escape') { event.preventDefault(); if (sourceDateOpen) { sourceDateOpen = false; void tick().then(() => dialogElement?.querySelector<HTMLButtonElement>('[data-field="master-source-checked"] .date-trigger')?.focus()); } else closeForm(); return; }
		if (event.key !== 'Tab') return;
		const focusable = [...dialogElement.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled])')];
		if (!focusable.length) return;
		const first = focusable[0], last = focusable[focusable.length - 1];
		if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
		else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
	}
	afterNavigate(() => { if (resource === 'cpu-types') return; resetForm(); message = ''; void load(); });
</script>

{#snippet headerActions()}{#if canManage}<AddButton bind:element={addButton} label={addLabel} onclick={add} />{/if}{/snippet}

<svelte:window onkeydown={handleWindowKeydown} onclick={(event) => { if (sourceDateOpen && event.target instanceof Element && !event.target.closest('[data-field="master-source-checked"]')) sourceDateOpen = false; }} />
{#if resource === 'cpu-types'}
	<CpuTypesPage />
{:else}
	<AssetManagementShell {title} active="">
		<MasterPageHeader eyebrow="IT ASSET CONFIGURATION" {title} description="Maintain the controlled values used by IT asset records." actions={headerActions} />
		{#if message}<p class="notice" role="alert">{message}</p>{/if}
		<section class="panel"><MasterList bind:this={list} endpoint={`/v1/${resource}`} {columns} {title} {canManage} {minTableWidth} onEdit={(item, trigger) => edit(item as Item, trigger)} onDelete={(item) => remove(item as Item)} /></section>
	</AssetManagementShell>

	{#if canManage && formOpen}
		<div class="app-modal-backdrop" role="presentation"><dialog bind:this={dialogElement} class="master-dialog app-modal app-modal--compact" open aria-modal="true" aria-labelledby="it-master-dialog-title">
			<header><h2 id="it-master-dialog-title">{editing ? 'Edit item' : 'Add item'}</h2><button class="app-modal-close" type="button" aria-label="Close item form" disabled={saving} onclick={closeForm}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg></button></header>
			<form bind:this={formElement} class="app-modal-form" novalidate onsubmit={(event) => { event.preventDefault(); void save(); }}>
				<div class="master-form-body app-modal-form-body">
					{#if formError}<div class="app-modal-error-summary" role="alert"><strong>Unable to save item</strong><span>{formError}</span></div>{/if}
					<h3>Basic information</h3>
					<label><span>Code <span class="required" aria-hidden="true">*</span></span><input name="code" bind:value={form.code} maxlength="64" placeholder="e.g. CODE001" class:invalid={!!errors.code} aria-invalid={!!errors.code} aria-describedby={errors.code ? 'master-code-error' : undefined} oninput={() => clearError('code')} />{#if errors.code}<small id="master-code-error" class="field-error">{errors.code}</small>{/if}</label>
					{#if resource === 'it-asset-types' || resource === 'manufacturers' || resource === 'it-asset-statuses'}<label><span>Name <span class="required" aria-hidden="true">*</span></span><input name="name" bind:value={form.name} maxlength="128" placeholder="e.g. Example name" class:invalid={!!errors.name} aria-invalid={!!errors.name} aria-describedby={errors.name ? 'master-name-error' : undefined} oninput={() => clearError('name')} />{#if errors.name}<small id="master-name-error" class="field-error">{errors.name}</small>{/if}</label>{/if}
					{#if resource === 'it-asset-types'}<label><span>Management code prefix <span class="required" aria-hidden="true">*</span></span><input name="managementCodePrefix" bind:value={form.managementCodePrefix} minlength="3" maxlength="5" placeholder="e.g. NPC" class:invalid={!!errors.managementCodePrefix} aria-invalid={!!errors.managementCodePrefix} aria-describedby={errors.managementCodePrefix ? 'master-prefix-error' : undefined} oninput={() => clearError('managementCodePrefix')} />{#if errors.managementCodePrefix}<small id="master-prefix-error" class="field-error">{errors.managementCodePrefix}</small>{/if}</label>{/if}
					{#if resource === 'operating-systems'}
						<label><span>Vendor <span class="required" aria-hidden="true">*</span></span><input name="vendor" bind:value={form.vendor} placeholder="e.g. Microsoft" class:invalid={!!errors.vendor} aria-invalid={!!errors.vendor} aria-describedby={errors.vendor ? 'master-vendor-error' : undefined} oninput={() => clearError('vendor')} />{#if errors.vendor}<small id="master-vendor-error" class="field-error">{errors.vendor}</small>{/if}</label>
						<label><span>Product <span class="required" aria-hidden="true">*</span></span><input name="product" bind:value={form.product} placeholder="e.g. Windows" class:invalid={!!errors.product} aria-invalid={!!errors.product} aria-describedby={errors.product ? 'master-product-error' : undefined} oninput={() => clearError('product')} />{#if errors.product}<small id="master-product-error" class="field-error">{errors.product}</small>{/if}</label>
						<label><span>Version <span class="required" aria-hidden="true">*</span></span><input name="version" bind:value={form.version} placeholder="e.g. 11" class:invalid={!!errors.version} aria-invalid={!!errors.version} aria-describedby={errors.version ? 'master-version-error' : undefined} oninput={() => clearError('version')} />{#if errors.version}<small id="master-version-error" class="field-error">{errors.version}</small>{/if}</label>
						<label><span>Edition</span><input name="edition" bind:value={form.edition} placeholder="e.g. Pro" /></label><label><span>Architecture</span><input name="architecture" bind:value={form.architecture} placeholder="e.g. x64" /></label>
						<label><span>Display name <span class="required" aria-hidden="true">*</span></span><input name="displayName" bind:value={form.displayName} placeholder="e.g. Windows 11 Pro" class:invalid={!!errors.displayName} aria-invalid={!!errors.displayName} aria-describedby={errors.displayName ? 'master-display-error' : undefined} oninput={() => clearError('displayName')} />{#if errors.displayName}<small id="master-display-error" class="field-error">{errors.displayName}</small>{/if}</label>
					{/if}
					{#if resource === 'manufacturers' || resource === 'operating-systems'}<label><span>Official URL</span><input name="officialUrl" bind:value={form.officialUrl} type="url" maxlength="1000" placeholder="https://example.com" class:invalid={!!errors.officialUrl} aria-invalid={!!errors.officialUrl} aria-describedby={errors.officialUrl ? 'master-url-error' : undefined} oninput={() => clearError('officialUrl')} />{#if errors.officialUrl}<small id="master-url-error" class="field-error">{errors.officialUrl}</small>{/if}</label><DatePicker label="Source checked" field="master-source-checked" value={form.sourceCheckedOn} open={sourceDateOpen} onToggle={() => sourceDateOpen = !sourceDateOpen} onSelect={(value) => { form.sourceCheckedOn = value; sourceDateOpen = false; }} />{/if}
					{#if resource === 'it-asset-statuses'}<SearchSelect label="Disposal date" field="disposalDatePolicy" value={form.disposalDatePolicy} options={[{ value: 'prohibited', label: 'Prohibited' }, { value: 'optional', label: 'Optional' }, { value: 'required', label: 'Required' }]} onSelect={(value) => form.disposalDatePolicy = value} />{/if}
					<label><span>Sort order <span class="required" aria-hidden="true">*</span></span><input name="sortOrder" bind:value={form.sortOrder} type="number" min="0" step="1" placeholder="e.g. 0" class:invalid={!!errors.sortOrder} aria-invalid={!!errors.sortOrder} aria-describedby={errors.sortOrder ? 'master-order-error' : undefined} oninput={() => clearError('sortOrder')} />{#if errors.sortOrder}<small id="master-order-error" class="field-error">{errors.sortOrder}</small>{/if}</label>
					{#if resource === 'it-asset-types'}<fieldset class="supported-fields"><legend>Supported fields</legend><label><input bind:checked={form.supportsCpu} type="checkbox" />CPU</label><label><input bind:checked={form.supportsRam} type="checkbox" />RAM</label><label><input bind:checked={form.supportsOs} type="checkbox" />OS</label><label><input bind:checked={form.supportsLoginUsername} type="checkbox" />Login username</label></fieldset>{/if}
				</div>
				<footer class="app-modal-footer"><button class="secondary" type="button" disabled={saving} onclick={closeForm}>Cancel</button><button class="app-primary-action" type="submit" disabled={saving}>{saving ? 'Saving...' : editing ? 'Save changes' : 'Add item'}</button></footer>
			</form>
		</dialog></div>
	{/if}
{/if}

<style>
	.panel{width:100%;min-width:0}.notice{margin:0 0 14px;color:var(--danger);font-size:13px}.master-dialog{width:min(calc(100% - 32px),900px)}.supported-fields{display:flex;grid-column:1/-1;align-items:center;gap:16px;margin:0;padding:10px 12px;border:1px solid var(--border);border-radius:4px}.supported-fields legend{padding:0 4px;font-size:11px;font-weight:600}.supported-fields label{display:flex;align-items:center;gap:5px;font-weight:400}.supported-fields input{margin:0}@media(max-width:700px){.supported-fields{align-items:flex-start;flex-direction:column}}
</style>
