<script lang="ts">
	import { onMount, tick } from 'svelte';
	import DatePicker from '$lib/components/DatePicker.svelte';
	import AssetManagementShell from '$lib/components/AssetManagementShell.svelte';
	import MasterList from '$lib/components/MasterList.svelte';
	import { apiData } from '$lib/api';

	type Manufacturer = { id: number; name: string };
	type CpuType = { id: number; code: string; displayName: string; manufacturerId: number; manufacturer: Manufacturer; series: string; modelNumber: string; sortOrder: number; officialUrl: string | null; sourceCheckedOn: string | null };
	type ModalMode = 'add' | 'edit' | 'detail' | null;
	type FormField = 'code' | 'displayName' | 'manufacturerId' | 'series' | 'modelNumber' | 'sortOrder' | 'officialUrl' | 'sourceCheckedOn';
	const emptyForm = () => ({ code: '', displayName: '', manufacturerId: '', series: '', modelNumber: '', sortOrder: '0', officialUrl: '', sourceCheckedOn: '' });
	const columns = [
		{ key: 'displayName', label: 'Display Name', width: 30, primary: true, value: (item: CpuType) => item.displayName },
		{ key: 'manufacturer', label: 'Manufacturer', width: 25, value: (item: CpuType) => item.manufacturer?.name ?? '' },
		{ key: 'series', label: 'Series', width: 20, value: (item: CpuType) => item.series },
		{ key: 'modelNumber', label: 'Model number', width: 20, value: (item: CpuType) => item.modelNumber }
	];

	let role = $state('');
	let list = $state<MasterList>();
	let manufacturers = $state<Manufacturer[]>([]);
	let manufacturerSearch=$state('');
	let filteredManufacturers=$derived(manufacturers.filter((item)=>item.name.toLocaleLowerCase().includes(manufacturerSearch.toLocaleLowerCase())));
	let notice = $state('');
	let mode = $state<ModalMode>(null);
	let selected = $state<CpuType | null>(null);
	let form = $state(emptyForm());
	let errors = $state<Partial<Record<FormField, string>>>({});
	let formError = $state('');
	let saving = $state(false);
	let removing = $state(false);
	let dialogElement = $state<HTMLDialogElement>();
	let manufacturerOpen = $state(false);
	let manufacturerAbove = $state(false);
	let sourceDateOpen = $state(false);
	let sourceDateAbove = $state(false);
	let addButton = $state<HTMLButtonElement>();
	let returnFocus: HTMLElement | null = null;
	let canManage = $derived(role === 'system_administrator' || role === 'business_administrator');

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
		form = item ? { code: item.code, displayName: item.displayName, manufacturerId: String(item.manufacturerId), series: item.series, modelNumber: item.modelNumber, sortOrder: String(item.sortOrder), officialUrl: item.officialUrl ?? '', sourceCheckedOn: item.sourceCheckedOn?.slice(0, 10) ?? '' } : { ...emptyForm(), manufacturerId: manufacturers[0] ? String(manufacturers[0].id) : '' };
		errors = {};
		formError = '';
		manufacturerOpen = false;
		sourceDateOpen = false;
		void tick().then(() => dialogElement?.querySelector<HTMLElement>(next === 'detail' ? '.modal-close' : '[name="displayName"]')?.focus());
	}
	function closeModal() {
		if (saving || removing) return;
		manufacturerOpen = false;
		sourceDateOpen = false;
		mode = null;
		selected = null;
		void tick().then(() => returnFocus?.focus());
	}
	function updateField(field: FormField, value: string) {
		form[field] = value;
		if (errors[field]) { const next = { ...errors }; delete next[field]; errors = next; }
		if (!Object.keys(errors).length) formError = '';
	}
	function toggleManufacturer(event: MouseEvent) {
		event.stopPropagation();
		if (manufacturerOpen) { manufacturerOpen = false; return; }
		const trigger = event.currentTarget as HTMLButtonElement;
		const body = trigger.closest('.app-modal-form-body');
		const bounds = body?.getBoundingClientRect();
		const rect = trigger.getBoundingClientRect();
		const listHeight = Math.min(manufacturers.length * 28 + 8, 200);
		manufacturerAbove = Boolean(bounds && bounds.bottom - rect.bottom < listHeight + 4 && rect.top - bounds.top > bounds.bottom - rect.bottom);
		sourceDateOpen = false;
		manufacturerOpen = true;
		manufacturerSearch='';
		void tick().then(()=>dialogElement?.querySelector<HTMLInputElement>('.manufacturer-search')?.focus());
	}
	function chooseManufacturer(value: number) {
		updateField('manufacturerId', String(value));
		manufacturerOpen = false;
		void tick().then(() => dialogElement?.querySelector<HTMLButtonElement>('[name="manufacturerId"]')?.focus());
	}
	function focusManufacturerOption(index: number) {
		void tick().then(() => dialogElement?.querySelectorAll<HTMLButtonElement>('.form-select-options button')[index]?.focus());
	}
	function manufacturerTriggerKeydown(event: KeyboardEvent) {
		if(event.key.length===1&&!event.ctrlKey&&!event.altKey&&!event.metaKey){event.preventDefault();manufacturerSearch=event.key;manufacturerOpen=true;sourceDateOpen=false;void tick().then(()=>dialogElement?.querySelector<HTMLInputElement>('.manufacturer-search')?.focus());return;}
		if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
		if (!manufacturers.length) return;
		event.preventDefault();
		if (!manufacturerOpen) { manufacturerOpen = true; manufacturerSearch=''; sourceDateOpen = false; }
		const index = filteredManufacturers.findIndex((item) => String(item.id) === form.manufacturerId);
		focusManufacturerOption(event.key === 'ArrowDown' ? Math.min(index + 1, filteredManufacturers.length - 1) : Math.max(index - 1, 0));
	}
	function manufacturerOptionKeydown(event: KeyboardEvent, index: number) {
		if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
		event.preventDefault();
		focusManufacturerOption(event.key === 'Home' ? 0 : event.key === 'End' ? filteredManufacturers.length - 1 : event.key === 'ArrowDown' ? Math.min(index + 1, filteredManufacturers.length - 1) : Math.max(index - 1, 0));
	}
	function manufacturerSearchKeydown(event: KeyboardEvent){
		if(event.key==='ArrowDown'){event.preventDefault();focusManufacturerOption(0);}
		else if(event.key==='Enter'&&filteredManufacturers[0]){event.preventDefault();chooseManufacturer(filteredManufacturers[0].id);}
		else if(event.key==='Escape'){event.preventDefault();manufacturerOpen=false;void tick().then(()=>dialogElement?.querySelector<HTMLButtonElement>('[name="manufacturerId"]')?.focus());}
	}
	function manufacturerFocusout(event: FocusEvent) {
		if (manufacturerOpen && !(event.relatedTarget instanceof Node && (event.currentTarget as HTMLElement).contains(event.relatedTarget))) manufacturerOpen = false;
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
		manufacturerOpen = false;
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
		for (const field of ['code', 'displayName', 'series', 'modelNumber'] as const) if (!form[field].trim()) next[field] = 'This field is required.';
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
				if (response.status === 409 && field && ['code', 'displayName', 'modelNumber'].includes(field)) {
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
		if (!mode || !dialogElement) return;
		if (event.key === 'Escape') {
			event.preventDefault();
			if (manufacturerOpen) { manufacturerOpen = false; dialogElement.querySelector<HTMLButtonElement>('[name="manufacturerId"]')?.focus(); }
			else if (sourceDateOpen) { sourceDateOpen = false; dialogElement.querySelector<HTMLButtonElement>('[data-field="sourceCheckedOn"] .date-trigger')?.focus(); }
			else closeModal();
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

<svelte:window onkeydown={handleWindowKeydown} />
<AssetManagementShell title="CPU types" active="">
	<div class="cpu-page">
		<header class="heading"><div><p>IT ASSET CONFIGURATION</p><h1>CPU types</h1><span>Manage CPU models available to IT assets.</span></div>{#if canManage}<button bind:this={addButton} class="app-add-button" type="button" aria-label="+ Add cpu type" onclick={() => openModal('add')}><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M4 8h8M8 4v8" /></svg>Add cpu type</button>{/if}</header>
		{#if notice}<p class="notice" role="status">{notice}</p>{/if}
		<MasterList bind:this={list} endpoint="/v1/cpu-types" title="CPU types" listHeading="All CPU types" description="Search and manage CPU models." {columns} {canManage} initialSortBy="displayName" pageSizeStorageKey="cpu-types-page-size" minTableWidth={760} onDetail={(item, trigger) => openModal('detail', item as CpuType, trigger)} onEdit={(item, trigger) => openModal('edit', item as CpuType, trigger)} onDelete={(item) => remove(item as CpuType)} />
	</div>
</AssetManagementShell>

{#if mode}
	<div class="backdrop app-modal-backdrop" role="presentation"><dialog bind:this={dialogElement} class={mode === 'detail' ? 'cpu-dialog app-modal app-modal--compact' : 'cpu-dialog app-modal'} open aria-modal="true" aria-labelledby="cpu-dialog-title">
		<header><h2 id="cpu-dialog-title">{mode === 'add' ? 'Add cpu type' : mode === 'edit' ? 'Edit cpu type' : 'CPU type details'}</h2><button class="modal-close app-modal-close" type="button" aria-label="Close CPU type dialog" onclick={closeModal}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg></button></header>
		{#if mode === 'detail' && selected}{@const officialUrl = officialUrlHref(selected.officialUrl)}<dl class="dialog-body detail-grid"><div><dt>Display name</dt><dd>{selected.displayName}</dd></div><div><dt>Manufacturer</dt><dd>{selected.manufacturer?.name}</dd></div><div><dt>Series</dt><dd>{selected.series}</dd></div><div><dt>Model number</dt><dd>{selected.modelNumber}</dd></div><div><dt>Code</dt><dd>{selected.code}</dd></div><div><dt>Sort order</dt><dd>{selected.sortOrder}</dd></div><div><dt>Official URL</dt><dd>{#if officialUrl}<a href={officialUrl} target="_blank" rel="noopener noreferrer">{selected.officialUrl}</a>{:else}{selected.officialUrl ?? ''}{/if}</dd></div><div><dt>Source checked</dt><dd>{selected.sourceCheckedOn?.slice(0, 10) ?? ''}</dd></div></dl><footer class="app-modal-footer"><button class="secondary" type="button" onclick={closeModal}>Close</button></footer>
		{:else}<form id="cpu-form" class="cpu-form app-modal-form" novalidate onsubmit={(event) => { event.preventDefault(); void save(); }}>
			<div class="cpu-form-body app-modal-form-body">
				{#if formError}<div class="app-modal-error-summary" role="alert"><strong>Unable to save CPU type</strong><span>{formError}</span></div>{/if}
				<h3>Basic information</h3>
				<label><span>Display name <span class="required" aria-hidden="true">*</span></span><input name="displayName" value={form.displayName} required maxlength="255" class:invalid={Boolean(errors.displayName)} aria-invalid={Boolean(errors.displayName)} aria-describedby={errors.displayName ? 'displayName-error' : undefined} oninput={(event) => updateField('displayName', event.currentTarget.value)} />{#if errors.displayName}<span class="field-error" id="displayName-error" role="alert">{errors.displayName}</span>{/if}</label>
				<div class="form-select-field"><span>Manufacturer <span class="required" aria-hidden="true">*</span></span><div class="form-select-picker" class:above={manufacturerAbove && manufacturerOpen} data-field="manufacturerId" onfocusout={manufacturerFocusout}><button class="form-select-trigger" class:unselected={!form.manufacturerId} class:invalid={Boolean(errors.manufacturerId)} name="manufacturerId" type="button" role="combobox" disabled={!manufacturers.length} aria-label="Manufacturer (required)" aria-required="true" aria-invalid={Boolean(errors.manufacturerId)} aria-describedby={errors.manufacturerId ? 'manufacturerId-error' : undefined} aria-controls="manufacturer-options" aria-haspopup="listbox" aria-expanded={manufacturerOpen} onclick={toggleManufacturer} onkeydown={manufacturerTriggerKeydown}><span>{manufacturers.find((item) => String(item.id) === form.manufacturerId)?.name ?? '-'}</span><svg viewBox="0 0 10 6" aria-hidden="true"><path d="M1 1l4 4 4-4" /></svg></button>{#if manufacturerOpen}<div id="manufacturer-options" class="form-select-options" role="listbox" aria-label="Manufacturer"><input class="manufacturer-search" type="search" value={manufacturerSearch} placeholder="Search..." aria-label="Search manufacturers" oninput={(event)=>manufacturerSearch=event.currentTarget.value} onkeydown={manufacturerSearchKeydown}/>{#each filteredManufacturers as manufacturer, index}<button type="button" role="option" tabindex="-1" aria-selected={String(manufacturer.id) === form.manufacturerId} class:selected={String(manufacturer.id) === form.manufacturerId} onclick={() => chooseManufacturer(manufacturer.id)} onkeydown={(event) => manufacturerOptionKeydown(event, index)}>{manufacturer.name}</button>{:else}<p>No options found.</p>{/each}</div>{/if}</div>{#if errors.manufacturerId}<span class="field-error" id="manufacturerId-error" role="alert">{errors.manufacturerId}</span>{/if}</div>
				<label><span>Series <span class="required" aria-hidden="true">*</span></span><input name="series" value={form.series} required maxlength="128" class:invalid={Boolean(errors.series)} aria-invalid={Boolean(errors.series)} aria-describedby={errors.series ? 'series-error' : undefined} oninput={(event) => updateField('series', event.currentTarget.value)} />{#if errors.series}<span class="field-error" id="series-error" role="alert">{errors.series}</span>{/if}</label>
				<label><span>Model number <span class="required" aria-hidden="true">*</span></span><input name="modelNumber" value={form.modelNumber} required maxlength="128" class:invalid={Boolean(errors.modelNumber)} aria-invalid={Boolean(errors.modelNumber)} aria-describedby={errors.modelNumber ? 'modelNumber-error' : undefined} oninput={(event) => updateField('modelNumber', event.currentTarget.value)} />{#if errors.modelNumber}<span class="field-error" id="modelNumber-error" role="alert">{errors.modelNumber}</span>{/if}</label>
				<label><span>Code <span class="required" aria-hidden="true">*</span></span><input name="code" value={form.code} required maxlength="64" class:invalid={Boolean(errors.code)} aria-invalid={Boolean(errors.code)} aria-describedby={errors.code ? 'code-error' : undefined} oninput={(event) => updateField('code', event.currentTarget.value)} />{#if errors.code}<span class="field-error" id="code-error" role="alert">{errors.code}</span>{/if}</label>
				<label><span>Sort order <span class="required" aria-hidden="true">*</span></span><input name="sortOrder" type="number" min="0" step="1" value={form.sortOrder} required class:invalid={Boolean(errors.sortOrder)} aria-invalid={Boolean(errors.sortOrder)} aria-describedby={errors.sortOrder ? 'sortOrder-error' : undefined} oninput={(event) => updateField('sortOrder', event.currentTarget.value)} />{#if errors.sortOrder}<span class="field-error" id="sortOrder-error" role="alert">{errors.sortOrder}</span>{/if}</label>
				<h3>Reference information</h3>
				<label><span>Official URL</span><input name="officialUrl" type="url" value={form.officialUrl} maxlength="1000" class:invalid={Boolean(errors.officialUrl)} aria-invalid={Boolean(errors.officialUrl)} aria-describedby={errors.officialUrl ? 'officialUrl-error' : undefined} oninput={(event) => updateField('officialUrl', event.currentTarget.value)} />{#if errors.officialUrl}<span class="field-error" id="officialUrl-error" role="alert">{errors.officialUrl}</span>{/if}</label>
				<DatePicker label="Source checked" field="sourceCheckedOn" value={form.sourceCheckedOn} error={errors.sourceCheckedOn ?? ''} above={sourceDateAbove} open={sourceDateOpen} onToggle={toggleSourceDate} onSelect={(value) => { updateField('sourceCheckedOn', value); sourceDateOpen = false; }} />
			</div>
			<footer class="app-modal-footer"><button class="secondary" type="button" disabled={saving} onclick={closeModal}>Cancel</button><button class="primary" type="submit" disabled={saving}>{saving ? 'Saving...' : mode === 'add' ? 'Add cpu type' : 'Save changes'}</button></footer>
		</form>{/if}
	</dialog></div>
{/if}

<style>
	.cpu-page{display:flex;min-width:0;width:100%;height:calc(100dvh - 124px);min-height:0;flex-direction:column}.heading{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:24px}.heading p{margin:0;color:#1abb9c;font-size:11px;font-weight:700;letter-spacing:.08em}.heading h1{margin:4px 0;color:var(--text);font-size:30px}.heading span{color:var(--muted);font-size:13px}.notice{margin:0 0 14px;color:var(--text-secondary);font-size:13px}
	.dialog-body{min-height:0;overflow-y:auto;padding:20px 24px;background:var(--bg)}.detail-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;margin:0}.detail-grid div{min-width:0}.detail-grid dt{color:var(--muted);font-size:11px;font-weight:700;text-transform:uppercase}.detail-grid dd{margin:4px 0 0;color:var(--text);font-size:13px;overflow-wrap:anywhere}.detail-grid a{color:#337ab7;text-decoration:underline;text-underline-offset:2px}:global(html[data-theme='dark']) .detail-grid a{color:#77b9f0}
	button:focus-visible,input:focus-visible{outline:2px solid #1abb9c;outline-offset:2px}@media(max-width:760px){.cpu-page{width:calc(100vw - 96px);max-width:calc(100vw - 96px)}}@media(max-width:700px){.heading{align-items:stretch;flex-direction:column}.dialog-body{padding:16px}.detail-grid{grid-template-columns:1fr}}
.manufacturer-search{width:100%;height:30px;margin-bottom:3px;padding:0 8px;background:var(--surface);color:var(--text);border:1px solid var(--border);border-radius:4px}.manufacturer-search:focus{outline:2px solid #1abb9c}.form-select-options p{margin:6px;color:var(--muted);font-size:12px}</style>
