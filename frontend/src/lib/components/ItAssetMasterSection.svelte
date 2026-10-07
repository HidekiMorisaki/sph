<script lang="ts">
	import { localeMessages, formatLocaleTemplate } from '$lib/locale-messages';
	import { formatDate, localization } from '$lib/localization';
	import { onMount, tick } from 'svelte';
	import { apiData } from '$lib/api';
	import AddButton from '$lib/components/AddButton.svelte';
	import DatePicker from '$lib/components/DatePicker.svelte';
	import DiscardChangesDialog from '$lib/components/DiscardChangesDialog.svelte';
	import FormSection from '$lib/components/FormSection.svelte';
	import MasterList from '$lib/components/MasterList.svelte';
	import MasterRecordDetailModal from '$lib/components/MasterRecordDetailModal.svelte';
	import ModalBackdrop from '$lib/components/ModalBackdrop.svelte';
	import ModalHeader from '$lib/components/ModalHeader.svelte';
	import StatusNotice from '$lib/components/StatusNotice.svelte';
	import SearchSelect from '$lib/components/SearchSelect.svelte';
	import { formSnapshot } from '$lib/modalForm';
	import { operatingSystemName } from '$lib/operating-system-name';
	import '$lib/styles/add-button.css';

	let text = $derived(localeMessages[$localization.displayLanguage].masters);
	let commonText = $derived(localeMessages[$localization.displayLanguage].common);
	function m(key: string | undefined): string { return key ? text[key as keyof typeof text] ?? text.invalidValue : ''; }
	function t(key: keyof typeof text, ...values: (string | number)[]) { return formatLocaleTemplate(text[key], ...values); }

	type Resource = 'it-asset-types' | 'manufacturers' | 'operating-system-vendors' | 'operating-systems' | 'it-asset-statuses';
	type Vendor = { id: number; name: string; sortOrder: number };
	type Item = { id: number; name?: string; managementCodePrefix?: string; sortOrder: number; usageCount?: number; manufacturerId?: number; series?: string; modelNumber?: string; vendorId?: number; vendor?: Vendor; product?: string; version?: string; edition?: string | null; architecture?: string | null; officialUrl?: string | null; sourceCheckedOn?: string | null; supportsCpu?: boolean; supportsRam?: boolean; supportsOs?: boolean; supportsLoginUsername?: boolean; disposalDatePolicy?: string; notes?: string | null };
	let labels: Record<Resource, string> = $derived({ 'it-asset-types': text.itAssetTypes, manufacturers: text.manufacturers, 'operating-system-vendors': text.operatingSystemVendors, 'operating-systems': text.operatingSystems, 'it-asset-statuses': text.statuses });
	let singularLabels: Record<Resource, string> = $derived({ 'it-asset-types': text.assetTypeItem, manufacturers: text.manufacturers, 'operating-system-vendors': text.osVendorItem, 'operating-systems': text.osItem, 'it-asset-statuses': text.statusItem });
	const blank = () => ({ name: '', managementCodePrefix: '', manufacturerId: '', series: '', modelNumber: '', vendorId: '', product: '', version: '', edition: '', architecture: '', officialUrl: '', sourceCheckedOn: '', supportsCpu: false, supportsRam: false, supportsOs: false, supportsLoginUsername: false, disposalDatePolicy: 'prohibited', notes: '' });

	let { resource }: { resource: Resource } = $props();
	const title = $derived(labels[resource]);
	const sectionDescription = $derived(({ 'it-asset-statuses': text.statusesSectionDescription, 'it-asset-types': text.itAssetTypesSectionDescription, manufacturers: text.manufacturersSectionDescription, 'operating-system-vendors': text.operatingSystemVendorsSectionDescription, 'operating-systems': text.operatingSystemsSectionDescription })[resource]);
	const itemLabel = $derived(singularLabels[resource]);
	const addLabel = $derived(t('addItem', itemLabel));
	let canManage = $state(false);
	let vendors = $state<Vendor[]>([]);
	let editing = $state<Item | null>(null);
	let detailItem = $state<Item | null>(null);
	let detailReturnFocus = $state<HTMLElement | null>(null);
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
	let hasDraftChanges = $derived(initialSnapshot !== '' && formSnapshot(form) !== initialSnapshot);
	let hasUnsavedChanges = $derived(Boolean(editing) && hasDraftChanges);
	let initialSortBy = $derived('sortOrder');
	const productIds = new Map<string, number>();
	let nextProductId = 1;
	function operatingSystemTreeParent(row: { id: number; [key: string]: unknown }) {
		const item = row as Item;
		if (!item.vendor || !item.product) return null;
		const vendor = vendors.find((candidate) => candidate.id === item.vendor?.id);
		const productKey = JSON.stringify([item.vendor.id, item.product]);
		let productId = productIds.get(productKey);
		if (productId === undefined) { productId = nextProductId++; productIds.set(productKey, productId); }
		return { id: productId, label: item.product, order: item.sortOrder, ancestor: { id: item.vendor.id, label: vendor?.name ?? item.vendor.name, order: vendor?.sortOrder ?? item.sortOrder } };
	}
	function operatingSystemLeaf(item: Item) {
		const version = [item.version, item.edition].filter(Boolean).join(' ');
		return item.architecture ? `${version} (${item.architecture})` : version;
	}
	const osName = (item: Item) => operatingSystemName({ vendor: item.vendor ?? { name: '' }, product: item.product ?? '', version: item.version ?? '', edition: item.edition, architecture: item.architecture });
	let columns = $derived([{ key: 'name', label: text.name, width: 86, sortable: false, value: (item: Item) => resource === 'operating-systems' ? operatingSystemLeaf(item) : item.name }]);
	let detailFields = $derived.by(() => {
		const item = detailItem;
		if (!item) return [];
		const field = (key: string, label: string, value: string | number | boolean | null | undefined) => ({ key, label, value });
			switch (resource) {
			case 'it-asset-types': return [field('name', text.name, item.name), field('managementCodePrefix', text.managementCodePrefix, item.managementCodePrefix), field('supportsCpu', 'CPU', item.supportsCpu), field('supportsRam', 'RAM', item.supportsRam), field('supportsOs', 'OS', item.supportsOs), field('supportsLoginUsername', text.loginUsername, item.supportsLoginUsername), field('notes', text.notes, item.notes)];
			case 'manufacturers': return [field('name', text.name, item.name), field('officialUrl', text.officialUrl, item.officialUrl), field('sourceCheckedOn', text.sourceChecked, formatDate(item.sourceCheckedOn, $localization)), field('notes', text.notes, item.notes)];
			case 'operating-system-vendors': return [field('name', text.name, item.name), field('notes', text.notes, item.notes)];
			case 'operating-systems': return [field('vendorId', text.vendor, item.vendor?.name), field('product', text.product, item.product), field('version', text.version, item.version), field('edition', text.edition, item.edition), field('architecture', text.architecture, item.architecture), field('officialUrl', text.officialUrl, item.officialUrl), field('sourceCheckedOn', text.sourceChecked, formatDate(item.sourceCheckedOn, $localization)), field('notes', text.notes, item.notes)];
			default: return [field('name', text.name, item.name), field('disposalDatePolicy', text.disposalDate, m(item.disposalDatePolicy)), field('notes', text.notes, item.notes)];
		}
	});

	function updateOperatingSystemField(field: 'product' | 'version' | 'edition' | 'architecture', value: string) {
		form[field] = value;
		clearError(field);
		clearError('version');
	}
	function resetForm() { editing = null; formOpen = false; sourceDateOpen = false; errors = {}; formError = ''; form = blank(); initialSnapshot = ''; confirmingDiscard = false; }
	async function loadVendors() {
		vendors = [];
		for (let offset = 0; ; offset += 500) {
			const response = await fetch(`/v1/operating-system-vendors?limit=500&offset=${offset}`);
			if (!response.ok) { message = 'vendorsFailed'; return; }
			const page = await apiData<Vendor[]>(response); vendors.push(...page);
			if (page.length < 500) return;
		}
	}
	function notifyVendorsChanged() { window.dispatchEvent(new Event('os-vendors-changed')); }
	function onVendorsChanged() {
		if (resource === 'operating-systems') void loadVendors().then(() => list?.refresh());
	}
	async function load() {
		const session = await fetch('/v1/auth/session');
		if (!session.ok) { message = 'signInRequired'; return; }
		canManage = (await apiData<{ user: { capabilities: { canManageMasters: boolean } } }>(session)).user.capabilities.canManageMasters;
		if (resource === 'operating-systems') await loadVendors();
		if (!editing) resetForm();
	}
	function edit(item: Item, trigger: HTMLButtonElement | null) {
		returnFocus = trigger; editing = item; formOpen = true; errors = {}; formError = '';
		form = { name: item.name ?? '', managementCodePrefix: item.managementCodePrefix ?? '', manufacturerId: item.manufacturerId ? String(item.manufacturerId) : '', series: item.series ?? '', modelNumber: item.modelNumber ?? '', vendorId: item.vendorId ? String(item.vendorId) : '', product: item.product ?? '', version: item.version ?? '', edition: item.edition ?? '', architecture: item.architecture ?? '', officialUrl: item.officialUrl ?? '', sourceCheckedOn: item.sourceCheckedOn?.slice(0, 10) ?? '', supportsCpu: item.supportsCpu ?? false, supportsRam: item.supportsRam ?? false, supportsOs: item.supportsOs ?? false, supportsLoginUsername: item.supportsLoginUsername ?? false, disposalDatePolicy: item.disposalDatePolicy ?? 'prohibited', notes: item.notes ?? '' };
		initialSnapshot = formSnapshot(form); confirmingDiscard = false;
		void tick().then(() => formElement?.querySelector<HTMLElement>(resource === 'operating-systems' ? '[data-field="vendorId"] button' : '[name="name"]')?.focus());
	}
	function add() { returnFocus = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : addButton ?? null; resetForm(); initialSnapshot = formSnapshot(form); formOpen = true; void tick().then(() => formElement?.querySelector<HTMLElement>(resource === 'operating-systems' ? '[data-field="vendorId"] button' : '[name="name"]')?.focus()); }
	function closeFormImmediately() { if (saving) return; const focusTarget = returnFocus; resetForm(); void tick().then(() => focusTarget?.focus()); }
	function requestCloseForm() { if (saving) return; sourceDateOpen = false; if (hasUnsavedChanges) { confirmingDiscard = true; return; } closeFormImmediately(); }
	function clearError(field: string) { errors[field] = ''; formError = ''; }
	async function save() {
		if (saving) return;
		const required = [...(resource === 'operating-systems' ? ['vendorId', 'product', 'version'] : ['name']), ...(resource === 'it-asset-types' ? ['managementCodePrefix'] : [])];
		errors = {};
		for (const key of required) if (!String(form[key as keyof typeof form] ?? '').trim()) errors[key] = 'fieldRequired';
		if (resource === 'it-asset-types' && form.managementCodePrefix && !/^[A-Z]{3,5}$/.test(form.managementCodePrefix)) errors.managementCodePrefix = 'prefixInvalid';
		if (form.officialUrl && !/^https?:\/\//i.test(form.officialUrl)) errors.officialUrl = 'urlInvalid';
		if (Object.keys(errors).length) { formError = 'correctFields'; await tick(); formElement?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(); return; }
		saving = true; formError = '';
		try {
			const response = await fetch(`/v1/${resource}${editing ? '/' + editing.id : ''}`, { method: editing ? 'PATCH' : 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...form, sortOrder: editing?.sortOrder ?? 2_147_483_647 }) });
			if (!response.ok) {
				const payload = await response.json().catch(() => null) as { error?: { details?: { field?: string }[] } } | null;
				const field = payload?.error?.details?.[0]?.field;
				if (field && ['name', 'version', 'vendorId', 'managementCodePrefix'].includes(field)) { errors[field] = field === 'vendorId' ? 'invalidValue' : 'valueDuplicate'; formError = 'correctField'; await tick(); formElement?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(); }
				else formError = response.status === 403 ? 'saveForbidden' : 'saveDuplicateFailed';
				return;
			}
			const focusTarget = returnFocus; resetForm(); await list?.refresh(); if (resource === 'operating-system-vendors') notifyVendorsChanged(); void tick().then(() => focusTarget?.focus());
		} catch { formError = 'saveRetry'; }
		finally { saving = false; }
	}
	async function remove(item: Item) {
		if (item.usageCount && item.usageCount > 0) { message = 'deleteInUse'; return; }
		message = '';
		if (!confirm(t('deleteConfirm', item.name ?? osName(item) ?? text.item))) return;
		const response = await fetch(`/v1/${resource}/${item.id}`, { method: 'DELETE' });
		if (!response.ok) { message = response.status === 409 ? 'deleteInUse' : response.status === 403 ? 'deleteForbidden' : 'deleteFailed'; return; }
		message = ''; await load(); resetForm(); await list?.refresh(); if (resource === 'operating-system-vendors') notifyVendorsChanged();
	}
	function handleWindowKeydown(event: KeyboardEvent) {
		if (event.defaultPrevented || confirmingDiscard || !formOpen || !dialogElement) return;
		if (event.key === 'Escape') { event.preventDefault(); if (sourceDateOpen) { sourceDateOpen = false; void tick().then(() => dialogElement?.querySelector<HTMLButtonElement>('[data-field="master-source-checked"] .date-trigger')?.focus()); } else if (!editing && hasDraftChanges && !saving) confirmingDiscard = true; else requestCloseForm(); return; }
		if (event.key !== 'Tab') return;
		const focusable = [...dialogElement.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),textarea:not([disabled])')];
		if (!focusable.length) return;
		const first = focusable[0], last = focusable[focusable.length - 1];
		if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
		else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
	}
	onMount(() => { window.addEventListener('os-vendors-changed', onVendorsChanged); void load(); return () => window.removeEventListener('os-vendors-changed', onVendorsChanged); });
</script>

{#snippet headerActions()}{#if canManage}<AddButton bind:element={addButton} label={text.addButton} ariaLabel={addLabel} onclick={add} />{/if}{/snippet}

<svelte:window onkeydown={handleWindowKeydown} onclick={(event) => { if (sourceDateOpen && event.target instanceof Element && !event.target.closest('[data-field="master-source-checked"]')) sourceDateOpen = false; }} />
	<div class="master-section">
		{#if message}<StatusNotice message={m(message)} tone="error" onDismiss={() => message = ''} />{/if}
		<div class="panel"><MasterList bind:this={list} endpoint={`/v1/${resource}`} {columns} {title} listHeading={title} description={sectionDescription} {canManage} unpaged showNameIcon actionLabel={resource === 'operating-systems' ? (row) => osName(row as Item) : undefined} treeParent={resource === 'operating-systems' ? operatingSystemTreeParent : undefined} minTableWidth={0} actionWidth={14} headerActions={headerActions} {initialSortBy} reorderEndpoint={`/v1/it-asset-orders/${resource}`} reorderHint={text.reorderHint} reorderSavingLabel={text.reorderSaving} onReorderError={(reason) => message = reason === 'conflict' ? 'reorderConflict' : reason === 'forbidden' ? 'reorderForbidden' : 'reorderFailed'} onReordered={() => { if (resource === 'operating-system-vendors') notifyVendorsChanged(); }} onDetail={(item, trigger) => { detailItem = item as Item; detailReturnFocus = trigger; }} onEdit={(item, trigger) => edit(item as Item, trigger)} onDelete={(item) => remove(item as Item)} /></div>
	</div>
	{#if detailItem}<MasterRecordDetailModal title={`${title} ${commonText.detail}`} titleId={`it-master-detail-${resource}`} sectionTitle={text.basicInformation} closeLabel={commonText.close} returnFocus={detailReturnFocus} endpoint={`/v1/${resource}`} itemId={detailItem.id} fields={detailFields} hiddenHistoryFields={['sortOrder']} dateFields={['sourceCheckedOn']} valueFormatters={{ disposalDatePolicy: (value) => m(value) }} onClose={() => detailItem = null} />{/if}

	{#if canManage && formOpen}
		<ModalBackdrop><dialog bind:this={dialogElement} class="master-dialog app-modal app-modal--compact" open aria-modal="true" aria-labelledby={`it-master-dialog-${resource}`}>
			<ModalHeader title={modalTitle} titleId={`it-master-dialog-${resource}`} closeLabel={t('closeForm', itemLabel)} disabled={saving} onClose={requestCloseForm} />
			<form bind:this={formElement} class="app-modal-form" novalidate onsubmit={(event) => { event.preventDefault(); void save(); }}>
				<div class="master-form-body app-modal-form-body">
					{#if formError}<StatusNotice title={text.saveTitle} message={m(formError)} tone="error" onDismiss={() => formError = ''} />{/if}
					<FormSection title={text.basicInformation} framed>
					{#if resource === 'it-asset-types' || resource === 'manufacturers' || resource === 'operating-system-vendors' || resource === 'it-asset-statuses'}<label><span>{text.name} <span class="required" aria-hidden="true">*</span></span><input name="name" bind:value={form.name} maxlength="128" placeholder={text.nameExample} class:invalid={!!errors.name} aria-invalid={!!errors.name} aria-describedby={errors.name ? 'master-name-error' : undefined} oninput={() => clearError('name')} />{#if errors.name}<small id="master-name-error" class="field-error">{m(errors.name)}</small>{/if}</label>{/if}
					{#if resource === 'it-asset-types'}<label><span>{text.managementCodePrefix} <span class="required" aria-hidden="true">*</span></span><input name="managementCodePrefix" bind:value={form.managementCodePrefix} minlength="3" maxlength="5" placeholder={text.prefixExample} class:invalid={!!errors.managementCodePrefix} aria-invalid={!!errors.managementCodePrefix} aria-describedby={errors.managementCodePrefix ? 'master-prefix-error' : undefined} oninput={() => clearError('managementCodePrefix')} />{#if errors.managementCodePrefix}<small id="master-prefix-error" class="field-error">{m(errors.managementCodePrefix)}</small>{/if}</label>{/if}
					{#if resource === 'operating-systems'}
						<SearchSelect label={text.vendor} field="vendorId" value={form.vendorId} options={[{ value: '', label: '-' }, ...vendors.map(vendor => ({ value: String(vendor.id), label: vendor.name }))]} required error={m(errors.vendorId)} onSelect={(value) => { form.vendorId = value; clearError('vendorId'); }} />
						<label><span>{text.product} <span class="required" aria-hidden="true">*</span></span><input name="product" bind:value={form.product} placeholder={text.productExample} class:invalid={!!errors.product} aria-invalid={!!errors.product} aria-describedby={errors.product ? 'master-product-error' : undefined} oninput={(event) => updateOperatingSystemField('product', event.currentTarget.value)} />{#if errors.product}<small id="master-product-error" class="field-error">{m(errors.product)}</small>{/if}</label>
						<label><span>{text.version} <span class="required" aria-hidden="true">*</span></span><input name="version" bind:value={form.version} placeholder={text.versionExample} class:invalid={!!errors.version} aria-invalid={!!errors.version} aria-describedby={errors.version ? 'master-version-error' : undefined} oninput={(event) => updateOperatingSystemField('version', event.currentTarget.value)} />{#if errors.version}<small id="master-version-error" class="field-error">{m(errors.version)}</small>{/if}</label>
						<label><span>{text.edition}</span><input name="edition" bind:value={form.edition} placeholder={text.editionExample} oninput={(event) => updateOperatingSystemField('edition', event.currentTarget.value)} /></label><label><span>{text.architecture}</span><input name="architecture" bind:value={form.architecture} placeholder={text.architectureExample} oninput={(event) => updateOperatingSystemField('architecture', event.currentTarget.value)} /></label>
					{/if}
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
					<FormSection title={text.additionalInformation} framed><label class="notes-field"><span>{text.notes}</span><textarea name="notes" bind:value={form.notes} maxlength="5000"></textarea></label></FormSection>
				</div>
				<footer class="app-modal-footer"><button class="secondary" type="button" disabled={saving} onclick={requestCloseForm}>{text.cancel}</button><button class="app-primary-action" type="submit" disabled={saving || (Boolean(editing) && !hasUnsavedChanges)}>{saving ? text.saving : editing ? text.saveChanges : addLabel}</button></footer>
			</form>
		</dialog></ModalBackdrop>
		{#if confirmingDiscard}<DiscardChangesDialog onContinue={() => confirmingDiscard = false} onDiscard={closeFormImmediately} />{/if}
	{/if}
<style>
	.master-section{display:flex;min-width:0;height:100%;flex-direction:column}.panel :global(.master-list){height:auto;max-height:none}.panel :global(.master-header){flex-wrap:wrap}.panel :global(thead){display:none}.panel :global(th),.panel :global(td){padding-right:6px;padding-left:6px;overflow-wrap:anywhere}.panel :global(td:first-child){padding-left:10px}.panel :global(.actions-cell){padding-right:6px;padding-left:2px}
	.panel{width:100%;min-width:0}.panel :global(.tree-child td:first-child){padding-left:38px}.panel :global(.tree-grandchild td:first-child){padding-left:58px}.master-dialog{width:min(calc(100% - 32px),900px)}.notes-field{grid-column:1/-1}.supported-fields{display:flex;grid-column:1/-1;align-items:center;gap:16px;margin:0;padding:10px 12px;border:1px solid var(--border);border-radius:4px}.supported-fields legend{padding:0 4px;font-size:var(--font-size-support);font-weight:600}.supported-fields .visually-hidden{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}.supported-fields label{display:flex;align-items:center;gap:5px;font-weight:400}.supported-fields input{margin:0}@media(max-width:700px){.supported-fields{align-items:flex-start;flex-direction:column}}
</style>
