<script lang="ts">
	import { localeMessages, formatLocaleTemplate } from '$lib/locale-messages';
	import { localization } from '$lib/localization';
	import { afterNavigate } from '$app/navigation';
	import { tick } from 'svelte';
	import { apiData } from '$lib/api';
	import AddButton from '$lib/components/AddButton.svelte';
	import AssetManagementShell from '$lib/components/AssetManagementShell.svelte';
	import CpuTypesPage from '$lib/components/CpuTypesPage.svelte';
	import DatePicker from '$lib/components/DatePicker.svelte';
	import DiscardChangesDialog from '$lib/components/DiscardChangesDialog.svelte';
	import FormSection from '$lib/components/FormSection.svelte';
	import MasterList from '$lib/components/MasterList.svelte';
	import MasterPageHeader from '$lib/components/MasterPageHeader.svelte';
	import ModalBackdrop from '$lib/components/ModalBackdrop.svelte';
	import ModalHeader from '$lib/components/ModalHeader.svelte';
	import SearchSelect from '$lib/components/SearchSelect.svelte';
	import { formSnapshot } from '$lib/modalForm';
	import '$lib/styles/add-button.css';

	let text = $derived(localeMessages[$localization.displayLanguage].masters);
	function m(key: string | undefined): string { return key ? text[key as keyof typeof text] ?? text.invalidValue : ''; }
	function t(key: keyof typeof text, ...values: (string | number)[]) { return formatLocaleTemplate(text[key], ...values); }

	type Resource = 'it-asset-types' | 'manufacturers' | 'cpu-types' | 'operating-systems' | 'it-asset-statuses';
	type Item = { id: number; name?: string; managementCodePrefix?: string; displayName?: string; sortOrder: number; manufacturerId?: number; series?: string; modelNumber?: string; vendor?: string; product?: string; version?: string; edition?: string | null; architecture?: string | null; officialUrl?: string | null; sourceCheckedOn?: string | null; supportsCpu?: boolean; supportsRam?: boolean; supportsOs?: boolean; supportsLoginUsername?: boolean; disposalDatePolicy?: string };
	let labels: Record<Resource, string> = $derived({ 'it-asset-types': text.itAssetTypes, manufacturers: text.manufacturers, 'cpu-types': text.cpuTitle, 'operating-systems': text.operatingSystems, 'it-asset-statuses': text.statuses });
	let singularLabels: Record<Resource, string> = $derived({ 'it-asset-types': text.assetTypeItem, manufacturers: text.manufacturerItem, 'cpu-types': text.cpuItem, 'operating-systems': text.osItem, 'it-asset-statuses': text.statusItem });
	const allowed = new Set(['it-asset-types', 'manufacturers', 'cpu-types', 'operating-systems', 'it-asset-statuses']);
	const normalizeResource = (value: string): Resource => allowed.has(value) ? value as Resource : 'it-asset-types';
	const blank = () => ({ name: '', managementCodePrefix: '', displayName: '', sortOrder: '9999', manufacturerId: '', series: '', modelNumber: '', vendor: '', product: '', version: '', edition: '', architecture: '', officialUrl: '', sourceCheckedOn: '', supportsCpu: false, supportsRam: false, supportsOs: false, supportsLoginUsername: false, disposalDatePolicy: 'prohibited' });

	let { data }: { data: { resource: string } } = $props();
	const resource = $derived(normalizeResource(data.resource));
	const title = $derived(labels[resource]);
	const itemLabel = $derived(singularLabels[resource]);
	const addLabel = $derived(t('addItem', itemLabel));
	let canManage = $state(false);
	let manufacturers = $state<Item[]>([]);
	let editing = $state<Item | null>(null);
	let modalTitle = $derived(t(editing ? 'editItem' : 'addItem', itemLabel));
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
	let initialSnapshot = $state('');
	let confirmingDiscard = $state(false);
	let hasUnsavedChanges = $derived(Boolean(editing) && initialSnapshot !== '' && formSnapshot(form) !== initialSnapshot);
	let initialSortBy = $derived('sortOrder');
	let minTableWidth = $derived(resource === 'operating-systems' ? 920 : resource === 'it-asset-types' || resource === 'manufacturers' ? 780 : 720);
	let columns = $derived(resource === 'it-asset-types'
		? [{ key: 'name', label: text.name, value: (item: Item) => item.name }, { key: 'managementCodePrefix', label: text.prefix, value: (item: Item) => item.managementCodePrefix }, { key: 'sortOrder', label: text.sortOrder, value: (item: Item) => item.sortOrder }]
		: resource === 'manufacturers'
			? [{ key: 'name', label: text.name, value: (item: Item) => item.name }, { key: 'officialUrl', label: text.officialUrl, value: (item: Item) => item.officialUrl ?? '' }, { key: 'sortOrder', label: text.sortOrder, value: (item: Item) => item.sortOrder }]
			: resource === 'operating-systems'
				? [{ key: 'displayName', label: text.name, value: (item: Item) => item.displayName }, { key: 'vendor', label: text.vendor, value: (item: Item) => item.vendor }, { key: 'product', label: text.product, value: (item: Item) => item.product }, { key: 'version', label: text.version, value: (item: Item) => item.version }, { key: 'sortOrder', label: text.sortOrder, value: (item: Item) => item.sortOrder }]
				: [{ key: 'name', label: text.name, value: (item: Item) => item.name }, { key: 'disposalDatePolicy', label: text.disposalDate, value: (item: Item) => m(item.disposalDatePolicy) }, { key: 'sortOrder', label: text.sortOrder, value: (item: Item) => item.sortOrder }]);

	function generatedOperatingSystemDisplayName() {
		const name = [form.vendor, form.product, form.version, form.edition].map((value) => value.trim()).filter(Boolean).join(' ');
		const architecture = form.architecture.trim();
		return architecture ? `${name} (${architecture})`.trim() : name;
	}
	function updateOperatingSystemDisplayName() {
		if (resource === 'operating-systems') {
			form.displayName = generatedOperatingSystemDisplayName();
			clearError('displayName');
		}
	}
	function updateOperatingSystemField(field: 'vendor' | 'product' | 'version' | 'edition' | 'architecture', value: string) {
		form[field] = value;
		clearError(field);
		updateOperatingSystemDisplayName();
	}
	function resetForm() { editing = null; formOpen = false; sourceDateOpen = false; errors = {}; formError = ''; form = blank(); form.manufacturerId = manufacturers[0] ? String(manufacturers[0].id) : ''; initialSnapshot = ''; confirmingDiscard = false; }
	async function load() {
		const session = await fetch('/v1/auth/session');
		if (!session.ok) { message = 'signInRequired'; return; }
		canManage = (await apiData<{ user: { capabilities: { canManageAdministration: boolean } } }>(session)).user.capabilities.canManageAdministration;
		const response = await fetch('/v1/manufacturers?limit=500');
		manufacturers = response.ok ? await apiData<Item[]>(response) : [];
		if (!editing) resetForm();
	}
	function edit(item: Item, trigger: HTMLButtonElement | null) {
		returnFocus = trigger; editing = item; formOpen = true; errors = {}; formError = '';
		form = { name: item.name ?? '', managementCodePrefix: item.managementCodePrefix ?? '', displayName: item.displayName ?? '', sortOrder: String(item.sortOrder), manufacturerId: item.manufacturerId ? String(item.manufacturerId) : '', series: item.series ?? '', modelNumber: item.modelNumber ?? '', vendor: item.vendor ?? '', product: item.product ?? '', version: item.version ?? '', edition: item.edition ?? '', architecture: item.architecture ?? '', officialUrl: item.officialUrl ?? '', sourceCheckedOn: item.sourceCheckedOn?.slice(0, 10) ?? '', supportsCpu: item.supportsCpu ?? false, supportsRam: item.supportsRam ?? false, supportsOs: item.supportsOs ?? false, supportsLoginUsername: item.supportsLoginUsername ?? false, disposalDatePolicy: item.disposalDatePolicy ?? 'prohibited' };
		updateOperatingSystemDisplayName();
		initialSnapshot = formSnapshot(form); confirmingDiscard = false;
		void tick().then(() => formElement?.querySelector<HTMLInputElement>(resource === 'operating-systems' ? '[name="vendor"]' : '[name="name"]')?.focus());
	}
	function add() { returnFocus = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : addButton ?? null; resetForm(); formOpen = true; void tick().then(() => formElement?.querySelector<HTMLInputElement>(resource === 'operating-systems' ? '[name="vendor"]' : '[name="name"]')?.focus()); }
	function closeFormImmediately() { if (saving) return; const focusTarget = returnFocus; resetForm(); void tick().then(() => focusTarget?.focus()); }
	function requestCloseForm() { if (saving) return; sourceDateOpen = false; if (hasUnsavedChanges) { confirmingDiscard = true; return; } closeFormImmediately(); }
	function clearError(field: string) { errors[field] = ''; formError = ''; }
	async function save() {
		if (saving) return;
		updateOperatingSystemDisplayName();
		const required = [...(resource === 'operating-systems' ? ['vendor', 'product', 'version', 'displayName'] : ['name']), ...(resource === 'it-asset-types' ? ['managementCodePrefix'] : [])];
		errors = {};
		for (const key of required) if (!String(form[key as keyof typeof form] ?? '').trim()) errors[key] = 'fieldRequired';
		if (resource === 'it-asset-types' && form.managementCodePrefix && !/^[A-Z]{3,5}$/.test(form.managementCodePrefix)) errors.managementCodePrefix = 'prefixInvalid';
		if (!/^\d+$/.test(form.sortOrder)) errors.sortOrder = 'sortInvalid';
		if (form.officialUrl && !/^https?:\/\//i.test(form.officialUrl)) errors.officialUrl = 'urlInvalid';
		if (Object.keys(errors).length) { formError = 'correctFields'; await tick(); formElement?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(); return; }
		saving = true; formError = '';
		try {
			const response = await fetch(`/v1/${resource}${editing ? '/' + editing.id : ''}`, { method: editing ? 'PATCH' : 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(form) });
			if (!response.ok) {
				const payload = await response.json().catch(() => null) as { error?: { details?: { field?: string }[] } } | null;
				const field = payload?.error?.details?.[0]?.field;
				if (field && ['name', 'displayName', 'managementCodePrefix'].includes(field)) { errors[field] = 'valueDuplicate'; formError = 'correctField'; await tick(); formElement?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(); }
				else formError = response.status === 403 ? 'saveForbidden' : 'saveDuplicateFailed';
				return;
			}
			const focusTarget = returnFocus; resetForm(); await list?.refresh(); void tick().then(() => focusTarget?.focus());
		} catch { formError = 'saveRetry'; }
		finally { saving = false; }
	}
	async function remove(item: Item) {
		if (!confirm(t('deleteConfirm', item.name ?? item.displayName ?? text.item))) return;
		const response = await fetch(`/v1/${resource}/${item.id}`, { method: 'DELETE' });
		if (!response.ok) { message = response.status === 403 ? 'deleteForbidden' : 'deleteFailed'; return; }
		message = ''; await load(); resetForm(); await list?.refresh();
	}
	function handleWindowKeydown(event: KeyboardEvent) {
		if (event.defaultPrevented || confirmingDiscard || !formOpen || !dialogElement) return;
		if (event.key === 'Escape') { event.preventDefault(); if (sourceDateOpen) { sourceDateOpen = false; void tick().then(() => dialogElement?.querySelector<HTMLButtonElement>('[data-field="master-source-checked"] .date-trigger')?.focus()); } else requestCloseForm(); return; }
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
		<MasterPageHeader {title} description={text.itDescription} actions={headerActions} />
		{#if message}<p class="notice" role="alert">{m(message)}</p>{/if}
		<section class="panel"><MasterList bind:this={list} endpoint={`/v1/${resource}`} {columns} {title} {canManage} {minTableWidth} {initialSortBy} sortStorageKey={`master-sort:/v1/${resource}`} onEdit={(item, trigger) => edit(item as Item, trigger)} onDelete={(item) => remove(item as Item)} /></section>
	</AssetManagementShell>

	{#if canManage && formOpen}
		<ModalBackdrop onDismiss={requestCloseForm} disabled={saving}><dialog bind:this={dialogElement} class="master-dialog app-modal app-modal--compact" open aria-modal="true" aria-labelledby="it-master-dialog-title">
			<ModalHeader title={modalTitle} titleId="it-master-dialog-title" closeLabel={t('closeForm', itemLabel)} disabled={saving} onClose={requestCloseForm} />
			<form bind:this={formElement} class="app-modal-form" novalidate onsubmit={(event) => { event.preventDefault(); void save(); }}>
				<div class="master-form-body app-modal-form-body">
					{#if formError}<div class="app-modal-error-summary" role="alert"><strong>{text.saveTitle}</strong><span>{m(formError)}</span></div>{/if}
					<FormSection title={text.basicInformation} framed>
					{#if resource === 'it-asset-types' || resource === 'manufacturers' || resource === 'it-asset-statuses'}<label><span>{text.name} <span class="required" aria-hidden="true">*</span></span><input name="name" bind:value={form.name} maxlength="128" placeholder={text.nameExample} class:invalid={!!errors.name} aria-invalid={!!errors.name} aria-describedby={errors.name ? 'master-name-error' : undefined} oninput={() => clearError('name')} />{#if errors.name}<small id="master-name-error" class="field-error">{m(errors.name)}</small>{/if}</label>{/if}
					{#if resource === 'it-asset-types'}<label><span>{text.managementCodePrefix} <span class="required" aria-hidden="true">*</span></span><input name="managementCodePrefix" bind:value={form.managementCodePrefix} minlength="3" maxlength="5" placeholder={text.prefixExample} class:invalid={!!errors.managementCodePrefix} aria-invalid={!!errors.managementCodePrefix} aria-describedby={errors.managementCodePrefix ? 'master-prefix-error' : undefined} oninput={() => clearError('managementCodePrefix')} />{#if errors.managementCodePrefix}<small id="master-prefix-error" class="field-error">{m(errors.managementCodePrefix)}</small>{/if}</label>{/if}
					{#if resource === 'operating-systems'}
						<label><span>{text.vendor} <span class="required" aria-hidden="true">*</span></span><input name="vendor" bind:value={form.vendor} placeholder={text.vendorExample} class:invalid={!!errors.vendor} aria-invalid={!!errors.vendor} aria-describedby={errors.vendor ? 'master-vendor-error' : undefined} oninput={(event) => updateOperatingSystemField('vendor', event.currentTarget.value)} />{#if errors.vendor}<small id="master-vendor-error" class="field-error">{m(errors.vendor)}</small>{/if}</label>
						<label><span>{text.product} <span class="required" aria-hidden="true">*</span></span><input name="product" bind:value={form.product} placeholder={text.productExample} class:invalid={!!errors.product} aria-invalid={!!errors.product} aria-describedby={errors.product ? 'master-product-error' : undefined} oninput={(event) => updateOperatingSystemField('product', event.currentTarget.value)} />{#if errors.product}<small id="master-product-error" class="field-error">{m(errors.product)}</small>{/if}</label>
						<label><span>{text.version} <span class="required" aria-hidden="true">*</span></span><input name="version" bind:value={form.version} placeholder={text.versionExample} class:invalid={!!errors.version} aria-invalid={!!errors.version} aria-describedby={errors.version ? 'master-version-error' : undefined} oninput={(event) => updateOperatingSystemField('version', event.currentTarget.value)} />{#if errors.version}<small id="master-version-error" class="field-error">{m(errors.version)}</small>{/if}</label>
						<label><span>{text.edition}</span><input name="edition" bind:value={form.edition} placeholder={text.editionExample} oninput={(event) => updateOperatingSystemField('edition', event.currentTarget.value)} /></label><label><span>{text.architecture}</span><input name="architecture" bind:value={form.architecture} placeholder={text.architectureExample} oninput={(event) => updateOperatingSystemField('architecture', event.currentTarget.value)} /></label>
						<label><span>{text.displayName} <span class="required" aria-hidden="true">*</span></span><input name="displayName" bind:value={form.displayName} readonly placeholder={text.displayNameExample} class:invalid={!!errors.displayName} aria-invalid={!!errors.displayName} aria-describedby={errors.displayName ? 'master-display-error' : undefined} />{#if errors.displayName}<small id="master-display-error" class="field-error">{m(errors.displayName)}</small>{/if}</label>
					{/if}
					<label><span>{text.sortOrder} <span class="required" aria-hidden="true">*</span></span><input name="sortOrder" bind:value={form.sortOrder} type="number" min="0" step="1" placeholder={text.sortOrderExample} class:invalid={!!errors.sortOrder} aria-invalid={!!errors.sortOrder} aria-describedby={errors.sortOrder ? 'master-order-error' : undefined} oninput={() => clearError('sortOrder')} />{#if errors.sortOrder}<small id="master-order-error" class="field-error">{m(errors.sortOrder)}</small>{/if}</label>
					</FormSection>
					{#if resource === 'manufacturers' || resource === 'operating-systems'}
						<FormSection title={text.referenceInformation} framed>
							<label><span>{text.officialUrl}</span><input name="officialUrl" bind:value={form.officialUrl} type="url" maxlength="1000" placeholder="https://example.com" class:invalid={!!errors.officialUrl} aria-invalid={!!errors.officialUrl} aria-describedby={errors.officialUrl ? 'master-url-error' : undefined} oninput={() => clearError('officialUrl')} />{#if errors.officialUrl}<small id="master-url-error" class="field-error">{m(errors.officialUrl)}</small>{/if}</label><DatePicker label={text.sourceChecked} field="master-source-checked" value={form.sourceCheckedOn} open={sourceDateOpen} onToggle={() => sourceDateOpen = !sourceDateOpen} onSelect={(value) => { form.sourceCheckedOn = value; sourceDateOpen = false; }} />
						</FormSection>
					{/if}
					{#if resource === 'it-asset-statuses'}
						<FormSection title={text.lifecyclePolicy} framed><SearchSelect label={text.disposalDate} field="disposalDatePolicy" value={form.disposalDatePolicy} options={[{ value: 'prohibited', label: text.prohibited }, { value: 'optional', label: text.optional }, { value: 'required', label: text.required }]} onSelect={(value) => form.disposalDatePolicy = value} /></FormSection>
					{/if}
					{#if resource === 'it-asset-types'}
						<FormSection title={text.supportedFields} framed><fieldset class="supported-fields"><legend class="visually-hidden">{text.supportedFields}</legend><label><input bind:checked={form.supportsCpu} type="checkbox" />CPU</label><label><input bind:checked={form.supportsRam} type="checkbox" />RAM</label><label><input bind:checked={form.supportsOs} type="checkbox" />OS</label><label><input bind:checked={form.supportsLoginUsername} type="checkbox" />{text.loginUsername}</label></fieldset></FormSection>
					{/if}
				</div>
				<footer class="app-modal-footer"><button class="secondary" type="button" disabled={saving} onclick={requestCloseForm}>{text.cancel}</button><button class="app-primary-action" type="submit" disabled={saving}>{saving ? text.saving : editing ? text.saveChanges : addLabel}</button></footer>
			</form>
		</dialog></ModalBackdrop>
		{#if confirmingDiscard}<DiscardChangesDialog onContinue={() => confirmingDiscard = false} onDiscard={closeFormImmediately} />{/if}
	{/if}
{/if}

<style>
	.panel{width:100%;min-width:0}.notice{margin:0 0 14px;color:var(--danger);font-size:13px}.master-dialog{width:min(calc(100% - 32px),900px)}.supported-fields{display:flex;grid-column:1/-1;align-items:center;gap:16px;margin:0;padding:10px 12px;border:1px solid var(--border);border-radius:4px}.supported-fields legend{padding:0 4px;font-size:11px;font-weight:600}.supported-fields .visually-hidden{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}.supported-fields label{display:flex;align-items:center;gap:5px;font-weight:400}.supported-fields input{margin:0}@media(max-width:700px){.supported-fields{align-items:flex-start;flex-direction:column}}
</style>
