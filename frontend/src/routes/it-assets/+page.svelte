<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { apiData } from '$lib/api';
	import AddButton from '$lib/components/AddButton.svelte';
	import AssetManagementShell from '$lib/components/AssetManagementShell.svelte';
	import DatePicker from '$lib/components/DatePicker.svelte';
	import MasterList from '$lib/components/MasterList.svelte';
	import SearchSelect from '$lib/components/SearchSelect.svelte';

	type Named = { id: number; code?: string; name: string; displayName?: string; managementCodePrefix?: string; supportsCpu?: boolean; supportsRam?: boolean; supportsOs?: boolean; supportsLoginUsername?: boolean; disposalDatePolicy?: string };
	type Branch = Named;
	type Room = Named & { branchId: number };
	type Location = Named & { roomId: number; room: { id: number; branchId: number; name: string; branch: { id: number; name: string } } };
	type Assignee = { id: number; employeeCode: string; firstName: string; middleName: string | null; lastName: string };
	type Assignment = { id: number; employee: Assignee };
	type Asset = { id: number; assetTag: string; typeId: number; manufacturerId: number | null; modelNumber: string | null; serialNumber: string | null; cpuTypeId: number | null; ramGb: number | null; operatingSystemId: number | null; loginUsername: string | null; locationId: number; statusId: number; purchasedOn: string | null; disposalOn: string | null; notes: string | null; type: Named; manufacturer: Named | null; cpuType: Named | null; operatingSystem: Named | null; status: Named; location: Location; assignments: Assignment[] };
	type DateField = 'purchasedOn' | 'disposalOn';
	type SelectField = 'typeId' | 'statusId' | 'manufacturerId' | 'cpuTypeId' | 'operatingSystemId' | 'branchId' | 'roomId' | 'locationId' | 'assignEmployeeId';
	type SelectOption = { value: string; label: string; searchTerms?: string[] };
	type ChangeDetail = { field: string; before: string | null; after: string | null };
	type ChangeHistory = { id: number; changedAt: string; actorName: string; action: string; changes: ChangeDetail[] };
	const historyFields: Record<string, string> = { assetTag: 'Management code', typeId: 'Type', manufacturerId: 'Manufacturer', modelNumber: 'Model number', serialNumber: 'Serial number', cpuTypeId: 'CPU type', ramGb: 'RAM (GB)', operatingSystemId: 'Operating system', loginUsername: 'Login username', locationId: 'Storage location', statusId: 'Status', purchasedOn: 'Purchase date', disposalOn: 'Disposal date', notes: 'Notes', assigneeId: 'Employee' };
	const historyActions: Record<string, string> = { create: 'Created', update: 'Updated', delete: 'Deleted', assign: 'Assigned', return: 'Returned' };
	type FormField = keyof ReturnType<typeof blank>;

	const blank = () => ({ assetTag: '', typeId: '', manufacturerId: '', modelNumber: '', serialNumber: '', cpuTypeId: '', ramGb: '', operatingSystemId: '', loginUsername: '', locationId: '', statusId: '', purchasedOn: '', disposalOn: '', notes: '' });
	const endpoint = (name: string) => fetch('/v1/' + name + '?limit=500');
	async function allPages<T>(name: string, sortOrder?: 'asc' | 'desc'): Promise<T[]> {
		const items: T[] = [];
		for (let offset = 0; ; offset += 500) {
			const response = await fetch(`/v1/${name}?limit=500&offset=${offset}${sortOrder ? `&sortOrder=${sortOrder}` : ''}`);
			if (!response.ok) throw new Error(`Unable to load ${name}.`);
			const page = await apiData<T[]>(response);
			items.push(...page);
			if (page.length < 500) return items;
		}
	}
	const iso = (value: string | null) => value ? value.slice(0, 10) : '';
	const employeeName = (employee: Assignee) => [employee.firstName, employee.middleName, employee.lastName].filter(Boolean).join(' ');
	const assigneeName = (assignment: Assignment | undefined) => assignment ? employeeName(assignment.employee) : 'Unassigned';

	let assetList = $state<MasterList>();
	let types = $state<Named[]>([]);
	let manufacturers = $state<Named[]>([]);
	let cpus = $state<Named[]>([]);
	let systems = $state<Named[]>([]);
	let statuses = $state<Named[]>([]);
	let branches = $state<Branch[]>([]);
	let rooms = $state<Room[]>([]);
	let locations = $state<Location[]>([]);
	let employees = $state<Assignee[]>([]);
	let changeHistory = $state<ChangeHistory[]>([]);
	let historyLoading = $state(false);
	let historyError = $state(false);
	let historyRequestId = 0;
	let detailAsset = $state<Asset | null>(null);
	let detailDialogElement = $state<HTMLDialogElement>();
	let detailReturnFocus: HTMLElement | null = null;
	let role = $state('');
	let form = $state(blank());
	let branchId = $state('');
	let roomId = $state('');
	let codeLoading = $state(false);
	let previewRequestId = 0;
	let editing = $state<Asset | null>(null);
	let open = $state(false);
	let saving = $state(false);
	let message = $state('');
	let formError = $state('');
	let fieldErrors = $state<Record<string, string>>({});
	let assignEmployeeId = $state('');
	let dialogElement = $state<HTMLDialogElement>();
	let returnFocus: HTMLElement | null = null;
	let activeDateField = $state<DateField | null>(null);

	const selectedType = $derived(types.find((item) => String(item.id) === form.typeId));
	const selectedStatus = $derived(statuses.find((item) => String(item.id) === form.statusId));
	const availableRooms = $derived(rooms.filter((item) => String(item.branchId) === branchId));
	const availableLocations = $derived(locations.filter((item) => String(item.roomId) === roomId && String(item.room.branchId) === branchId));

	async function load() {
		const session = await fetch('/v1/auth/session');
		if (!session.ok) { message = 'Please sign in to continue.'; return; }
		role = (await apiData<{ user: { role: string } }>(session)).user.role;
		const names = ['it-asset-types', 'manufacturers', 'cpu-types', 'operating-systems', 'it-asset-statuses'];
		const responses = await Promise.all(names.map(endpoint));
		if (responses.some((response) => !response.ok)) { message = 'Unable to load IT asset data.'; return; }
		const data = await Promise.all(responses.map((response) => apiData<unknown[]>(response)));
		[types, manufacturers, cpus, systems, statuses] = data as unknown as [Named[], Named[], Named[], Named[], Named[]];
		try { [branches, rooms, locations] = await Promise.all([allPages<Branch>('branches'), allPages<Room>('rooms'), allPages<Location>('storage-locations')]); }
		catch { message = 'Unable to load location data.'; return; }
		if (role !== '') {
			const response = await fetch('/v1/it-asset-assignees');
			if (response.ok) employees = await apiData<Assignee[]>(response);
		}
	}

	function focusForm() {
		void tick().then(() => {
			if (open) (dialogElement?.querySelector<HTMLElement>('form .form-select-trigger:not(:disabled), form input:not(:disabled), form textarea:not(:disabled)') ?? dialogElement?.querySelector<HTMLElement>('.modal-close'))?.focus();
		});
	}
	function closeForm() {
		open = false;
		formError = '';
		fieldErrors = {};
		activeDateField = null;
		previewRequestId++;
		codeLoading = false;
		void tick().then(() => returnFocus?.focus());
	}
	function create() {
		returnFocus = document.activeElement as HTMLElement;
		editing = null;
		form = blank();
		form.typeId = types[0] ? String(types[0].id) : '';
		form.statusId = statuses[0] ? String(statuses[0].id) : '';
		branchId = '';
		roomId = '';
		assignEmployeeId = '';
		formError = '';
		fieldErrors = {};
		activeDateField = null;
		open = true;
		focusForm();
		void refreshCodePreview(form.typeId);
	}
	function edit(item: Asset, focusReturn: HTMLElement | null = null) {
		returnFocus = focusReturn ?? document.activeElement as HTMLElement;
		editing = item;
		form = { assetTag: item.assetTag, typeId: String(item.typeId), manufacturerId: item.manufacturerId ? String(item.manufacturerId) : '', modelNumber: item.modelNumber ?? '', serialNumber: item.serialNumber ?? '', cpuTypeId: item.cpuTypeId ? String(item.cpuTypeId) : '', ramGb: item.ramGb ? String(item.ramGb) : '', operatingSystemId: item.operatingSystemId ? String(item.operatingSystemId) : '', loginUsername: item.loginUsername ?? '', locationId: String(item.locationId), statusId: String(item.statusId), purchasedOn: iso(item.purchasedOn), disposalOn: iso(item.disposalOn), notes: item.notes ?? '' };
		branchId = String(item.location.room.branchId);
		roomId = String(item.location.room.id);
		previewRequestId++;
		codeLoading = false;
		assignEmployeeId = item.assignments[0] ? String(item.assignments[0].employee.id) : '';
		formError = '';
		fieldErrors = {};
		activeDateField = null;
		open = true;
		focusForm();
	}
	function showDetail(item: Asset, focusReturn: HTMLElement | null = null) {
		detailReturnFocus = focusReturn ?? document.activeElement as HTMLElement;
		detailAsset = item;
		void tick().then(() => detailDialogElement?.querySelector<HTMLElement>('.modal-close')?.focus());
		void loadChangeHistory(item.id);
	}
	function closeDetail() {
		detailAsset = null;
		historyRequestId++;
		changeHistory = [];
		void tick().then(() => detailReturnFocus?.focus());
	}
	async function loadChangeHistory(assetId: number) {
		const requestId = ++historyRequestId;
		historyLoading = true;
		historyError = false;
		changeHistory = [];
		try {
			const history = await allPages<ChangeHistory>(`it-assets/${assetId}/history`, 'desc');
			if (requestId === historyRequestId && detailAsset?.id === assetId) changeHistory = history;
		} catch { if (requestId === historyRequestId && detailAsset?.id === assetId) historyError = true; }
		finally { if (requestId === historyRequestId) historyLoading = false; }
	}
	async function refreshCodePreview(typeId: string) {
		const requestId = ++previewRequestId;
		form.assetTag = '';
		clearFieldError('assetTag');
		if (!typeId) { codeLoading = false; return; }
		codeLoading = true;
		try {
			const response = await fetch(`/v1/it-asset-code-previews?typeId=${encodeURIComponent(typeId)}`);
			if (requestId !== previewRequestId || !open) return;
			if (!response.ok) {
				const body = await response.json().catch(() => null) as { error?: { details?: { field?: string; reason?: string }[] } } | null;
				fieldErrors = { ...fieldErrors, assetTag: body?.error?.details?.find(item => item.field === 'assetTag')?.reason ?? 'Unable to prepare a management code.' };
				return;
			}
			form.assetTag = (await apiData<{ assetTag: string }>(response)).assetTag;
		} catch {
			if (requestId === previewRequestId) fieldErrors = { ...fieldErrors, assetTag: 'Unable to prepare a management code.' };
		} finally {
			if (requestId === previewRequestId) codeLoading = false;
		}
	}
	async function save() {
		if (saving || codeLoading) return;
		const errors: Record<string, string> = {};
		if (!form.assetTag.trim()) errors.assetTag = fieldErrors.assetTag ?? 'Management code is not ready.';
		if (!form.typeId) errors.typeId = 'Select a type.';
		if (!form.statusId) errors.statusId = 'Select a status.';
		if (!branchId) errors.branchId = 'Select a branch.';
		if (!roomId) errors.roomId = 'Select a room.';
		if (!form.locationId) errors.locationId = 'Select a storage location.';
		if (!form.purchasedOn) errors.purchasedOn = 'Select a purchase date.';
		if (selectedStatus?.disposalDatePolicy === 'required' && !form.disposalOn) errors.disposalOn = 'Select a disposal date.';
		if (Object.keys(errors).length) { showFieldErrors(errors); return; }
		saving = true;
		formError = '';
		fieldErrors = {};
		const hardwareAllowed = selectedType?.code !== 'UTM' && selectedType?.code !== 'UPS';
		const payload = { ...form, assigneeId: assignEmployeeId || null, cpuTypeId: hardwareAllowed && selectedType?.supportsCpu ? form.cpuTypeId : '', ramGb: hardwareAllowed && selectedType?.supportsRam ? form.ramGb : '', operatingSystemId: hardwareAllowed && selectedType?.supportsOs ? form.operatingSystemId : '', loginUsername: hardwareAllowed && selectedType?.supportsLoginUsername ? form.loginUsername : '', disposalOn: selectedStatus?.disposalDatePolicy === 'prohibited' ? '' : form.disposalOn };
		try {
			const response = await fetch(editing ? `/v1/it-assets/${editing.id}` : '/v1/it-assets', { method: editing ? 'PATCH' : 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
			if (!response.ok) {
				const body = await response.json().catch(() => null) as { error?: { code?: string; details?: { field?: string; reason?: string }[] } } | null;
				if ((body?.error?.code === 'VALIDATION_ERROR' || body?.error?.code === 'IT_ASSET_FIELD_CONFLICT') && body.error.details?.length) {
					const next: Record<string, string> = {};
					for (const detail of body.error.details) if (detail.field && detail.reason && !next[detail.field]) next[detail.field === 'assigneeId' ? 'assignEmployeeId' : detail.field] = detail.reason;
					if (Object.keys(next).length) { showFieldErrors(next); return; }
				}
				formError = 'Unable to save the IT asset. Check the information and try again.'; return;
			}
			const saved = await apiData<Asset>(response);
			const result = editing ? `IT asset ${saved.assetTag} updated.` : `IT asset ${saved.assetTag} created.`;
			closeForm();
			message = result;
			await assetList?.refresh();
		} catch {
			formError = 'Unable to save the IT asset. Try again.';
		} finally {
			saving = false;
		}
	}
	async function remove(item: Asset) {
		if (!confirm(`Delete ${item.assetTag}?`)) return;
		const response = await fetch(`/v1/it-assets/${item.id}`, { method: 'DELETE' });
		message = response.ok ? 'IT asset deleted.' : 'The IT asset could not be deleted.';
		if (response.ok) await assetList?.refresh();
	}
	function chooseDate(field: DateField, value: string) {
		form[field] = value;
		clearFieldError(field);
		activeDateField = null;
		void tick().then(() => dialogElement?.querySelector<HTMLButtonElement>(`.custom-date[data-field="${field}"] .date-trigger`)?.focus());
	}
	function clearFieldError(field: string) {
		if (!fieldErrors[field]) return;
		const next = { ...fieldErrors };
		delete next[field];
		fieldErrors = next;
		if (!Object.keys(next).length) formError = '';
	}
	function updateField(field: FormField, value: string) { form[field] = value; clearFieldError(field); }
	function focusField(field: string) {
		const target = dialogElement?.querySelector<HTMLElement>(`.form-select-picker[data-field="${field}"] .form-select-trigger, .form-select-picker[data-field="${field}"] .form-select-search, .custom-date[data-field="${field}"] .date-trigger, [name="${field}"]`);
		target?.scrollIntoView({ block: 'nearest' });
		target?.focus();
	}
	function showFieldErrors(errors: Record<string, string>) {
		fieldErrors = errors;
		formError = 'Correct the highlighted fields.';
		const field = Object.keys(errors)[0];
		void tick().then(() => focusField(field));
	}
	function selectedValue(field: SelectField) { return field === 'assignEmployeeId' ? assignEmployeeId : field === 'branchId' ? branchId : field === 'roomId' ? roomId : form[field]; }
	function chooseFormSelect(field: SelectField, value: string) {
		if (field === 'assignEmployeeId') assignEmployeeId = value;
		else if (field === 'branchId') {
			if (branchId !== value) { branchId = value; roomId = ''; form.locationId = ''; clearFieldError('roomId'); clearFieldError('locationId'); }
			clearFieldError('branchId');
		} else if (field === 'roomId') {
			if (roomId !== value) { roomId = value; form.locationId = ''; clearFieldError('locationId'); }
			clearFieldError('roomId');
		} else {
			updateField(field, value);
			if (field === 'statusId' && statuses.find((item) => String(item.id) === value)?.disposalDatePolicy === 'prohibited') { form.disposalOn = ''; clearFieldError('disposalOn'); }
			if (field === 'typeId') {
				if (editing && value === String(editing.typeId)) { previewRequestId++; codeLoading = false; form.assetTag = editing.assetTag; clearFieldError('assetTag'); }
				else void refreshCodePreview(value);
			}
		}
	}
	function trapDialogTab(event: KeyboardEvent, dialog: HTMLDialogElement | undefined) {
		const focusable = Array.from(dialog?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)') ?? []).filter((element) => element.tabIndex >= 0 && element.getClientRects().length > 0);
		const first = focusable[0];
		const last = focusable.at(-1);
		if (!first || !last) return;
		if (!dialog?.contains(document.activeElement)) { event.preventDefault(); (event.shiftKey ? last : first).focus(); return; }
		if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
		else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
	}
	function modalKeydown(event: KeyboardEvent) {
		if (event.defaultPrevented) return;
		if (detailAsset) {
			if (event.key === 'Escape') { event.preventDefault(); closeDetail(); }
			else if (event.key === 'Tab') trapDialogTab(event, detailDialogElement);
			return;
		}
		if (!open) return;
		if (event.key === 'Escape') { event.preventDefault(); if (activeDateField) { const field = activeDateField; activeDateField = null; void tick().then(() => focusField(field)); } else closeForm(); return; }
		if (event.key === 'Tab') trapDialogTab(event, dialogElement);
	}

	onMount(() => { void load(); });
</script>

<svelte:window onkeydown={modalKeydown} />

{#snippet dateInput(label: string, field: DateField, value: string, above = false, required = false, inactive = false)}
	<DatePicker {label} {field} {value} {above} {required} disabled={role === '' || inactive} error={fieldErrors[field] ?? ''} open={activeDateField === field} onToggle={() => activeDateField = activeDateField === field ? null : field} onSelect={(selected) => chooseDate(field, selected)} />
{/snippet}

{#snippet searchableSelect(label: string, field: SelectField, options: SelectOption[], required = false, inactive = false)}
	<SearchSelect {label} {field} value={selectedValue(field)} {options} {required} disabled={role === '' || inactive} error={fieldErrors[field] ?? ''} emptyText="No matching options." onOpen={() => activeDateField = null} onSelect={(value) => chooseFormSelect(field, value)} />
{/snippet}

{#snippet detailField(label: string, value: string | number | null | undefined)}
	<div><dt>{label}</dt><dd>{value ?? ''}</dd></div>
{/snippet}
{#snippet assetCodeCell(item: Asset)}<strong class="asset-primary">{item.assetTag}</strong><small class="asset-secondary">{item.serialNumber ?? ''}</small>{/snippet}
{#snippet manufacturerCell(item: Asset)}{item.manufacturer?.name ?? ''}<small class="asset-secondary">{item.modelNumber ?? ''}</small>{/snippet}
{#snippet statusCell(item: Asset)}<span class="status">{item.status.name}</span>{/snippet}

<AssetManagementShell title="IT Assets" active="IT Assets">
	<div class="heading">
		<div><p>ASSET INVENTORY</p><h1>IT Assets</h1><span>Track computers, servers, network appliances, power equipment and peripherals.</span></div>
		{#if role !== ''}<AddButton label="Add IT asset" onclick={create} />{/if}
	</div>
	{#if message}<p class="notice">{message}</p>{/if}
	<MasterList bind:this={assetList} endpoint="/v1/it-assets" searchParam="q" title="IT assets" listHeading="All IT assets" description="Find and manage assets across locations." initialSortBy="assetTag" pageSizeStorageKey="it-assets-page-size" minTableWidth={1080} actionWidth={4} edgePagination canDetail={true} canEdit={role !== ''} canDelete={role !== ''} actionLabel={(item) => (item as Asset).assetTag} loadingLabel="Loading IT assets…" emptyLabel="No matches found" columns={[
		{ key: 'assetTag', label: 'Management code', width: 15, cell: assetCodeCell },
		{ key: 'type', label: 'Type', width: 10, value: (item) => (item as Asset).type.name },
		{ key: 'manufacturer', label: 'Manufacturer / model', width: 17, cell: manufacturerCell },
		{ key: 'branch', label: 'Branch', width: 11, value: (item) => (item as Asset).location.room.branch.name },
		{ key: 'room', label: 'Room', width: 10, value: (item) => (item as Asset).location.room.name },
		{ key: 'storageLocation', label: 'Storage location', width: 12, value: (item) => (item as Asset).location.name },
		{ key: 'user', label: 'User', width: 12, value: (item) => (item as Asset).assignments[0] ? assigneeName((item as Asset).assignments[0]) : '' },
		{ key: 'status', label: 'Status', width: 9, cell: statusCell }
	]} onDetail={(item, trigger) => showDetail(item as Asset, trigger)} onEdit={(item, trigger) => edit(item as Asset, trigger)} onDelete={(item) => remove(item as Asset)} />
	{#if open}
		<div class="backdrop app-modal-backdrop" role="presentation">
			<dialog bind:this={dialogElement} class="asset-dialog app-modal" open aria-modal="true" aria-labelledby="asset-form-title">
				<header><h2 id="asset-form-title">{editing ? (role !== '' ? 'Edit IT asset' : 'IT asset details') : 'Add IT asset'}</h2><button class="modal-close app-modal-close" type="button" aria-label="Close IT asset form" onclick={closeForm}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg></button></header>
				<form class="asset-form app-modal-form" onsubmit={(event) => { event.preventDefault(); void save(); }}>
					<div class="asset-form-body app-modal-form-body">
						{#if formError}<div class="form-error-summary app-modal-error-summary wide" role="alert"><strong>Unable to save IT asset</strong><span>{formError}</span></div>{/if}
						<h3>Basic information</h3>
						{@render searchableSelect('Type', 'typeId', types.map(item => ({ value: String(item.id), label: item.name, searchTerms: [item.code ?? ''] })), true)}
						<label><span>Management code <span class="required" aria-hidden="true">*</span></span><input name="assetTag" value={form.assetTag} readonly class:invalid={Boolean(fieldErrors.assetTag)} aria-invalid={Boolean(fieldErrors.assetTag)} aria-describedby={fieldErrors.assetTag ? 'assetTag-error' : undefined} placeholder={codeLoading ? 'Preparing code…' : 'Select a type'} disabled={role === ''}/>{#if fieldErrors.assetTag}<span id="assetTag-error" class="field-error" role="alert">{fieldErrors.assetTag}</span>{/if}</label>
						{@render searchableSelect('Status', 'statusId', [{ value: '', label: '-' }, ...statuses.map(item => ({ value: String(item.id), label: item.name }))], true)}
						{@render searchableSelect('Manufacturer', 'manufacturerId', [{ value: '', label: '-' }, ...manufacturers.map(item => ({ value: String(item.id), label: item.name }))])}
						<label>Model number<input bind:value={form.modelNumber} placeholder="e.g. Latitude 7450" disabled={role === ''}/></label>
						<label>Serial number<input name="serialNumber" value={form.serialNumber} oninput={(event) => updateField('serialNumber', event.currentTarget.value)} class:invalid={Boolean(fieldErrors.serialNumber)} aria-invalid={Boolean(fieldErrors.serialNumber)} aria-describedby={fieldErrors.serialNumber ? 'serialNumber-error' : undefined} placeholder="e.g. ABC123456" disabled={role === ''}/>{#if fieldErrors.serialNumber}<span id="serialNumber-error" class="field-error" role="alert">{fieldErrors.serialNumber}</span>{/if}</label>
						{#if selectedType?.code !== 'UTM' && selectedType?.code !== 'UPS' && (selectedType?.supportsCpu || selectedType?.supportsRam || selectedType?.supportsOs || selectedType?.supportsLoginUsername)}
							<h3>Hardware and software</h3>
							{#if selectedType?.supportsCpu}{@render searchableSelect('CPU type', 'cpuTypeId', [{ value: '', label: '-' }, ...cpus.map(item => ({ value: String(item.id), label: item.displayName ?? item.name }))])}{/if}
							{#if selectedType?.supportsRam}<label>RAM (GB)<input name="ramGb" value={form.ramGb} oninput={(event) => updateField('ramGb', event.currentTarget.value)} class:invalid={Boolean(fieldErrors.ramGb)} aria-invalid={Boolean(fieldErrors.ramGb)} aria-describedby={fieldErrors.ramGb ? 'ramGb-error' : undefined} type="number" placeholder="e.g. 16" disabled={role === ''}/>{#if fieldErrors.ramGb}<span id="ramGb-error" class="field-error" role="alert">{fieldErrors.ramGb}</span>{/if}</label>{/if}
							{#if selectedType?.supportsOs}{@render searchableSelect('Operating system', 'operatingSystemId', [{ value: '', label: '-' }, ...systems.map(item => ({ value: String(item.id), label: item.displayName ?? item.name }))])}{/if}
							{#if selectedType?.supportsLoginUsername}<label>Login username<input bind:value={form.loginUsername} autocomplete="off" placeholder="e.g. j.smith" disabled={role === ''}/></label>{/if}
						{/if}
						<h3>Location and lifecycle</h3>
						{@render searchableSelect('Branch', 'branchId', [{ value: '', label: '-' }, ...branches.map(item => ({ value: String(item.id), label: item.name }))], true)}
						{@render searchableSelect('Room', 'roomId', [{ value: '', label: '-' }, ...availableRooms.map(item => ({ value: String(item.id), label: item.name }))], true, !branchId)}
						{@render searchableSelect('Storage location', 'locationId', [{ value: '', label: '-' }, ...availableLocations.map(item => ({ value: String(item.id), label: item.name }))], true, !roomId)}
						{@render dateInput('Purchase date', 'purchasedOn', form.purchasedOn, false, true)}
						{@render dateInput('Disposal date', 'disposalOn', form.disposalOn, true, selectedStatus?.disposalDatePolicy === 'required', selectedStatus?.disposalDatePolicy === 'prohibited')}
						<label class="wide">Notes<textarea bind:value={form.notes} placeholder="e.g. Asset details or maintenance notes" disabled={role === ''}></textarea></label>
						<h3>Assign to employee</h3>
						{@render searchableSelect('Employee', 'assignEmployeeId', [{ value: '', label: 'Unassigned' }, ...employees.map(employee => ({ value: String(employee.id), label: employeeName(employee), searchTerms: [employee.firstName, employee.middleName ?? '', employee.lastName] }))])}
					</div>
					<footer class="asset-form-footer app-modal-footer"><button class="secondary" type="button" disabled={saving} onclick={closeForm}>{role !== '' ? 'Cancel' : 'Close'}</button>{#if role !== ''}<button class="app-primary-action save-button" type="submit" disabled={saving || codeLoading}>{saving ? 'Saving…' : editing ? 'Save changes' : 'Add IT asset'}</button>{/if}</footer>
				</form>
			</dialog>
		</div>
	{/if}
	{#if detailAsset}
		<div class="backdrop app-modal-backdrop" role="presentation">
			<dialog bind:this={detailDialogElement} class="asset-dialog app-modal" open aria-modal="true" aria-labelledby="asset-detail-title">
				<header><h2 id="asset-detail-title">IT asset detail</h2><button class="modal-close app-modal-close" type="button" aria-label="Close IT asset detail" onclick={closeDetail}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg></button></header>
				<div class="asset-detail-body">
					<section class="detail-section"><h3>Basic information</h3><dl class="detail-grid">
						{@render detailField('Management code', detailAsset.assetTag)}
						{@render detailField('Type', detailAsset.type.name)}
						{@render detailField('Status', detailAsset.status.name)}
						{@render detailField('Manufacturer', detailAsset.manufacturer?.name)}
						{@render detailField('Model number', detailAsset.modelNumber)}
						{@render detailField('Serial number', detailAsset.serialNumber)}
					</dl></section>
					{#if detailAsset.type.code !== 'UTM' && detailAsset.type.code !== 'UPS' && (detailAsset.type.supportsCpu || detailAsset.type.supportsRam || detailAsset.type.supportsOs || detailAsset.type.supportsLoginUsername)}
						<section class="detail-section"><h3>Hardware and software</h3><dl class="detail-grid">
							{#if detailAsset.type.supportsCpu}{@render detailField('CPU type', detailAsset.cpuType?.displayName ?? detailAsset.cpuType?.name)}{/if}
							{#if detailAsset.type.supportsRam}{@render detailField('RAM (GB)', detailAsset.ramGb)}{/if}
							{#if detailAsset.type.supportsOs}{@render detailField('Operating system', detailAsset.operatingSystem?.displayName ?? detailAsset.operatingSystem?.name)}{/if}
							{#if detailAsset.type.supportsLoginUsername}{@render detailField('Login username', detailAsset.loginUsername)}{/if}
						</dl></section>
					{/if}
					<section class="detail-section"><h3>Location and lifecycle</h3><dl class="detail-grid">
						{@render detailField('Branch', detailAsset.location.room.branch.name)}
						{@render detailField('Room', detailAsset.location.room.name)}
						{@render detailField('Storage location', detailAsset.location.name)}
						{@render detailField('Purchase date', iso(detailAsset.purchasedOn))}
						{@render detailField('Disposal date', iso(detailAsset.disposalOn))}
						{@render detailField('Employee', detailAsset.assignments[0] ? assigneeName(detailAsset.assignments[0]) : '')}
						{@render detailField('Notes', detailAsset.notes)}
					</dl></section>
					<section class="detail-section"><h3>Change history</h3><div class="history" aria-label="Change history">
						{#if historyLoading}<p>Loading change history…</p>
						{:else if historyError}<p role="alert">Unable to load change history.</p>
						{:else if changeHistory.length === 0}<p>No changes recorded yet.</p>
						{:else}{#each changeHistory as entry}<article class="history-event"><div class="history-event-heading"><strong>{historyActions[entry.action] ?? entry.action}</strong><span>{new Date(entry.changedAt).toLocaleString()}</span><span>by {entry.actorName}</span></div>
							{#if entry.changes.length}<table><thead><tr><th>Field</th><th>Before</th><th>After</th></tr></thead><tbody>{#each entry.changes as change}<tr><th scope="row">{historyFields[change.field] ?? change.field}</th><td>{change.before ?? '-'}</td><td>{change.after ?? '-'}</td></tr>{/each}</tbody></table>{/if}
						</article>{/each}{/if}
					</div></section>
				</div>
				<footer class="asset-form-footer app-modal-footer"><button class="secondary" type="button" onclick={closeDetail}>Close</button></footer>
			</dialog>
		</div>
	{/if}
</AssetManagementShell>

<style>
	.heading{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;margin-bottom:24px}
	.heading p{margin:0;color:#1abb9c;font-size:11px;font-weight:700;letter-spacing:.08em}.heading h1{margin:4px 0;font-size:30px}.heading span{color:var(--muted)}
	.notice{color:var(--muted);font-size:12px}.asset-primary{display:block;color:var(--text);font-weight:600}.asset-secondary{display:block;color:var(--muted);font-size:11px}.status{display:inline-block;padding:3px 7px;border-radius:10px;background:#1abb9c1c;color:#169f85;font-size:11px}
	.asset-detail-body{display:grid;flex:1;min-height:0;align-content:start;gap:16px;overflow-y:auto;padding:16px 24px 24px;background:var(--bg)}
	.detail-section{min-width:0;padding:16px;background:var(--surface);border:1px solid var(--border);border-radius:5px}.detail-section h3{margin:0 0 14px;color:var(--text);font-size:14px}.detail-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;margin:0}.detail-grid>div{min-width:0}.detail-grid dt{color:var(--muted);font-size:11px;font-weight:600}.detail-grid dd{margin:4px 0 0;color:var(--text);font-size:13px;overflow-wrap:anywhere;white-space:pre-wrap}
	.wide{grid-column:1/-1}
	.history{overflow-x:auto;background:var(--surface);border:1px solid var(--border);border-radius:5px}.history p{margin:0;padding:12px;color:var(--muted);font-size:12px}.history table{width:100%;min-width:420px;font-size:12px}.history th,.history td{position:static;padding:8px 12px}
	.history-event{padding:12px;border-bottom:1px solid var(--border)}.history-event:last-child{border-bottom:0}.history-event-heading{display:flex;flex-wrap:wrap;gap:6px 14px;align-items:center;font-size:12px;margin-bottom:8px}.history-event-heading span{color:var(--muted)}.history-event table{border-collapse:collapse}.history-event th,.history-event td{text-align:left;vertical-align:top;border-top:1px solid var(--border);overflow-wrap:anywhere}.history-event th{font-weight:600}
	@media(max-width:700px){.heading{align-items:stretch;flex-direction:column}.asset-detail-body{grid-template-columns:1fr;padding:16px}.detail-grid{grid-template-columns:1fr 1fr}}
	@media(max-width:450px){.detail-grid{grid-template-columns:1fr}}
</style>
