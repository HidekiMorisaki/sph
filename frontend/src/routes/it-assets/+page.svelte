<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { apiData } from '$lib/api';
	import AssetManagementShell from '$lib/components/AssetManagementShell.svelte';

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
	type SearchableSelectField = 'typeId' | 'manufacturerId' | 'operatingSystemId' | 'assignEmployeeId';
	type ChangeDetail = { field: string; before: string | null; after: string | null };
	type ChangeHistory = { id: number; changedAt: string; actorName: string; action: string; changes: ChangeDetail[] };
	const historyFields: Record<string, string> = { assetTag: 'Management code', typeId: 'Type', manufacturerId: 'Manufacturer', modelNumber: 'Model number', serialNumber: 'Serial number', cpuTypeId: 'CPU type', ramGb: 'RAM (GB)', operatingSystemId: 'Operating system', loginUsername: 'Login username', locationId: 'Storage location', statusId: 'Status', purchasedOn: 'Purchase date', disposalOn: 'Disposal date', notes: 'Notes', assigneeId: 'Employee' };
	const historyActions: Record<string, string> = { create: 'Created', update: 'Updated', delete: 'Deleted', assign: 'Assigned', return: 'Returned' };
	type FormField = keyof ReturnType<typeof blank>;
	type CalendarDay = { day: number; iso: string; inMonth: boolean };
	type SortKey = 'assetTag' | 'type' | 'manufacturer' | 'branch' | 'room' | 'storageLocation' | 'user' | 'status';
	type SortOrder = 'asc' | 'desc';
	type ListPayload = { data: Asset[]; meta: { total: number } };
	const pageSizeOptions = [10, 20, 30, 40, 50] as const;
	const pageSizeStorageKey = 'it-assets-page-size';

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
	const dateIso = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
	const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
	const weekDays = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
	const employeeName = (employee: Assignee) => [employee.firstName, employee.middleName, employee.lastName].filter(Boolean).join(' ');
	const assigneeName = (assignment: Assignment | undefined) => assignment ? employeeName(assignment.employee) : 'Unassigned';
	const now = new Date();

	let items = $state<Asset[]>([]);
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
	let activeSelectField = $state<SelectField | null>(null);
	let selectAbove = $state(false);
	let selectSearch = $state<Record<SearchableSelectField, string>>({ typeId: '', manufacturerId: '', operatingSystemId: '', assignEmployeeId: '' });
	let search = $state('');
	let page = $state(1);
	let pageSize = $state(10);
	let total = $state(0);
	let loading = $state(false);
	let listError = $state(false);
	let sortBy = $state<SortKey>('assetTag');
	let sortOrder = $state<SortOrder>('asc');
	let pageSizeOpen = $state(false);
	let actionAsset = $state<Asset | null>(null);
	let menuTop = $state(0);
	let menuLeft = $state(0);
	let menuTrigger: HTMLButtonElement | null = null;
	let pageSizeTrigger: HTMLButtonElement | null = null;
	let searchTimer: number | undefined;
	let listController: AbortController | null = null;
	let assignEmployeeId = $state('');
	let dialogElement = $state<HTMLDialogElement>();
	let returnFocus: HTMLElement | null = null;
	let activeDateField = $state<DateField | null>(null);
	let calendarYear = $state(now.getFullYear());
	let calendarMonth = $state(now.getMonth());

	const selectedType = $derived(types.find((item) => String(item.id) === form.typeId));
	const selectedStatus = $derived(statuses.find((item) => String(item.id) === form.statusId));
	const availableRooms = $derived(rooms.filter((item) => String(item.branchId) === branchId));
	const availableLocations = $derived(locations.filter((item) => String(item.roomId) === roomId && String(item.room.branchId) === branchId));
	const pageCount = $derived(Math.max(1, Math.ceil(total / pageSize)));
	const firstVisible = $derived(total === 0 ? 0 : (page - 1) * pageSize + 1);
	const lastVisible = $derived(Math.min(page * pageSize, total));

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
		await loadAssets();
	}
	async function loadAssets() {
		listController?.abort();
		const controller = new AbortController(); listController = controller; loading = true; listError = false; items = []; closeMenu();
		const params = new URLSearchParams({ offset: String((page - 1) * pageSize), limit: String(pageSize), sortBy, sortOrder });
		if (search.trim()) params.set('q', search.trim());
		try {
			const response = await fetch(`/v1/it-assets?${params}`, { signal: controller.signal });
			if (!response.ok) throw new Error('Unable to load IT assets.');
			const payload = await response.json() as ListPayload;
			if (listController !== controller) return;
			items = payload.data; total = payload.meta.total;
			const maximumPage = Math.max(1, Math.ceil(total / pageSize));
			if (page > maximumPage) { page = maximumPage; await loadAssets(); }
		} catch (error) {
			if (listController === controller && !(error instanceof DOMException && error.name === 'AbortError')) { listError = true; items = []; total = 0; }
		} finally { if (listController === controller) loading = false; }
	}
	function changeSort(field: SortKey) { window.clearTimeout(searchTimer); if (sortBy === field) sortOrder = sortOrder === 'asc' ? 'desc' : 'asc'; else { sortBy = field; sortOrder = 'asc'; } page = 1; void loadAssets(); }
	function searchChanged() { page = 1; window.clearTimeout(searchTimer); searchTimer = window.setTimeout(() => void loadAssets(), 350); }
	function choosePageSize(size: number) { pageSize = size; pageSizeOpen = false; localStorage.setItem(pageSizeStorageKey, String(size)); page = 1; pageSizeTrigger?.focus(); void loadAssets(); }
	function focusPageSizeOption(index: number) { pageSizeOpen = true; void tick().then(() => document.querySelectorAll<HTMLButtonElement>('.page-size-options button')[index]?.focus()); }
	function pageSizeTriggerKeydown(event: KeyboardEvent) { if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return; event.preventDefault(); const index = pageSizeOptions.indexOf(pageSize as typeof pageSizeOptions[number]); focusPageSizeOption(event.key === 'ArrowDown' ? Math.min(index + 1, pageSizeOptions.length - 1) : Math.max(index - 1, 0)); }
	function pageSizeOptionKeydown(event: KeyboardEvent, index: number) { if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Home' || event.key === 'End') { event.preventDefault(); focusPageSizeOption(event.key === 'Home' ? 0 : event.key === 'End' ? pageSizeOptions.length - 1 : event.key === 'ArrowDown' ? Math.min(index + 1, pageSizeOptions.length - 1) : Math.max(index - 1, 0)); } }
	function goToPage(target: number) { if (target < 1 || target > pageCount || target === page) return; page = target; void loadAssets(); }
	function paginationItems(): Array<number | 'ellipsis'> { if (pageCount <= 7) return Array.from({ length: pageCount }, (_, index) => index + 1); const values: Array<number | 'ellipsis'> = [1]; if (page > 4) values.push('ellipsis'); for (let value = Math.max(2, page - 1); value <= Math.min(pageCount - 1, page + 1); value++) values.push(value); if (page < pageCount - 3) values.push('ellipsis'); values.push(pageCount); return values; }
	function toggleMenu(event: MouseEvent, item: Asset) { event.stopPropagation(); pageSizeOpen = false; if (actionAsset?.id === item.id) { closeMenu(); return; } menuTrigger = event.currentTarget as HTMLButtonElement; const rect = menuTrigger.getBoundingClientRect(); const width = 160; const height = role === '' ? 44 : 120; menuLeft = Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8)); menuTop = rect.bottom + height + 6 > window.innerHeight - 8 ? rect.top - height - 6 : rect.bottom + 6; actionAsset = item; void tick().then(() => document.querySelector<HTMLButtonElement>('.menu-popover button')?.focus({ preventScroll: true })); }
	function closeMenu() { actionAsset = null; menuTrigger = null; }
	function closePopovers() { closeMenu(); pageSizeOpen = false; }
	function windowKeydown(event: KeyboardEvent) { if (event.key !== 'Escape' || open || detailAsset) return; if (actionAsset) { const trigger = menuTrigger; closeMenu(); trigger?.focus(); } else if (pageSizeOpen) { pageSizeOpen = false; pageSizeTrigger?.focus(); } }

	function focusForm() {
		void tick().then(() => {
			if (open) (dialogElement?.querySelector<HTMLElement>('form .form-select-trigger:not(:disabled), form input:not(:disabled), form textarea:not(:disabled)') ?? dialogElement?.querySelector<HTMLElement>('.modal-close'))?.focus();
		});
	}
	function closeForm() {
		open = false;
		formError = '';
		fieldErrors = {};
		activeSelectField = null;
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
		selectSearch = { typeId: '', manufacturerId: '', operatingSystemId: '', assignEmployeeId: '' };
		formError = '';
		fieldErrors = {};
		activeSelectField = null;
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
		selectSearch = { typeId: '', manufacturerId: '', operatingSystemId: '', assignEmployeeId: '' };
		formError = '';
		fieldErrors = {};
		activeSelectField = null;
		activeDateField = null;
		open = true;
		focusForm();
	}
	function showDetail(item: Asset) {
		detailReturnFocus = menuTrigger ?? document.activeElement as HTMLElement;
		closeMenu();
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
			await load();
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
		if (response.ok) await load();
	}
	function calendarDays(year: number, month: number): CalendarDay[] {
		const start = new Date(year, month, 1 - new Date(year, month, 1).getDay());
		return Array.from({ length: 42 }, (_, index) => {
			const date = new Date(start);
			date.setDate(start.getDate() + index);
			return { day: date.getDate(), iso: dateIso(date), inMonth: date.getMonth() === month };
		});
	}
	function openCalendar(field: DateField, value: string) {
		if (activeDateField === field) { activeDateField = null; return; }
		const date = value ? new Date(`${value}T00:00:00`) : new Date();
		calendarYear = date.getFullYear();
		calendarMonth = date.getMonth();
		activeDateField = field;
	}
	function moveMonth(offset: number) {
		const date = new Date(calendarYear, calendarMonth + offset, 1);
		calendarYear = date.getFullYear();
		calendarMonth = date.getMonth();
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
	function openFormSelect(trigger: HTMLElement, field: SelectField, count: number) {
		const body = trigger.closest('.asset-form-body');
		const bounds = body?.getBoundingClientRect();
		const rect = trigger.getBoundingClientRect();
		const below = (bounds?.bottom ?? window.innerHeight) - rect.bottom;
		selectAbove = below < Math.min(count * 28 + 8, 200) + 4 && rect.top - (bounds?.top ?? 0) > below;
		activeDateField = null;
		activeSelectField = field;
	}
	function toggleFormSelect(event: MouseEvent, field: SelectField, count: number) {
		if (activeSelectField === field) { activeSelectField = null; return; }
		openFormSelect(event.currentTarget as HTMLButtonElement, field, count);
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
		activeSelectField = null;
		void tick().then(() => focusField(field));
	}
	function searchOptions(options: SelectOption[], field: SearchableSelectField) {
		const query = selectSearch[field].trim().toLocaleLowerCase();
		return query ? options.filter(option => [option.label, ...(option.searchTerms ?? [])].some(term => term.toLocaleLowerCase().includes(query))) : options;
	}
	function searchSelectValue(field: SearchableSelectField, options: SelectOption[]) {
		return activeSelectField === field ? selectSearch[field] : options.find(option => option.value === selectedValue(field))?.label ?? '';
	}
	function openSearchSelect(event: MouseEvent | KeyboardEvent, field: SearchableSelectField, count: number) {
		if (activeSelectField === field) return;
		selectSearch[field] = '';
		openFormSelect(event.currentTarget as HTMLInputElement, field, count);
	}
	function updateSearchSelect(event: Event, field: SearchableSelectField, count: number) {
		selectSearch[field] = (event.currentTarget as HTMLInputElement).value;
		if (activeSelectField !== field) openFormSelect(event.currentTarget as HTMLInputElement, field, count);
	}
	function chooseSearchSelect(field: SearchableSelectField, value: string) { chooseFormSelect(field, value); selectSearch[field] = ''; }
	function searchSelectKeydown(event: KeyboardEvent, field: SearchableSelectField, filtered: SelectOption[], allOptions: SelectOption[]) {
		if (event.key === 'Enter') {
			event.preventDefault();
			if (activeSelectField !== field) openSearchSelect(event, field, allOptions.length);
			else if (filtered.length === 1) chooseSearchSelect(field, filtered[0].value);
			else if (filtered.length > 1) {
				const selected = filtered.findIndex((option) => option.value === selectedValue(field));
				focusFormSelectOption(field, Math.max(0, selected));
			}
			return;
		}
		if (activeSelectField !== field && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) selectSearch[field] = '';
		formSelectTriggerKeydown(event, field, activeSelectField === field ? filtered : allOptions);
	}
	function focusFormSelectOption(field: SelectField, index: number) {
		void tick().then(() => dialogElement?.querySelectorAll<HTMLButtonElement>(`.form-select-picker[data-field="${field}"] .form-select-options button`)[index]?.focus());
	}
	function formSelectTriggerKeydown(event: KeyboardEvent, field: SelectField, options: SelectOption[]) {
		if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp' && event.key !== 'Home' && event.key !== 'End') return;
		event.preventDefault();
		if (activeSelectField !== field) openFormSelect(event.currentTarget as HTMLButtonElement, field, options.length);
		const selected = options.findIndex(option => option.value === selectedValue(field));
		const index = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : event.key === 'ArrowDown' ? Math.min(selected + 1, options.length - 1) : Math.max(selected - 1, 0);
		focusFormSelectOption(field, index);
	}
	function formSelectOptionKeydown(event: KeyboardEvent, field: SelectField, index: number, count: number) {
		if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Home' || event.key === 'End') {
			event.preventDefault();
			focusFormSelectOption(field, event.key === 'Home' ? 0 : event.key === 'End' ? count - 1 : event.key === 'ArrowDown' ? Math.min(index + 1, count - 1) : Math.max(index - 1, 0));
		}
	}
	function formSelectFocusout(event: FocusEvent, field: SelectField) {
		const next = event.relatedTarget;
		if (activeSelectField === field && !(next instanceof Node && (event.currentTarget as HTMLElement).contains(next))) activeSelectField = null;
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
		if (detailAsset) {
			if (event.key === 'Escape') { event.preventDefault(); closeDetail(); }
			else if (event.key === 'Tab') trapDialogTab(event, detailDialogElement);
			return;
		}
		if (!open) return;
		if (event.key === 'Escape') { event.preventDefault(); if (activeSelectField) { const field = activeSelectField; activeSelectField = null; void tick().then(() => focusField(field)); } else if (activeDateField) activeDateField = null; else closeForm(); return; }
		if (event.key === 'Tab') trapDialogTab(event, dialogElement);
	}

	onMount(() => { const saved = Number(localStorage.getItem(pageSizeStorageKey)); if (pageSizeOptions.includes(saved as typeof pageSizeOptions[number])) pageSize = saved; void load(); return () => { window.clearTimeout(searchTimer); listController?.abort(); }; });
</script>

<svelte:window onclick={closePopovers} onkeydown={(event) => { modalKeydown(event); windowKeydown(event); }} onscroll={closePopovers} onresize={closePopovers} />

{#snippet sortIndicator(field: SortKey)}<span class="sort-indicator" class:ascending={sortBy === field && sortOrder === 'asc'} class:descending={sortBy === field && sortOrder === 'desc'} aria-hidden="true"></span>{/snippet}

{#snippet dateInput(label: string, field: DateField, value: string, above = false, required = false, inactive = false)}
	<div class="custom-date" class:above data-field={field}><span>{label}{#if required} <span class="required" aria-hidden="true">*</span>{/if}</span><button class="date-trigger" class:invalid={Boolean(fieldErrors[field])} type="button" role="combobox" disabled={role === '' || inactive} aria-label={`${label}${required ? ' (required)' : ''}: ${value || 'yyyy-mm-dd'}`} aria-invalid={Boolean(fieldErrors[field])} aria-describedby={fieldErrors[field] ? `${field}-error` : undefined} aria-controls={`${field}-calendar`} aria-haspopup="dialog" aria-expanded={activeDateField === field} onclick={() => openCalendar(field, value)}><span class:placeholder={!value}>{value || 'yyyy-mm-dd'}</span><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="2" /><path d="M8 3v4M16 3v4M3.5 10h17" /></svg></button>
		{#if activeDateField === field}<div id={`${field}-calendar`} class="calendar-panel" role="dialog" aria-label={`${label} calendar`}><div class="calendar-head"><button type="button" aria-label="Previous month" onclick={() => moveMonth(-1)}>‹</button><strong>{monthNames[calendarMonth]} {calendarYear}</strong><button type="button" aria-label="Next month" onclick={() => moveMonth(1)}>›</button></div><div class="weekdays">{#each weekDays as day}<span>{day}</span>{/each}</div><div class="calendar-grid">{#each calendarDays(calendarYear, calendarMonth) as date}<button type="button" class:outside={!date.inMonth} class:today={date.iso === dateIso(now)} class:selected={date.iso === value} aria-label={date.iso} aria-pressed={date.iso === value} onclick={() => chooseDate(field, date.iso)}>{date.day}</button>{/each}</div><div class="calendar-actions">{#if !required}<button type="button" onclick={() => chooseDate(field, '')}>Clear</button>{/if}<button type="button" onclick={() => chooseDate(field, dateIso(new Date()))}>Today</button></div></div>{/if}
		{#if fieldErrors[field]}<span id={`${field}-error`} class="field-error" role="alert">{fieldErrors[field]}</span>{/if}
	</div>
{/snippet}

{#snippet searchableSelect(label: string, field: SearchableSelectField, options: SelectOption[], required = false)}
	{@const filtered = searchOptions(options, field)}
	<div class="form-select-field"><span>{label}{#if required} <span class="required" aria-hidden="true">*</span>{/if}</span><div class="form-select-picker searchable-select" class:above={activeSelectField === field && selectAbove} data-field={field} onfocusout={(event) => formSelectFocusout(event, field)}>
		<input class="form-select-search" class:unselected={!selectedValue(field) && activeSelectField !== field && options.some((option) => option.value === '' && option.label === '-')} class:invalid={Boolean(fieldErrors[field])} type="text" role="combobox" autocomplete="off" disabled={role === ''} value={searchSelectValue(field, options)} placeholder="Type to filter..." aria-label={`${label}${required ? ' (required)' : ''}`} aria-required={required} aria-invalid={Boolean(fieldErrors[field])} aria-describedby={fieldErrors[field] ? `${field}-error` : undefined} aria-controls={`${field}-options`} aria-haspopup="listbox" aria-expanded={activeSelectField === field} onfocus={(event) => event.currentTarget.select()} onclick={(event) => openSearchSelect(event, field, options.length)} oninput={(event) => updateSearchSelect(event, field, options.length)} onkeydown={(event) => searchSelectKeydown(event, field, filtered, options)} />
		<svg class="search-chevron" viewBox="0 0 10 6" aria-hidden="true"><path d="M1 1l4 4 4-4" /></svg>
		{#if activeSelectField === field}<div id={`${field}-options`} class="form-select-options" role="listbox" aria-label={label}>{#each filtered as option, index}<button type="button" role="option" tabindex="-1" aria-selected={selectedValue(field) === option.value} class:selected={selectedValue(field) === option.value} onpointerdown={(event) => event.preventDefault()} onclick={() => chooseSearchSelect(field, option.value)} onkeydown={(event) => formSelectOptionKeydown(event, field, index, filtered.length)}>{option.label}</button>{:else}<p class="form-select-empty">No matching options.</p>{/each}</div>{/if}
	</div>{#if fieldErrors[field]}<span id={`${field}-error`} class="field-error" role="alert">{fieldErrors[field]}</span>{/if}</div>
{/snippet}

{#snippet formSelect(label: string, field: SelectField, options: SelectOption[], required = false, wide = false, inactive = false)}
	<div class="form-select-field" class:wide><span>{label}{#if required} <span class="required" aria-hidden="true">*</span>{/if}</span><div class="form-select-picker" class:above={activeSelectField === field && selectAbove} data-field={field} onfocusout={(event) => formSelectFocusout(event, field)}>
		<button class="form-select-trigger" class:unselected={!selectedValue(field)} class:invalid={Boolean(fieldErrors[field])} type="button" role="combobox" disabled={role === '' || inactive} aria-label={`${label}${required ? ' (required)' : ''}`} aria-invalid={Boolean(fieldErrors[field])} aria-describedby={fieldErrors[field] ? `${field}-error` : undefined} aria-controls={`${field}-options`} aria-haspopup="listbox" aria-expanded={activeSelectField === field} onclick={(event) => toggleFormSelect(event, field, options.length)} onkeydown={(event) => formSelectTriggerKeydown(event, field, options)}><span>{options.find(option => option.value === selectedValue(field))?.label ?? '-'}</span><svg viewBox="0 0 10 6" aria-hidden="true"><path d="M1 1l4 4 4-4" /></svg></button>
		{#if activeSelectField === field}<div id={`${field}-options`} class="form-select-options" role="listbox" aria-label={label}>{#each options as option, index}<button type="button" role="option" tabindex="-1" aria-selected={selectedValue(field) === option.value} class:selected={selectedValue(field) === option.value} onclick={() => chooseFormSelect(field, option.value)} onkeydown={(event) => formSelectOptionKeydown(event, field, index, options.length)}>{option.label}</button>{/each}</div>{/if}
	</div>{#if fieldErrors[field]}<span id={`${field}-error`} class="field-error" role="alert">{fieldErrors[field]}</span>{/if}</div>
{/snippet}

{#snippet detailField(label: string, value: string | number | null | undefined)}
	<div><dt>{label}</dt><dd>{value ?? ''}</dd></div>
{/snippet}

<AssetManagementShell title="IT Assets" active="IT Assets">
	<div class="heading">
		<div><p>ASSET INVENTORY</p><h1>IT Assets</h1><span>Track computers, servers, network appliances, power equipment and peripherals.</span></div>
		{#if role !== ''}<button class="primary add-button" type="button" onclick={create}><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M4 8h8M8 4v8" /></svg>Add IT asset</button>{/if}
	</div>
	{#if message}<p class="notice">{message}</p>{/if}
	<section class="list-card">
		<header class="card-header"><div><h2>All IT assets</h2><p>Find and manage assets across locations.</p></div></header>
		<div class="table-toolbar"><label class="search-box"><span class="sr-only">Search IT assets</span><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="7" cy="7" r="5" /><path d="M11 11l3.5 3.5" /></svg><input bind:value={search} type="search" placeholder="Search..." oninput={searchChanged} /></label><div class="page-size">Show <div class="page-size-picker"><button bind:this={pageSizeTrigger} class="page-size-trigger" type="button" aria-haspopup="listbox" aria-expanded={pageSizeOpen} onclick={(event) => { event.stopPropagation(); closeMenu(); pageSizeOpen = !pageSizeOpen; }} onkeydown={pageSizeTriggerKeydown}><span>{pageSize}</span><svg viewBox="0 0 10 6" aria-hidden="true"><path d="M1 1l4 4 4-4" /></svg></button>{#if pageSizeOpen}<div class="page-size-options" role="listbox" aria-label="Entries per page">{#each pageSizeOptions as size, index}<button type="button" role="option" aria-selected={pageSize === size} class:selected={pageSize === size} onclick={() => choosePageSize(size)} onkeydown={(event) => pageSizeOptionKeydown(event, index)}>{size}</button>{/each}</div>{/if}</div> entries</div></div>
		<div class="table-responsive" onscroll={closeMenu}><table><colgroup><col class="code-column"/><col class="type-column"/><col class="maker-column"/><col class="branch-column"/><col class="room-column"/><col class="location-column"/><col class="user-column"/><col class="status-column"/><col class="actions-width-column"/></colgroup><thead><tr>
			{#each [{ key: 'assetTag', label: 'Management code' }, { key: 'type', label: 'Type' }, { key: 'manufacturer', label: 'Manufacturer / model' }, { key: 'branch', label: 'Branch' }, { key: 'room', label: 'Room' }, { key: 'storageLocation', label: 'Storage location' }, { key: 'user', label: 'User' }, { key: 'status', label: 'Status' }] as column}<th aria-sort={sortBy === column.key ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none'}><button class="sort-button" type="button" onclick={() => changeSort(column.key as SortKey)}>{column.label} {@render sortIndicator(column.key as SortKey)}</button></th>{/each}<th class="actions-column"><span class="sr-only">Actions</span></th>
		</tr></thead><tbody>{#if loading && items.length === 0}<tr><td colspan="9" class="empty">Loading IT assets…</td></tr>{:else if listError}<tr><td colspan="9" class="empty">Unable to load IT assets.</td></tr>{:else if items.length === 0}<tr><td colspan="9" class="empty">No matches found</td></tr>{:else}{#each items as item (item.id)}<tr><td><strong>{item.assetTag}</strong><small>{item.serialNumber ?? ''}</small></td><td>{item.type.name}</td><td>{item.manufacturer?.name ?? ''}<small>{item.modelNumber ?? ''}</small></td><td>{item.location.room.branch.name}</td><td>{item.location.room.name}</td><td>{item.location.name}</td><td>{item.assignments[0] ? assigneeName(item.assignments[0]) : ''}</td><td><span class="status">{item.status.name}</span></td><td class="actions-cell"><button class="kebab-button" type="button" aria-label={`Actions for ${item.assetTag}`} aria-haspopup="menu" aria-expanded={actionAsset?.id === item.id} onclick={(event) => toggleMenu(event, item)}><svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><circle cx="3" cy="8" r="1.4"/><circle cx="8" cy="8" r="1.4"/><circle cx="13" cy="8" r="1.4"/></svg></button></td></tr>{/each}{/if}</tbody></table></div>
		<footer class="table-footer"><p>Showing {firstVisible}-{lastVisible} of {total}</p><nav class="pagination" aria-label="IT asset table pages"><button type="button" disabled={page === 1} aria-label="First page" onclick={() => goToPage(1)}>&lt;&lt;</button><button type="button" disabled={page === 1} aria-label="Previous page" onclick={() => goToPage(page - 1)}>&lt;</button>{#each paginationItems() as value}{#if value === 'ellipsis'}<span>…</span>{:else}<button type="button" class:current={value === page} aria-current={value === page ? 'page' : undefined} onclick={() => goToPage(value)}>{value}</button>{/if}{/each}<button type="button" disabled={page === pageCount} aria-label="Next page" onclick={() => goToPage(page + 1)}>&gt;</button><button type="button" disabled={page === pageCount} aria-label="Last page" onclick={() => goToPage(pageCount)}>&gt;&gt;</button></nav></footer>
	</section>
	{#if actionAsset}<div class="menu-popover" role="menu" style:top={`${menuTop}px`} style:left={`${menuLeft}px`}><button type="button" role="menuitem" onclick={() => showDetail(actionAsset!)}>Detail</button>{#if role !== ''}<button type="button" role="menuitem" onclick={() => { const item = actionAsset!; const trigger = menuTrigger; closeMenu(); edit(item, trigger); }}>Edit</button><div class="menu-separator"></div><button class="delete-item" type="button" role="menuitem" onclick={() => { const item = actionAsset!; closeMenu(); void remove(item); }}>Delete</button>{/if}</div>{/if}
	{#if open}
		<div class="backdrop" role="presentation">
			<dialog bind:this={dialogElement} class="asset-dialog" open aria-modal="true" aria-labelledby="asset-form-title">
				<header><h2 id="asset-form-title">{editing ? (role !== '' ? 'Edit IT asset' : 'IT asset details') : 'Add IT asset'}</h2><button class="modal-close" type="button" aria-label="Close IT asset form" onclick={closeForm}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg></button></header>
				<form class="asset-form" onsubmit={(event) => { event.preventDefault(); void save(); }}>
					<div class="asset-form-body">
						{#if formError}<div class="form-error-summary wide" role="alert"><strong>Unable to save IT asset</strong><span>{formError}</span></div>{/if}
						<h3>Basic information</h3>
						{@render searchableSelect('Type', 'typeId', types.map(item => ({ value: String(item.id), label: item.name, searchTerms: [item.code ?? ''] })), true)}
						<label><span>Management code <span class="required" aria-hidden="true">*</span></span><input name="assetTag" value={form.assetTag} readonly class:invalid={Boolean(fieldErrors.assetTag)} aria-invalid={Boolean(fieldErrors.assetTag)} aria-describedby={fieldErrors.assetTag ? 'assetTag-error' : undefined} placeholder={codeLoading ? 'Preparing code…' : 'Select a type'} disabled={role === ''}/>{#if fieldErrors.assetTag}<span id="assetTag-error" class="field-error" role="alert">{fieldErrors.assetTag}</span>{/if}</label>
						{@render formSelect('Status', 'statusId', [{ value: '', label: '-' }, ...statuses.map(item => ({ value: String(item.id), label: item.name }))], true)}
						{@render searchableSelect('Manufacturer', 'manufacturerId', [{ value: '', label: '-' }, ...manufacturers.map(item => ({ value: String(item.id), label: item.name }))])}
						<label>Model number<input bind:value={form.modelNumber} placeholder="e.g. Latitude 7450" disabled={role === ''}/></label>
						<label>Serial number<input name="serialNumber" value={form.serialNumber} oninput={(event) => updateField('serialNumber', event.currentTarget.value)} class:invalid={Boolean(fieldErrors.serialNumber)} aria-invalid={Boolean(fieldErrors.serialNumber)} aria-describedby={fieldErrors.serialNumber ? 'serialNumber-error' : undefined} placeholder="e.g. ABC123456" disabled={role === ''}/>{#if fieldErrors.serialNumber}<span id="serialNumber-error" class="field-error" role="alert">{fieldErrors.serialNumber}</span>{/if}</label>
						{#if selectedType?.code !== 'UTM' && selectedType?.code !== 'UPS' && (selectedType?.supportsCpu || selectedType?.supportsRam || selectedType?.supportsOs || selectedType?.supportsLoginUsername)}
							<h3>Hardware and software</h3>
							{#if selectedType?.supportsCpu}{@render formSelect('CPU type', 'cpuTypeId', [{ value: '', label: '-' }, ...cpus.map(item => ({ value: String(item.id), label: item.displayName ?? item.name }))])}{/if}
							{#if selectedType?.supportsRam}<label>RAM (GB)<input name="ramGb" value={form.ramGb} oninput={(event) => updateField('ramGb', event.currentTarget.value)} class:invalid={Boolean(fieldErrors.ramGb)} aria-invalid={Boolean(fieldErrors.ramGb)} aria-describedby={fieldErrors.ramGb ? 'ramGb-error' : undefined} type="number" placeholder="e.g. 16" disabled={role === ''}/>{#if fieldErrors.ramGb}<span id="ramGb-error" class="field-error" role="alert">{fieldErrors.ramGb}</span>{/if}</label>{/if}
							{#if selectedType?.supportsOs}{@render searchableSelect('Operating system', 'operatingSystemId', [{ value: '', label: '-' }, ...systems.map(item => ({ value: String(item.id), label: item.displayName ?? item.name }))])}{/if}
							{#if selectedType?.supportsLoginUsername}<label>Login username<input bind:value={form.loginUsername} autocomplete="off" placeholder="e.g. j.smith" disabled={role === ''}/></label>{/if}
						{/if}
						<h3>Location and lifecycle</h3>
						{@render formSelect('Branch', 'branchId', [{ value: '', label: '-' }, ...branches.map(item => ({ value: String(item.id), label: item.name }))], true)}
						{@render formSelect('Room', 'roomId', [{ value: '', label: '-' }, ...availableRooms.map(item => ({ value: String(item.id), label: item.name }))], true, false, !branchId)}
						{@render formSelect('Storage location', 'locationId', [{ value: '', label: '-' }, ...availableLocations.map(item => ({ value: String(item.id), label: item.name }))], true, false, !roomId)}
						{@render dateInput('Purchase date', 'purchasedOn', form.purchasedOn, false, true)}
						{@render dateInput('Disposal date', 'disposalOn', form.disposalOn, true, selectedStatus?.disposalDatePolicy === 'required', selectedStatus?.disposalDatePolicy === 'prohibited')}
						<label class="wide">Notes<textarea bind:value={form.notes} placeholder="e.g. Asset details or maintenance notes" disabled={role === ''}></textarea></label>
						<h3>Assign to employee</h3>
						{@render searchableSelect('Employee', 'assignEmployeeId', [{ value: '', label: 'Unassigned' }, ...employees.map(employee => ({ value: String(employee.id), label: employeeName(employee), searchTerms: [employee.firstName, employee.middleName ?? '', employee.lastName] }))])}
					</div>
					<footer class="asset-form-footer"><button class="secondary" type="button" disabled={saving} onclick={closeForm}>{role !== '' ? 'Cancel' : 'Close'}</button>{#if role !== ''}<button class="primary save-button" type="submit" disabled={saving || codeLoading}>{saving ? 'Saving…' : 'Save IT asset'}</button>{/if}</footer>
				</form>
			</dialog>
		</div>
	{/if}
	{#if detailAsset}
		<div class="backdrop" role="presentation">
			<dialog bind:this={detailDialogElement} class="asset-dialog" open aria-modal="true" aria-labelledby="asset-detail-title">
				<header><h2 id="asset-detail-title">IT asset detail</h2><button class="modal-close" type="button" aria-label="Close IT asset detail" onclick={closeDetail}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg></button></header>
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
				<footer class="asset-form-footer"><button class="secondary" type="button" onclick={closeDetail}>Close</button></footer>
			</dialog>
		</div>
	{/if}
</AssetManagementShell>

<style>
	.heading{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;margin-bottom:24px}
	.heading p{margin:0;color:#1abb9c;font-size:11px;font-weight:700;letter-spacing:.08em}.heading h1{margin:4px 0;font-size:30px}.heading span{color:var(--muted)}
	button{font:inherit}
	.primary,.secondary{display:inline-flex;align-items:center;justify-content:center;height:32px;padding:0 12px;border:1px solid var(--border);border-radius:4px;font-size:12.5px;font-weight:500;line-height:1}
	.primary{background:#1abb9c!important;border-color:#169f85;color:#fff!important}.secondary{background:var(--surface)!important;color:var(--text-secondary)!important}
	.add-button{gap:5px;white-space:nowrap;transition:background 120ms,border-color 120ms,color 120ms,box-shadow 120ms}.add-button:hover{background:#169f85!important}.add-button svg{width:14px;height:14px}.add-button:focus{outline:none}.add-button:focus-visible{outline:2px solid #1abb9c;outline-offset:2px}
	.notice{color:var(--muted);font-size:12px}.list-card{display:flex;min-height:0;flex-direction:column;overflow:hidden;background:var(--surface);border:1px solid var(--border);border-radius:6px;box-shadow:var(--shadow)}.card-header{display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid var(--border-light)}.card-header h2{margin:0;color:var(--text);font-size:14px}.card-header p{margin:1px 0 0;color:var(--muted);font-size:11.5px}.table-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 16px;border-bottom:1px solid var(--border-light)}.search-box{position:relative;display:block;width:240px}.search-box svg{position:absolute;top:50%;left:9px;width:14px;height:14px;color:var(--muted);pointer-events:none;transform:translateY(-50%)}.search-box input{width:100%;height:32px;padding:0 10px 0 32px;background:var(--bg);color:var(--text);border:1px solid var(--border);border-radius:4px;font-size:13px;outline:none}.search-box input::placeholder{color:#c0c7cf}:global(html[data-theme='dark']) .search-box input::placeholder{color:#5a6473}.search-box input:focus{border-color:#1abb9c;box-shadow:0 0 0 3px rgba(26,187,156,.14)}.page-size{display:flex;align-items:center;gap:7px;color:var(--muted);font-size:12px}.page-size-picker{position:relative}.page-size-trigger{display:flex;align-items:center;justify-content:space-between;width:62px;height:32px;padding:0 8px;background:var(--surface)!important;color:var(--text)!important;border:1px solid var(--border);border-radius:6px;font-size:12px}.page-size-trigger:focus-visible,.page-size-trigger[aria-expanded='true']{border-color:#1abb9c;outline:0;box-shadow:0 0 0 3px rgba(26,187,156,.14)}.page-size-trigger svg{width:10px;height:6px;fill:none;stroke:var(--muted);stroke-width:1.5}.page-size-trigger[aria-expanded='true'] svg{transform:rotate(180deg)}.page-size-options{position:absolute;top:calc(100% + 4px);right:0;z-index:20;width:62px;padding:3px;background:var(--surface);border:1px solid var(--border);border-radius:6px;box-shadow:0 8px 18px rgba(15,23,42,.12)}.page-size-options button{display:block;width:100%;height:28px;padding:0 7px;background:transparent!important;color:var(--text)!important;border:0;border-radius:3px;text-align:left;font-size:12px}.page-size-options button:hover,.page-size-options button:focus-visible{background:var(--surface-secondary)!important;outline:0}.page-size-options button.selected{background:#1abb9c!important;color:#fff!important}.table-responsive{max-height:min(62vh,700px);overflow:auto}table{width:100%;min-width:1120px;table-layout:fixed;border-collapse:collapse;box-shadow:none;font-size:13px}.code-column{width:15%}.type-column{width:10%}.maker-column{width:17%}.branch-column{width:11%}.room-column{width:10%}.location-column{width:12%}.user-column{width:12%}.status-column{width:9%}.actions-width-column{width:4%}th{position:sticky;top:0;z-index:2;padding:8px 12px;background:var(--surface-secondary);color:var(--muted);text-align:left;font-size:11px;font-weight:700;letter-spacing:.3px}td{padding:9px 12px;color:var(--text-secondary);border-bottom:1px solid var(--border-light);vertical-align:middle;overflow-wrap:anywhere}tbody tr:hover{background:var(--surface-secondary)}tbody tr:last-child td{border-bottom:0}td strong{color:var(--text);font-weight:600}td small{display:block;color:var(--muted);font-size:11px}.sort-button{display:inline-flex;align-items:center;gap:6px;padding:0;background:transparent!important;color:var(--muted)!important;border:0;border-radius:2px;text-align:left;font-size:inherit;font-weight:inherit;letter-spacing:inherit;text-transform:uppercase}.sort-button:focus-visible{outline:2px solid #1abb9c;outline-offset:3px}.sort-indicator{position:relative;flex:none;width:10px;height:14px;opacity:.75}.sort-indicator::before,.sort-indicator::after{position:absolute;left:1px;width:0;height:0;content:'';border-right:4px solid transparent;border-left:4px solid transparent}.sort-indicator::before{top:1px;border-bottom:4px solid var(--muted)}.sort-indicator::after{bottom:1px;border-top:4px solid var(--muted)}.sort-indicator.ascending::before{border-bottom-color:#1abb9c}.sort-indicator.ascending::after{opacity:.3}.sort-indicator.descending::before{opacity:.3}.sort-indicator.descending::after{border-top-color:#1abb9c}.status{display:inline-block;padding:3px 7px;border-radius:10px;background:#1abb9c1c;color:#169f85;font-size:11px}.actions-column{width:48px}.actions-cell{text-align:right}.empty{height:96px;color:var(--muted);text-align:center}.table-footer{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 16px;border-top:1px solid var(--border-light)}.table-footer p{margin:0;color:var(--muted);font-size:12px}.pagination{display:flex;align-items:center;gap:4px}.pagination button{display:inline-flex;align-items:center;justify-content:center;min-width:28px;height:28px;padding:0 8px;background:var(--surface)!important;color:var(--text-secondary)!important;border:1px solid var(--border);border-radius:4px;font-size:12px}.pagination button:hover:not(:disabled):not(.current){background:var(--surface-secondary)!important;color:var(--text)!important}.pagination button.current{background:#1abb9c!important;color:#fff!important;border-color:#169f85}.pagination button:disabled{cursor:not-allowed;opacity:.5}.pagination span{padding:0 4px;color:var(--muted)}.sr-only{position:absolute;width:1px;height:1px;padding:0;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
	.table-responsive table{min-width:1080px}
	.backdrop{position:fixed;inset:0;z-index:1200;display:grid;place-items:center;padding:20px;background:#0f162666}
	.asset-dialog{display:flex;flex-direction:column;width:min(100%,900px);height:min(90vh,760px);padding:0;overflow:hidden;background:var(--surface);color:var(--text);border:1px solid var(--border);border-radius:8px}
	.asset-dialog>header{display:flex;flex:none;align-items:center;justify-content:space-between;padding:24px;border-bottom:1px solid var(--border)}.asset-dialog h2{margin:0}
	.modal-close{display:grid;place-items:center;width:34px;height:34px;margin:0;padding:7px;background:transparent!important;color:var(--muted)!important;border:0;border-radius:4px}.modal-close:hover{background:var(--bg)!important}.modal-close svg{width:18px;height:18px}
	.asset-form{display:flex;flex:1;min-height:0;flex-direction:column;gap:0;overflow:hidden;padding:0;background:var(--surface)}
	.asset-form-body{display:grid;flex:1;min-height:0;grid-template-columns:repeat(3,minmax(0,1fr));align-content:start;align-items:start;gap:16px;overflow-y:auto;padding:16px 24px 24px;background:var(--bg)}
	.asset-form-body h3{grid-column:1/-1;margin:8px 0 0;font-size:14px}
	.asset-detail-body{display:grid;flex:1;min-height:0;align-content:start;gap:16px;overflow-y:auto;padding:16px 24px 24px;background:var(--bg)}
	.detail-section{min-width:0;padding:16px;background:var(--surface);border:1px solid var(--border);border-radius:5px}.detail-section h3{margin:0 0 14px;color:var(--text);font-size:14px}.detail-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;margin:0}.detail-grid>div{min-width:0}.detail-grid dt{color:var(--muted);font-size:11px;font-weight:600}.detail-grid dd{margin:4px 0 0;color:var(--text);font-size:13px;overflow-wrap:anywhere;white-space:pre-wrap}
	.asset-form label{display:grid;align-content:start;gap:6px;min-width:0;color:var(--text);font-size:12px;font-weight:500}.required{margin-left:2px;color:var(--danger)}
	.asset-form input,.asset-form textarea{display:block;width:100%;height:36px;padding:0 12px;border:1px solid var(--border);border-radius:4px;background:var(--surface);color:var(--text);font-size:13px;font-weight:400;outline:none;transition:border-color 150ms,box-shadow 150ms}
	.asset-form textarea{height:auto;min-height:90px;padding:8px 12px;line-height:1.5;resize:vertical}.asset-form input::placeholder,.asset-form textarea::placeholder{color:#c0c7cf}:global(html[data-theme='dark']) .asset-form input::placeholder,:global(html[data-theme='dark']) .asset-form textarea::placeholder{color:#5a6473}
	.asset-form input:hover:not(:focus),.asset-form textarea:hover:not(:focus){border-color:var(--muted)}.asset-form input:focus,.asset-form textarea:focus{border-color:#1abb9c;box-shadow:0 0 0 3px rgba(26,187,156,.14)}.asset-form :is(input,textarea):disabled{cursor:not-allowed;opacity:.7}
	.form-select-field{display:grid;gap:6px;min-width:0;color:var(--text);font-size:12px;font-weight:500}.form-select-picker{position:relative;min-width:0}
	.form-select-trigger{display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;height:36px;margin:0;padding:0 12px;background:var(--surface)!important;color:var(--text)!important;border:1px solid var(--border);border-radius:4px;text-align:left;font-size:13px;font-weight:400;transition:border-color 150ms,box-shadow 150ms}.form-select-trigger>span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.form-select-trigger.unselected{color:#c0c7cf!important}:global(html[data-theme='dark']) .form-select-trigger.unselected{color:#5a6473!important}.form-select-trigger:hover:not(:focus){border-color:var(--muted)}.form-select-trigger:focus,.form-select-trigger:focus-visible,.form-select-trigger[aria-expanded='true']{border-color:#1abb9c;outline:0;box-shadow:0 0 0 3px rgba(26,187,156,.14)}.form-select-trigger:disabled{cursor:not-allowed;opacity:.7}.form-select-trigger svg{flex:none;width:10px;height:6px;fill:none;stroke:#9ba5b1;stroke-width:1.5}.form-select-trigger[aria-expanded='true'] svg{transform:rotate(180deg)}
	.form-select-options{position:absolute;top:calc(100% + 4px);left:0;z-index:30;width:100%;max-height:200px;overflow-y:auto;padding:3px;background:var(--surface);border:1px solid var(--border);border-radius:6px;box-shadow:0 8px 18px rgba(15,23,42,.12)}.form-select-picker.above .form-select-options{top:auto;bottom:calc(100% + 4px)}.form-select-options button{display:block;width:100%;min-height:28px;margin:0;padding:5px 7px;background:transparent!important;color:var(--text)!important;border:0;border-radius:3px;text-align:left;font-size:12px;line-height:18px}.form-select-options button:hover,.form-select-options button:focus-visible{background:var(--surface-secondary)!important;outline:0}.form-select-options button.selected{background:#1abb9c!important;color:#fff!important}
	.form-select-search{padding-right:34px!important}.form-select-search.unselected{color:#c0c7cf!important}:global(html[data-theme='dark']) .form-select-search.unselected{color:#5a6473!important}.search-chevron{position:absolute;top:50%;right:13px;width:10px;height:6px;fill:none;stroke:var(--muted);stroke-width:1.5;pointer-events:none;transform:translateY(-50%)}.searchable-select:has(input[aria-expanded='true']) .search-chevron{transform:translateY(-50%) rotate(180deg)}.form-select-empty{margin:0;padding:8px 7px;color:var(--muted);font-size:12px}
	.field-error{display:block;color:var(--danger);font-size:11px;line-height:1.35}.asset-form .invalid,.asset-form .invalid:hover:not(:focus){border-color:var(--danger)!important}.asset-form .invalid:focus{border-color:var(--danger)!important;box-shadow:0 0 0 3px rgba(214,57,57,.14)!important}
	.custom-date{position:relative;display:block;min-width:0;color:var(--text);font-size:12px;font-weight:500}.custom-date>span{display:block;margin-bottom:6px}.date-trigger{display:flex;align-items:center;justify-content:space-between;width:100%;height:36px;margin:0;padding:0 12px;background:var(--surface)!important;color:var(--text)!important;border:1px solid var(--border);border-radius:4px;text-align:left;font-size:13px;font-weight:400;transition:border-color 150ms,box-shadow 150ms}.date-trigger .placeholder{color:#c0c7cf}:global(html[data-theme='dark']) .date-trigger .placeholder{color:#5a6473}.date-trigger svg{width:17px;height:17px;fill:none;stroke:var(--muted);stroke-width:1.5}.date-trigger:hover:not(:focus){border-color:var(--muted)}.date-trigger:focus-visible,.date-trigger[aria-expanded='true']{border-color:#1abb9c;box-shadow:0 0 0 3px rgba(26,187,156,.14);outline:none}.date-trigger:disabled{cursor:not-allowed;opacity:.7}
	.calendar-panel{position:absolute;top:calc(100% + 6px);left:0;z-index:20;width:280px;padding:12px;background:var(--surface);color:var(--text);border:1px solid var(--border);border-radius:6px;box-shadow:0 14px 36px rgba(0,0,0,.38)}.above .calendar-panel{top:auto;bottom:calc(100% + 6px)}.calendar-head{display:grid;grid-template-columns:30px 1fr 30px;align-items:center;margin-bottom:8px}.calendar-head strong{text-align:center;font-size:13px;font-weight:600}.calendar-head button,.calendar-actions button{margin:0;padding:0;background:transparent!important;color:var(--muted)!important}.calendar-head button{height:30px;font-size:22px}.weekdays,.calendar-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:3px}.weekdays span{padding:5px 0;color:var(--muted);font-size:10px;font-weight:600;text-align:center}.calendar-grid button{height:31px;margin:0;padding:0;background:transparent!important;color:var(--text)!important;border:1px solid transparent;border-radius:4px;font-size:12px}.calendar-grid button:hover{background:var(--surface-secondary)!important;border-color:var(--border)}.calendar-grid button.outside{color:var(--muted)!important;opacity:.55}.calendar-grid button.today{border-color:#1abb9c}.calendar-grid button.selected{background:#1abb9c!important;color:#fff!important;border-color:#1abb9c}.calendar-actions{display:flex;justify-content:space-between;margin-top:10px;padding-top:9px;border-top:1px solid var(--border)}.calendar-actions button{font-size:11px}.calendar-head button:hover,.calendar-actions button:hover{background:var(--surface-secondary)!important;color:var(--text)!important}.calendar-panel button:focus-visible{outline:2px solid #1abb9c;outline-offset:2px}
	.wide{grid-column:1/-1}.form-error-summary{display:grid;gap:3px;padding:10px 12px;background:rgba(214,57,57,.08);color:var(--danger);border:1px solid rgba(214,57,57,.35);border-radius:5px;font-size:12px}.form-error-summary strong{font-size:12px}.form-error-summary span{color:var(--text-secondary)}
	.history{overflow-x:auto;background:var(--surface);border:1px solid var(--border);border-radius:5px}.history p{margin:0;padding:12px;color:var(--muted);font-size:12px}.history table{width:100%;min-width:420px;font-size:12px}.history th,.history td{position:static;padding:8px 12px}
	.history-event{padding:12px;border-bottom:1px solid var(--border)}.history-event:last-child{border-bottom:0}.history-event-heading{display:flex;flex-wrap:wrap;gap:6px 14px;align-items:center;font-size:12px;margin-bottom:8px}.history-event-heading span{color:var(--muted)}.history-event table{border-collapse:collapse}.history-event th,.history-event td{text-align:left;vertical-align:top;border-top:1px solid var(--border);overflow-wrap:anywhere}.history-event th{font-weight:600}
	.asset-form-footer{display:flex;flex:none;justify-content:flex-end;gap:8px;margin:0;padding:16px 24px;border-top:1px solid var(--border-light);background:var(--surface)}.asset-form-footer button{margin:0;white-space:nowrap;transition:background 120ms,border-color 120ms,color 120ms,box-shadow 120ms}.asset-form-footer .secondary{box-shadow:var(--shadow)}.asset-form-footer .secondary:hover{background:var(--surface-secondary)!important;color:var(--text)!important}.asset-form-footer .save-button{background:#337ab7!important;border-color:#286090}.asset-form-footer .save-button:hover{background:#286090!important}.asset-form-footer button:disabled{cursor:wait;opacity:.65}.asset-form-footer button:focus-visible,.modal-close:focus-visible{outline:2px solid #337ab7;outline-offset:2px}
	@media(max-width:700px){.heading,.table-toolbar,.table-footer{align-items:stretch;flex-direction:column}.heading .primary{width:100%}.search-box{width:100%}.page-size{justify-content:flex-end}.pagination{flex-wrap:wrap}.asset-form-body,.asset-detail-body{grid-template-columns:1fr;padding:16px}.detail-grid{grid-template-columns:1fr 1fr}.asset-form-footer{padding:12px 16px}}
	@media(max-width:450px){.detail-grid{grid-template-columns:1fr}}
</style>
