<script lang="ts">
	import { localizeAssetReason, assetErrorMessage } from '$lib/asset-errors';
	import { localeMessages, formatLocaleTemplate } from '$lib/locale-messages';
	import { onMount, tick } from 'svelte';
	import { apiData } from '$lib/api';
	import type { ChangeHistoryEntry } from '$lib/change-history';
	import AddButton from '$lib/components/AddButton.svelte';
	import AssetManagementShell from '$lib/components/AssetManagementShell.svelte';
	import ChangeHistorySection from '$lib/components/ChangeHistorySection.svelte';
	import DatePicker from '$lib/components/DatePicker.svelte';
	import DetailModal from '$lib/components/DetailModal.svelte';
	import DiscardChangesDialog from '$lib/components/DiscardChangesDialog.svelte';
	import FormSection from '$lib/components/FormSection.svelte';
	import MasterList from '$lib/components/MasterList.svelte';
	import MasterPageHeader from '$lib/components/MasterPageHeader.svelte';
	import ModalBackdrop from '$lib/components/ModalBackdrop.svelte';
	import SearchSelect from '$lib/components/SearchSelect.svelte';
	import StatusNotice from '$lib/components/StatusNotice.svelte';
	import { formatDate, formatEmployeeName, localization } from '$lib/localization';
	import { formSnapshot } from '$lib/modalForm';
	import { operatingSystemName, type OperatingSystemParts } from '$lib/operating-system-name';

	let text = $derived(localeMessages[$localization.displayLanguage].assets);
	let common = $derived(localeMessages[$localization.displayLanguage].common);
	function t(key: keyof Omit<typeof text, 'errors' | 'credentialStatus'>, ...values: (string | number)[]) { return formatLocaleTemplate(text[key], ...values); }

	type Named = { id: number; code?: string; name: string; managementCodePrefix?: string; supportsCpu?: boolean; supportsRam?: boolean; supportsOs?: boolean; supportsLoginUsername?: boolean; disposalDatePolicy?: string };
	type OperatingSystem = OperatingSystemParts & { id: number };
	type Branch = Named;
	type Room = Named & { branchId: number };
	type Storage = Named & { branchId: number; roomId: number; room: { id: number; branchId: number; name: string; branch: { id: number; name: string } } };
	type Assignee = { id: number; employeeCode: string; firstName: string; middleName: string | null; lastName: string };
	type Assignment = { id: number; employee: Assignee };
	type Asset = { id: number; assetTag: string; typeId: number; manufacturerId: number | null; modelNumber: string | null; serialNumber: string | null; cpuTypeId: number | null; ramGb: number | null; operatingSystemId: number | null; ipAddress1: string | null; ipAddress2: string | null; hostname: string | null; adminUsername: string | null; loginUsername: string | null; managementConsoleUrl: string | null; managementConsoleUsername: string | null; storageId: number; statusId: number; purchasedOn: string | null; disposalOn: string | null; notes: string | null; type: Named; manufacturer: Named | null; cpuType: Named | null; operatingSystem: OperatingSystem | null; status: Named; storage: Storage; assignments: Assignment[] };
	type CredentialType = 'admin' | 'login' | 'management_console';
	type CredentialStatus = Record<CredentialType, { configured: boolean }>;
	let credentialStatusText = $derived(localeMessages[$localization.displayLanguage].assets.credentialStatus);
	type DateField = 'purchasedOn' | 'disposalOn';
	type SelectField = 'typeId' | 'statusId' | 'manufacturerId' | 'cpuTypeId' | 'operatingSystemId' | 'branchId' | 'roomId' | 'storageId' | 'assignEmployeeId';
	type SelectOption = { value: string; label: string; searchTerms?: string[] };
	let historyFields: Record<string, string> = $derived({ assetTag: text.assetTag, typeId: text.type, manufacturerId: text.manufacturer, modelNumber: text.modelNumber, serialNumber: text.serialNumber, cpuTypeId: text.cpuType, ramGb: text.ramGb, operatingSystemId: text.operatingSystem, ipAddress1: text.ipAddress1, ipAddress2: text.ipAddress2, hostname: text.hostname, adminUsername: text.adminUsername, loginUsername: text.loginUsername, managementConsoleUrl: text.managementConsoleUrl, managementConsoleUsername: text.managementConsoleUsername, storageId: text.storage, statusId: text.status, purchasedOn: text.purchasedOn, disposalOn: text.disposalOn, notes: text.notes, assigneeId: text.employee });
	let historyActions: Record<string, string> = $derived({ create: common.created, update: common.updated, delete: common.deleted, assign: text.assigned, return: text.returned });
	type FormField = keyof ReturnType<typeof blank>;

	const blank = () => ({ assetTag: '', typeId: '', manufacturerId: '', modelNumber: '', serialNumber: '', cpuTypeId: '', ramGb: '', operatingSystemId: '', ipAddress1: '', ipAddress2: '', hostname: '', adminUsername: '', loginUsername: '', managementConsoleUrl: '', managementConsoleUsername: '', storageId: '', statusId: '', purchasedOn: '', disposalOn: '', notes: '' });
	const blankCredentialPasswords = (): Record<CredentialType, string> => ({ admin: '', login: '', management_console: '' });
	const blankCredentialClears = (): Record<CredentialType, boolean> => ({ admin: false, login: false, management_console: false });
	const blankCredentialStatus = (): CredentialStatus => ({ admin: { configured: false }, login: { configured: false }, management_console: { configured: false } });
	const endpoint = (name: string) => fetch('/v1/' + name + '?limit=500');
	async function allPages<T>(name: string, sortOrder?: 'asc' | 'desc'): Promise<T[]> {
		const items: T[] = [];
		for (let offset = 0; ; offset += 500) {
			const response = await fetch(`/v1/${name}?limit=500&offset=${offset}${sortOrder ? `&sortOrder=${sortOrder}` : ''}`);
			if (!response.ok) throw new Error(text.loadFailed);
			const page = await apiData<T[]>(response);
			items.push(...page);
			if (page.length < 500) return items;
		}
	}
	const iso = (value: string | null) => value ? value.slice(0, 10) : '';
	const employeeName = (employee: Assignee) => formatEmployeeName(employee, $localization);
	const employeeOptionLabel = (employee: Assignee) => `${employeeName(employee)} (${employee.employeeCode})`;
	const assigneeName = (assignment: Assignment | undefined) => assignment ? employeeName(assignment.employee) : text.unassigned;
	const invalidRam = (value: string) => value !== '' && (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < 1);

	let assetList = $state<MasterList>();
	let types = $state<Named[]>([]);
	let manufacturers = $state<Named[]>([]);
	let cpus = $state<Named[]>([]);
	let systems = $state<OperatingSystem[]>([]);
	let statuses = $state<Named[]>([]);
	let branches = $state<Branch[]>([]);
	let rooms = $state<Room[]>([]);
	let storageItems = $state<Storage[]>([]);
	let employees = $state<Assignee[]>([]);
	let changeHistory = $state<ChangeHistoryEntry[]>([]);
	let historyLoading = $state(false);
	let historyError = $state(false);
	let historyRequestId = 0;
	let detailAsset = $state<Asset | null>(null);
	let detailReturnFocus = $state<HTMLElement | null>(null);
	let canManageAssets = $state(false);
	let canReadAssetCredentials = $state(false);
	let canWriteAssetCredentials = $state(false);
	let form = $state(blank());
	let credentialPasswords = $state(blankCredentialPasswords());
	let credentialClears = $state(blankCredentialClears());
	let credentialStatus = $state<CredentialStatus>(blankCredentialStatus());
	let credentialsLoading = $state(false);
	let credentialsError = $state('');
	let credentialsErrorDismissed = $state(false);
	let credentialRequestId = 0;
	let branchId = $state('');
	let roomId = $state('');
	let codeLoading = $state(false);
	let managementCodeAutomatic = $state(true);
	let previewRequestId = 0;
	let editing = $state<Asset | null>(null);
	let open = $state(false);
	let saving = $state(false);
	let message = $state('');
	let messageTone = $state<'success' | 'error'>('error');
	let formError = $state('');
	let fieldErrors = $state<Record<string, string>>({});
	let assignEmployeeId = $state('');
	let dialogElement = $state<HTMLDialogElement>();
	let returnFocus: HTMLElement | null = null;
	let activeDateField = $state<DateField | null>(null);
	let initialSnapshot = $state('');
	let confirmingDiscard = $state(false);
	let revealType = $state<CredentialType | null>(null);
	let currentPassword = $state('');
	let revealedPassword = $state('');
	let revealError = $state('');
	let revealing = $state(false);
	let credentialDialogElement = $state<HTMLDialogElement>();

	const selectedType = $derived(types.find((item) => String(item.id) === form.typeId));
	const selectedStatus = $derived(statuses.find((item) => String(item.id) === form.statusId));
	const availableRooms = $derived(rooms.filter((item) => String(item.branchId) === branchId));
	const availableStorage = $derived(storageItems.filter((item) => String(item.roomId) === roomId && String(item.branchId) === branchId));
	let hasDraftChanges = $derived(open && canManageAssets && initialSnapshot !== '' && formChangesSnapshot() !== initialSnapshot);
	let hasUnsavedChanges = $derived(Boolean(editing) && hasDraftChanges);
	function formChangesSnapshot() {
		return formSnapshot({ form: managementCodeAutomatic ? { ...form, assetTag: '' } : form, branchId, roomId, assignEmployeeId, credentialPasswords, credentialClears });
	}

	async function load() {
		const session = await fetch('/v1/auth/session');
		if (!session.ok) { messageTone = 'error'; message = text.signInRequired; return; }
		const capabilities = (await apiData<{ user: { capabilities: { canManageAssets: boolean; canReadAssetCredentials: boolean; canWriteAssetCredentials: boolean } } }>(session)).user.capabilities;
		canManageAssets = capabilities.canManageAssets;
		canReadAssetCredentials = capabilities.canReadAssetCredentials;
		canWriteAssetCredentials = capabilities.canWriteAssetCredentials;
		const names = ['it-asset-types', 'manufacturers', 'cpu-types', 'operating-systems', 'it-asset-statuses'];
		const responses = await Promise.all(names.map(endpoint));
		if (responses.some((response) => !response.ok)) { messageTone = 'error'; message = text.loadFailed; return; }
		const data = await Promise.all(responses.map((response) => apiData<unknown[]>(response)));
		[types, manufacturers, cpus, systems, statuses] = data as unknown as [Named[], Named[], Named[], OperatingSystem[], Named[]];
		try { [branches, rooms, storageItems] = await Promise.all([allPages<Branch>('branches'), allPages<Room>('rooms'), allPages<Storage>('storage')]); }
		catch { messageTone = 'error'; message = text.locationLoadFailed; return; }
		if (canManageAssets) {
			const response = await fetch('/v1/it-asset-assignees');
			if (response.ok) employees = await apiData<Assignee[]>(response);
		}
	}

	function focusForm() {
		void tick().then(() => {
			if (open) (dialogElement?.querySelector<HTMLElement>('form .form-select-trigger:not(:disabled), form input:not(:disabled), form textarea:not(:disabled)') ?? dialogElement?.querySelector<HTMLElement>('.modal-close'))?.focus();
		});
	}
	function closeFormImmediately() {
		confirmingDiscard = false;
		open = false;
		initialSnapshot = '';
		formError = '';
		fieldErrors = {};
		activeDateField = null;
		previewRequestId++;
		codeLoading = false;
		void tick().then(() => returnFocus?.focus());
	}
	function requestCloseForm() {
		if (saving) return;
		activeDateField = null;
		if (hasUnsavedChanges) { confirmingDiscard = true; return; }
		closeFormImmediately();
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
		credentialPasswords = blankCredentialPasswords();
		credentialClears = blankCredentialClears();
		credentialStatus = blankCredentialStatus();
		credentialsError = '';
		credentialRequestId++;
		formError = '';
		fieldErrors = {};
		activeDateField = null;
		confirmingDiscard = false;
		managementCodeAutomatic = true;
		initialSnapshot = formChangesSnapshot();
		open = true;
		focusForm();
		void refreshCodePreview(form.typeId);
	}
	function edit(item: Asset, focusReturn: HTMLElement | null = null) {
		returnFocus = focusReturn ?? document.activeElement as HTMLElement;
		editing = item;
		form = { assetTag: item.assetTag, typeId: String(item.typeId), manufacturerId: item.manufacturerId ? String(item.manufacturerId) : '', modelNumber: item.modelNumber ?? '', serialNumber: item.serialNumber ?? '', cpuTypeId: item.cpuTypeId ? String(item.cpuTypeId) : '', ramGb: item.ramGb ? String(item.ramGb) : '', operatingSystemId: item.operatingSystemId ? String(item.operatingSystemId) : '', ipAddress1: item.ipAddress1 ?? '', ipAddress2: item.ipAddress2 ?? '', hostname: item.hostname ?? '', adminUsername: item.adminUsername ?? '', loginUsername: item.loginUsername ?? '', managementConsoleUrl: item.managementConsoleUrl ?? '', managementConsoleUsername: item.managementConsoleUsername ?? '', storageId: String(item.storageId), statusId: String(item.statusId), purchasedOn: iso(item.purchasedOn), disposalOn: iso(item.disposalOn), notes: item.notes ?? '' };
		branchId = String(item.storage.room.branchId);
		roomId = String(item.storage.room.id);
		previewRequestId++;
		codeLoading = false;
		managementCodeAutomatic = false;
		assignEmployeeId = item.assignments[0] ? String(item.assignments[0].employee.id) : '';
		credentialPasswords = blankCredentialPasswords();
		credentialClears = blankCredentialClears();
		credentialStatus = blankCredentialStatus();
		credentialsError = '';
		formError = '';
		fieldErrors = {};
		activeDateField = null;
		initialSnapshot = formChangesSnapshot();
		confirmingDiscard = false;
		open = true;
		focusForm();
		if (canReadAssetCredentials) void loadCredentialStatus(item.id);
	}
	function showDetail(item: Asset, focusReturn: HTMLElement | null = null) {
		detailReturnFocus = focusReturn ?? document.activeElement as HTMLElement;
		detailAsset = item;
		void loadChangeHistory(item.id);
		credentialStatus = blankCredentialStatus();
		credentialsError = '';
		if (canReadAssetCredentials) void loadCredentialStatus(item.id);
	}
	function closeDetail() {
		closeCredentialAccess();
		detailAsset = null;
		historyRequestId++;
		credentialRequestId++;
		changeHistory = [];
	}
	async function loadCredentialStatus(assetId: number) {
		const requestId = ++credentialRequestId;
		credentialsLoading = true;
		credentialsError = '';
		try {
			const response = await fetch(`/v1/it-assets/${assetId}/credentials`);
			if (!response.ok) throw new Error();
			const status = await apiData<CredentialStatus>(response);
			if (requestId === credentialRequestId) credentialStatus = status;
		} catch { if (requestId === credentialRequestId) { credentialsErrorDismissed = false; credentialsError = text.credentialsLoadFailed; } }
		finally { if (requestId === credentialRequestId) credentialsLoading = false; }
	}
	function openCredentialAccess(type: CredentialType) {
		revealType = type;
		currentPassword = '';
		revealedPassword = '';
		revealError = '';
		void tick().then(() => credentialDialogElement?.querySelector<HTMLInputElement>('input')?.focus());
	}
	function closeCredentialAccess() {
		revealType = null;
		currentPassword = '';
		revealedPassword = '';
		revealError = '';
		revealing = false;
	}
	async function revealCredential() {
		if (!detailAsset || !revealType || revealing || !currentPassword) return;
		revealing = true;
		revealError = '';
		try {
			const response = await fetch(`/v1/it-assets/${detailAsset.id}/credential-accesses`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ credentialType: revealType, currentPassword }) });
			if (!response.ok) {
				const payload = await response.json().catch(() => null) as { error?: { code?: string } } | null;
				revealError = assetErrorMessage(payload?.error?.code, response.status, text, text.revealFailed);
				return;
			}
			revealedPassword = (await apiData<{ password: string }>(response)).password;
			currentPassword = '';
		} catch { revealError = text.revealFailed; }
		finally { revealing = false; }
	}
	async function copyRevealedPassword() {
		if (!revealedPassword) return;
		try { await navigator.clipboard.writeText(revealedPassword); revealError = text.passwordCopied; }
		catch { revealError = text.copyFailed; }
	}
	async function loadChangeHistory(assetId: number) {
		const requestId = ++historyRequestId;
		historyLoading = true;
		historyError = false;
		changeHistory = [];
		try {
			const history = await allPages<ChangeHistoryEntry>(`it-assets/${assetId}/history`, 'desc');
			if (requestId === historyRequestId && detailAsset?.id === assetId) changeHistory = history;
		} catch { if (requestId === historyRequestId && detailAsset?.id === assetId) historyError = true; }
		finally { if (requestId === historyRequestId) historyLoading = false; }
	}
	async function refreshCodePreview(typeId: string) {
		const requestId = ++previewRequestId;
		managementCodeAutomatic = true;
		form.assetTag = '';
		clearFieldError('assetTag');
		if (!typeId) { codeLoading = false; return; }
		codeLoading = true;
		try {
			const response = await fetch(`/v1/it-asset-code-previews?typeId=${encodeURIComponent(typeId)}`);
			if (requestId !== previewRequestId || !open) return;
			if (!response.ok) {
				const body = await response.json().catch(() => null) as { error?: { details?: { field?: string; reason?: string }[] } } | null;
				fieldErrors = { ...fieldErrors, assetTag: localizeAssetReason(body?.error?.details?.find(item => item.field === 'assetTag')?.reason, text, text.codeFailed) };
				return;
			}
			form.assetTag = (await apiData<{ assetTag: string }>(response)).assetTag;
		} catch {
			if (requestId === previewRequestId) fieldErrors = { ...fieldErrors, assetTag: text.codeFailed };
		} finally {
			if (requestId === previewRequestId) codeLoading = false;
		}
	}
	function managementCodeError(value = form.assetTag, type = selectedType) {
		const code = value.trim();
		if (!code) return text.codeRequired;
		if (!type?.managementCodePrefix) return '';
		const prefix = `${type.managementCodePrefix}-`;
		if (!code.startsWith(prefix)) return t('codePrefix', prefix);
		const unchangedLegacyCode = Boolean(editing && form.typeId === String(editing.typeId) && code === editing.assetTag && new RegExp(`^${type.managementCodePrefix}-[0-9]{4}$`).test(code));
		if (!new RegExp(`^${type.managementCodePrefix}-[0-9]{3}$`).test(code) && !unchangedLegacyCode) return t('codeDigits', prefix);
		return '';
	}
	function updateManagementCode(value: string) {
		form.assetTag = value;
		managementCodeAutomatic = false;
		const reason = managementCodeError(value);
		const next = { ...fieldErrors };
		if (reason) next.assetTag = reason; else delete next.assetTag;
		fieldErrors = next;
		if (!Object.keys(next).length) formError = '';
	}
	function credentialChanges() {
		const changes: Partial<Record<CredentialType, { action: 'set'; password: string } | { action: 'clear' }>> = {};
		for (const type of ['admin', 'login', 'management_console'] as const) {
			if (credentialClears[type]) changes[type] = { action: 'clear' };
			else if (credentialPasswords[type]) changes[type] = { action: 'set', password: credentialPasswords[type] };
		}
		return changes;
	}
	function updateCredentialPassword(type: CredentialType, value: string) {
		credentialPasswords[type] = value;
		clearFieldError(`${type}Password`);
	}
	async function save() {
		if (saving || codeLoading || credentialsLoading) return;
		const errors: Record<string, string> = {};
		const codeError = managementCodeError();
		if (codeError) errors.assetTag = codeError;
		if (!form.typeId) errors.typeId = text.typeRequired;
		if (!form.statusId) errors.statusId = text.statusRequired;
		if (!branchId) errors.branchId = text.branchRequired;
		if (!roomId) errors.roomId = text.roomRequired;
		if (!form.storageId) errors.storageId = text.storageRequired;
		if (!form.purchasedOn) errors.purchasedOn = text.purchaseRequired;
		if (selectedStatus?.disposalDatePolicy === 'required' && !form.disposalOn) errors.disposalOn = text.disposalRequired;
		if (selectedType?.supportsRam && invalidRam(form.ramGb)) errors.ramGb = text.ramInvalid;
		if (form.ipAddress1.trim() && form.ipAddress1.trim() === form.ipAddress2.trim()) errors.ipAddress2 = text.differentIp;
		for (const type of ['admin', 'login', 'management_console'] as const) if (!credentialClears[type] && credentialPasswords[type].length > 1024) errors[`${type}Password`] = text.passwordLength;
		if (Object.keys(errors).length) { showFieldErrors(errors); return; }
		saving = true;
		formError = '';
		fieldErrors = {};
		const changes = credentialChanges();
		const payload = { ...form, assetTag: managementCodeAutomatic ? null : form.assetTag.trim(), assigneeId: assignEmployeeId || null, cpuTypeId: selectedType?.supportsCpu ? form.cpuTypeId : '', ramGb: selectedType?.supportsRam ? form.ramGb : '', operatingSystemId: selectedType?.supportsOs ? form.operatingSystemId : '', disposalOn: selectedStatus?.disposalDatePolicy === 'prohibited' ? '' : form.disposalOn, ...(Object.keys(changes).length ? { credentials: changes } : {}) };
		try {
			const response = await fetch(editing ? `/v1/it-assets/${editing.id}` : '/v1/it-assets', { method: editing ? 'PATCH' : 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
			if (!response.ok) {
				const body = await response.json().catch(() => null) as { error?: { code?: string; details?: { field?: string; reason?: string }[] } } | null;
				if ((body?.error?.code === 'VALIDATION_ERROR' || body?.error?.code === 'IT_ASSET_FIELD_CONFLICT') && body.error.details?.length) {
					const next: Record<string, string> = {};
					for (const detail of body.error.details) if (detail.field && detail.reason) {
						const mapped = detail.field === 'assigneeId' ? 'assignEmployeeId' : detail.field.startsWith('credentials.') ? `${detail.field.slice('credentials.'.length)}Password` : detail.field;
						if (!next[mapped]) next[mapped] = localizeAssetReason(detail.reason, text);
					}
					if (Object.keys(next).length) { showFieldErrors(next); return; }
				}
				formError = assetErrorMessage(body?.error?.code, response.status, text, text.saveFailed); return;
			}
			const saved = await apiData<Asset>(response);
			const result = editing ? t('updated', saved.assetTag) : t('created', saved.assetTag);
			closeFormImmediately();
			messageTone = 'success'; message = result;
			await assetList?.refresh();
		} catch {
			formError = text.saveRetry;
		} finally {
			saving = false;
		}
	}
	async function remove(item: Asset) {
		if (!confirm(t('deleteConfirm', item.assetTag))) return;
		try {
			const response = await fetch(`/v1/it-assets/${item.id}`, { method: 'DELETE' });
			if (!response.ok) {
				const body = await response.json().catch(() => null) as { error?: { code?: string } } | null;
				messageTone = 'error'; message = assetErrorMessage(body?.error?.code, response.status, text, text.deleteFailed);
				return;
			}
			messageTone = 'success'; message = text.deleted;
		} catch { messageTone = 'error'; message = text.deleteFailed; return; }
		await assetList?.refresh();
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
		formError = text.correctFields;
		const field = Object.keys(errors)[0];
		void tick().then(() => focusField(field));
	}
	function selectedValue(field: SelectField) { return field === 'assignEmployeeId' ? assignEmployeeId : field === 'branchId' ? branchId : field === 'roomId' ? roomId : form[field]; }
	function chooseFormSelect(field: SelectField, value: string) {
		if (field === 'assignEmployeeId') assignEmployeeId = value;
		else if (field === 'branchId') {
			if (branchId !== value) { branchId = value; roomId = ''; form.storageId = ''; clearFieldError('roomId'); clearFieldError('storageId'); }
			clearFieldError('branchId');
		} else if (field === 'roomId') {
			if (roomId !== value) { roomId = value; form.storageId = ''; clearFieldError('storageId'); }
			clearFieldError('roomId');
		} else {
			updateField(field, value);
			if (field === 'statusId' && statuses.find((item) => String(item.id) === value)?.disposalDatePolicy === 'prohibited') { form.disposalOn = ''; clearFieldError('disposalOn'); }
			if (field === 'typeId') {
				if (editing && value === String(editing.typeId)) { previewRequestId++; codeLoading = false; managementCodeAutomatic = false; form.assetTag = editing.assetTag; clearFieldError('assetTag'); }
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
		if (event.defaultPrevented || confirmingDiscard) return;
		if (revealType) {
			if (event.key === 'Escape') { event.preventDefault(); closeCredentialAccess(); }
			else if (event.key === 'Tab') trapDialogTab(event, credentialDialogElement);
			return;
		}
		if (detailAsset) return;
		if (!open) return;
		if (event.key === 'Escape') { event.preventDefault(); if (activeDateField) { const field = activeDateField; activeDateField = null; void tick().then(() => focusField(field)); } else if (!editing && hasDraftChanges && !saving) confirmingDiscard = true; else requestCloseForm(); return; }
		if (event.key === 'Tab') trapDialogTab(event, dialogElement);
	}

	onMount(() => { void load().catch(() => { messageTone = 'error'; message = text.loadFailed; }); });
</script>

<svelte:window onkeydown={modalKeydown} />

{#snippet dateInput(label: string, field: DateField, value: string, above = false, required = false, inactive = false)}
	<DatePicker {label} {field} {value} {above} {required} disabled={!canManageAssets || inactive} error={fieldErrors[field] ?? ''} open={activeDateField === field} onToggle={() => activeDateField = activeDateField === field ? null : field} onSelect={(selected) => chooseDate(field, selected)} />
{/snippet}

{#snippet searchableSelect(label: string, field: SelectField, options: SelectOption[], required = false, inactive = false)}
	<SearchSelect {label} {field} value={selectedValue(field)} {options} {required} disabled={!canManageAssets || inactive} error={fieldErrors[field] ?? ''} emptyText={text.noOptions} onOpen={() => activeDateField = null} onSelect={(value) => chooseFormSelect(field, value)} />
{/snippet}

{#snippet detailField(label: string, value: string | number | null | undefined)}
	<div><dt>{label}</dt><dd>{value ?? ''}</dd></div>
{/snippet}
{#snippet assetCodeCell(item: Asset)}<strong class="asset-primary">{item.assetTag}</strong>{#if item.notes?.trim()}<small class="asset-secondary asset-note" title={item.notes}>{item.notes}</small>{/if}{/snippet}
{#snippet manufacturerCell(item: Asset)}{item.manufacturer?.name ?? ''}<small class="asset-secondary">{item.modelNumber ?? ''}</small>{/snippet}
{#snippet statusCell(item: Asset)}<span class="status">{item.status.name}</span>{/snippet}
{#snippet pageActions()}{#if canManageAssets}<AddButton label={text.add} onclick={create} />{/if}{/snippet}

<AssetManagementShell title={text.title}>
	<MasterPageHeader title={text.title} description={text.description} actions={pageActions} />
	{#if message}<StatusNotice message={message} tone={messageTone} onDismiss={() => message = ''} />{/if}
	<MasterList bind:this={assetList} endpoint="/v1/it-assets" searchParam="q" title={text.listTitle} listHeading={text.allAssets} description={text.listDescription} initialSortBy="assetTag" pageSizeStorageKey="it-assets-page-size" minTableWidth={1080} actionWidth={4} edgePagination canDetail={true} canEdit={canManageAssets} canDelete={canManageAssets} actionLabel={(item) => (item as Asset).assetTag} loadingLabel={text.loading} emptyLabel={text.empty} columns={[
		{ key: 'assetTag', label: text.assetTag, width: 15, cell: assetCodeCell, searchKeys: ['assetTag', 'notes'] },
		{ key: 'type', label: text.type, width: 10, value: (item) => (item as Asset).type.name, searchKeys: ['type'] },
		{ key: 'manufacturer', label: text.manufacturerModel, width: 17, cell: manufacturerCell, searchKeys: ['manufacturer', 'modelNumber'] },
		{ key: 'branch', label: text.branch, width: 11, value: (item) => (item as Asset).storage.room.branch.name, searchKeys: ['branch'] },
		{ key: 'room', label: text.room, width: 10, value: (item) => (item as Asset).storage.room.name, searchKeys: ['room'] },
		{ key: 'storage', label: text.storage, width: 12, value: (item) => (item as Asset).storage.name, searchKeys: ['storage'] },
		{ key: 'user', label: text.user, width: 12, value: (item) => (item as Asset).assignments[0] ? assigneeName((item as Asset).assignments[0]) : '', searchKeys: ['user'] },
		{ key: 'status', label: text.status, width: 9, cell: statusCell, searchKeys: ['status'] }
	]} onDetail={(item, trigger) => showDetail(item as Asset, trigger)} onEdit={(item, trigger) => edit(item as Asset, trigger)} onDelete={(item) => remove(item as Asset)} />
	{#if open}
		<ModalBackdrop>
			<dialog bind:this={dialogElement} class="asset-dialog app-modal" open aria-modal="true" aria-labelledby="asset-form-title">
				<header><h2 id="asset-form-title">{editing ? (canManageAssets ? text.edit : text.details) : text.add}</h2><button class="modal-close app-modal-close" type="button" aria-label={text.closeForm} disabled={saving} onclick={requestCloseForm}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg></button></header>
				<form class="asset-form app-modal-form" onsubmit={(event) => { event.preventDefault(); void save(); }}>
					<div class="asset-form-body app-modal-form-body">
						{#if formError}<StatusNotice title={text.saveHeading} message={formError} tone="error" onDismiss={() => formError = ''} />{/if}
						<FormSection title={text.basic} framed>
						{@render searchableSelect(text.type, 'typeId', types.map(item => ({ value: String(item.id), label: item.name })), true)}
						<label><span>{text.assetTag} <span class="required" aria-hidden="true">*</span></span><input name="assetTag" value={form.assetTag} maxlength="64" class:invalid={Boolean(fieldErrors.assetTag)} aria-invalid={Boolean(fieldErrors.assetTag)} aria-describedby={fieldErrors.assetTag ? 'assetTag-error' : 'assetTag-hint'} placeholder={codeLoading ? text.preparingCode : text.selectTypePlaceholder} disabled={!canManageAssets || codeLoading} oninput={(event) => updateManagementCode(event.currentTarget.value)}/>{#if fieldErrors.assetTag}<span id="assetTag-error" class="field-error" role="alert">{fieldErrors.assetTag}</span>{:else}<small id="assetTag-hint" class="field-hint">{editing && form.assetTag === editing.assetTag && /-[0-9]{4}$/.test(form.assetTag) ? text.legacyCodeHint : text.codeHint}</small>{/if}</label>
						{@render searchableSelect(text.status, 'statusId', [{ value: '', label: '-' }, ...statuses.map(item => ({ value: String(item.id), label: item.name }))], true)}
						{@render searchableSelect(text.manufacturer, 'manufacturerId', [{ value: '', label: '-' }, ...manufacturers.map(item => ({ value: String(item.id), label: item.name }))])}
						<label>{text.modelNumber}<input bind:value={form.modelNumber} placeholder={text.modelExample} disabled={!canManageAssets}/></label>
						<label>{text.serialNumber}<input name="serialNumber" value={form.serialNumber} oninput={(event) => updateField('serialNumber', event.currentTarget.value)} class:invalid={Boolean(fieldErrors.serialNumber)} aria-invalid={Boolean(fieldErrors.serialNumber)} aria-describedby={fieldErrors.serialNumber ? 'serialNumber-error' : undefined} placeholder={text.serialExample} disabled={!canManageAssets}/>{#if fieldErrors.serialNumber}<span id="serialNumber-error" class="field-error" role="alert">{fieldErrors.serialNumber}</span>{/if}</label>
						</FormSection>
						{#if selectedType?.supportsCpu || selectedType?.supportsRam || selectedType?.supportsOs}
							<FormSection title={text.hardware} framed>
							{#if selectedType?.supportsCpu}{@render searchableSelect(text.cpuType, 'cpuTypeId', [{ value: '', label: '-' }, ...cpus.map(item => ({ value: String(item.id), label: item.name }))])}{/if}
							{#if selectedType?.supportsRam}<label>{text.ramGb}<input name="ramGb" value={form.ramGb} oninput={(event) => updateField('ramGb', event.currentTarget.value)} class:invalid={Boolean(fieldErrors.ramGb)} aria-invalid={Boolean(fieldErrors.ramGb)} aria-describedby={fieldErrors.ramGb ? 'ramGb-error' : undefined} type="number" min="1" step="1" placeholder={text.ramExample} disabled={!canManageAssets}/>{#if fieldErrors.ramGb}<span id="ramGb-error" class="field-error" role="alert">{fieldErrors.ramGb}</span>{/if}</label>{/if}
							{#if selectedType?.supportsOs}{@render searchableSelect(text.operatingSystem, 'operatingSystemId', [{ value: '', label: '-' }, ...systems.map(item => ({ value: String(item.id), label: operatingSystemName(item) }))])}{/if}
							</FormSection>
						{/if}
						<FormSection title={text.network} framed>
						<label>{text.ipAddress1}<input name="ipAddress1" value={form.ipAddress1} oninput={(event) => updateField('ipAddress1', event.currentTarget.value)} maxlength="45" placeholder={text.ip1Example} disabled={!canManageAssets} class:invalid={Boolean(fieldErrors.ipAddress1)} aria-invalid={Boolean(fieldErrors.ipAddress1)} aria-describedby={fieldErrors.ipAddress1 ? 'ipAddress1-error' : undefined}/>{#if fieldErrors.ipAddress1}<span id="ipAddress1-error" class="field-error" role="alert">{fieldErrors.ipAddress1}</span>{/if}</label>
						<label>{text.ipAddress2}<input name="ipAddress2" value={form.ipAddress2} oninput={(event) => updateField('ipAddress2', event.currentTarget.value)} maxlength="45" placeholder={text.ip2Example} disabled={!canManageAssets} class:invalid={Boolean(fieldErrors.ipAddress2)} aria-invalid={Boolean(fieldErrors.ipAddress2)} aria-describedby={fieldErrors.ipAddress2 ? 'ipAddress2-error' : undefined}/>{#if fieldErrors.ipAddress2}<span id="ipAddress2-error" class="field-error" role="alert">{fieldErrors.ipAddress2}</span>{/if}</label>
						<label>{text.hostname}<input name="hostname" value={form.hostname} oninput={(event) => updateField('hostname', event.currentTarget.value)} maxlength="253" placeholder={text.hostnameExample} disabled={!canManageAssets} class:invalid={Boolean(fieldErrors.hostname)} aria-invalid={Boolean(fieldErrors.hostname)} aria-describedby={fieldErrors.hostname ? 'hostname-error' : undefined}/>{#if fieldErrors.hostname}<span id="hostname-error" class="field-error" role="alert">{fieldErrors.hostname}</span>{/if}</label>
						<label>{text.adminUsername}<input name="adminUsername" bind:value={form.adminUsername} maxlength="255" autocomplete="off" disabled={!canManageAssets}/></label>
						<label>{text.loginUsername}<input name="loginUsername" bind:value={form.loginUsername} maxlength="255" autocomplete="off" disabled={!canManageAssets}/></label>
						<label>{text.managementConsoleUsername}<input name="managementConsoleUsername" bind:value={form.managementConsoleUsername} maxlength="255" autocomplete="off" disabled={!canManageAssets}/></label>
						<label class="wide">{text.managementConsoleUrl}<input name="managementConsoleUrl" value={form.managementConsoleUrl} oninput={(event) => updateField('managementConsoleUrl', event.currentTarget.value)} maxlength="2048" type="url" placeholder="https://console.example.local/" disabled={!canManageAssets} class:invalid={Boolean(fieldErrors.managementConsoleUrl)} aria-invalid={Boolean(fieldErrors.managementConsoleUrl)} aria-describedby={fieldErrors.managementConsoleUrl ? 'managementConsoleUrl-error' : undefined}/>{#if fieldErrors.managementConsoleUrl}<span id="managementConsoleUrl-error" class="field-error" role="alert">{fieldErrors.managementConsoleUrl}</span>{/if}</label>
						{#if canWriteAssetCredentials}
							<div class="credential-field"><label>{text.adminPassword}<input name="adminPassword" value={credentialPasswords.admin} oninput={(event) => updateCredentialPassword('admin', event.currentTarget.value)} type="password" maxlength="1024" autocomplete="new-password" placeholder={credentialStatus.admin.configured ? text.keepPassword : text.notConfigured} disabled={credentialClears.admin} aria-invalid={Boolean(fieldErrors.adminPassword)} aria-describedby={fieldErrors.adminPassword ? 'adminPassword-error' : undefined}/>{#if fieldErrors.adminPassword}<span id="adminPassword-error" class="field-error" role="alert">{fieldErrors.adminPassword}</span>{/if}</label>{#if editing && credentialStatus.admin.configured}<label class="clear-credential"><input type="checkbox" bind:checked={credentialClears.admin}/> {text.clearPassword}</label>{/if}</div>
							<div class="credential-field"><label>{text.loginPassword}<input name="loginPassword" value={credentialPasswords.login} oninput={(event) => updateCredentialPassword('login', event.currentTarget.value)} type="password" maxlength="1024" autocomplete="new-password" placeholder={credentialStatus.login.configured ? text.keepPassword : text.notConfigured} disabled={credentialClears.login} aria-invalid={Boolean(fieldErrors.loginPassword)} aria-describedby={fieldErrors.loginPassword ? 'loginPassword-error' : undefined}/>{#if fieldErrors.loginPassword}<span id="loginPassword-error" class="field-error" role="alert">{fieldErrors.loginPassword}</span>{/if}</label>{#if editing && credentialStatus.login.configured}<label class="clear-credential"><input type="checkbox" bind:checked={credentialClears.login}/> {text.clearPassword}</label>{/if}</div>
							<div class="credential-field"><label>{text.consolePassword}<input name="management_consolePassword" value={credentialPasswords.management_console} oninput={(event) => updateCredentialPassword('management_console', event.currentTarget.value)} type="password" maxlength="1024" autocomplete="new-password" placeholder={credentialStatus.management_console.configured ? text.keepPassword : text.notConfigured} disabled={credentialClears.management_console} aria-invalid={Boolean(fieldErrors.management_consolePassword)} aria-describedby={fieldErrors.management_consolePassword ? 'management_consolePassword-error' : undefined}/>{#if fieldErrors.management_consolePassword}<span id="management_consolePassword-error" class="field-error" role="alert">{fieldErrors.management_consolePassword}</span>{/if}</label>{#if editing && credentialStatus.management_console.configured}<label class="clear-credential"><input type="checkbox" bind:checked={credentialClears.management_console}/> {text.clearPassword}</label>{/if}</div>
							{#if credentialsError && !credentialsErrorDismissed}<StatusNotice message={credentialsError} tone="error" onDismiss={() => credentialsErrorDismissed = true} />{/if}
						{/if}
						</FormSection>
						<FormSection title={text.location} framed>
						{@render searchableSelect(text.branch, 'branchId', [{ value: '', label: '-' }, ...branches.map(item => ({ value: String(item.id), label: item.name }))], true)}
						{@render searchableSelect(text.room, 'roomId', [{ value: '', label: '-' }, ...availableRooms.map(item => ({ value: String(item.id), label: item.name }))], true, !branchId)}
						{@render searchableSelect(text.storage, 'storageId', [{ value: '', label: '-' }, ...availableStorage.map(item => ({ value: String(item.id), label: item.name }))], true, !roomId)}
						{@render dateInput(text.purchasedOn, 'purchasedOn', form.purchasedOn, false, true)}
						{@render dateInput(text.disposalOn, 'disposalOn', form.disposalOn, true, selectedStatus?.disposalDatePolicy === 'required', selectedStatus?.disposalDatePolicy === 'prohibited')}
						</FormSection>
						<FormSection title={text.additional} framed>
						<label class="wide">{text.notes}<textarea bind:value={form.notes} placeholder={text.notesExample} disabled={!canManageAssets}></textarea></label>
						</FormSection>
						<FormSection title={text.assign} framed>
						<div class="wide">
							{@render searchableSelect(text.employee, 'assignEmployeeId', [{ value: '', label: text.unassigned }, ...employees.map(employee => ({ value: String(employee.id), label: employeeOptionLabel(employee), searchTerms: [employee.firstName, employee.middleName ?? '', employee.lastName, employee.employeeCode] }))])}
						</div>
						</FormSection>
					</div>
					<footer class="asset-form-footer app-modal-footer"><button class="secondary" type="button" disabled={saving} onclick={requestCloseForm}>{canManageAssets ? common.cancel : common.close}</button>{#if canManageAssets}<button class="app-primary-action save-button" type="submit" disabled={saving || codeLoading || credentialsLoading || (Boolean(editing) && !hasUnsavedChanges)}>{saving ? common.saving : editing ? common.saveChanges : text.add}</button>{/if}</footer>
				</form>
			</dialog>
		</ModalBackdrop>
		{#if confirmingDiscard}<DiscardChangesDialog onContinue={() => confirmingDiscard = false} onDiscard={closeFormImmediately} />{/if}
	{/if}
	{#if detailAsset}
		<DetailModal title={text.detail} titleId="asset-detail-title" closeLabel={text.closeDetail} returnFocus={detailReturnFocus} onClose={closeDetail}>
			<section class="app-detail-section"><h3>{text.basic}</h3><dl class="app-detail-grid">
						{@render detailField(text.assetTag, detailAsset.assetTag)}
						{@render detailField(text.type, detailAsset.type.name)}
						{@render detailField(text.status, detailAsset.status.name)}
						{@render detailField(text.manufacturer, detailAsset.manufacturer?.name)}
						{@render detailField(text.modelNumber, detailAsset.modelNumber)}
						{@render detailField(text.serialNumber, detailAsset.serialNumber)}
			</dl></section>
			{#if detailAsset.type.supportsCpu || detailAsset.type.supportsRam || detailAsset.type.supportsOs}
				<section class="app-detail-section"><h3>{text.hardware}</h3><dl class="app-detail-grid">
							{#if detailAsset.type.supportsCpu}{@render detailField(text.cpuType, detailAsset.cpuType?.name)}{/if}
							{#if detailAsset.type.supportsRam}{@render detailField(text.ramGb, detailAsset.ramGb)}{/if}
							{#if detailAsset.type.supportsOs}{@render detailField(text.operatingSystem, detailAsset.operatingSystem ? operatingSystemName(detailAsset.operatingSystem) : null)}{/if}
				</dl></section>
			{/if}
			<section class="app-detail-section"><h3>{text.location}</h3><dl class="app-detail-grid">
						{@render detailField(text.branch, detailAsset.storage.room.branch.name)}
						{@render detailField(text.room, detailAsset.storage.room.name)}
						{@render detailField(text.storage, detailAsset.storage.name)}
						{@render detailField(text.purchasedOn, formatDate(detailAsset.purchasedOn, $localization))}
						{@render detailField(text.disposalOn, formatDate(detailAsset.disposalOn, $localization))}
						{@render detailField(text.employee, detailAsset.assignments[0] ? assigneeName(detailAsset.assignments[0]) : '')}
						<div class="app-detail-wide"><dt>{text.notes}</dt><dd class="app-detail-notes">{detailAsset.notes ?? ''}</dd></div>
			</dl></section>
			<section class="app-detail-section"><h3>{text.network}</h3><dl class="app-detail-grid">
				{@render detailField(text.ipAddress1, detailAsset.ipAddress1)}
				{@render detailField(text.ipAddress2, detailAsset.ipAddress2)}
				{@render detailField(text.hostname, detailAsset.hostname)}
				{@render detailField(text.adminUsername, detailAsset.adminUsername)}
				{@render detailField(text.loginUsername, detailAsset.loginUsername)}
				{@render detailField(text.managementConsoleUsername, detailAsset.managementConsoleUsername)}
				<div class="app-detail-wide"><dt>{text.managementConsoleUrl}</dt><dd>{#if detailAsset.managementConsoleUrl}<a class="console-link" href={detailAsset.managementConsoleUrl} target="_blank" rel="noopener noreferrer">{detailAsset.managementConsoleUrl}<span class="sr-only">{text.externalWindow}</span></a>{/if}</dd></div>
			</dl>
			{#if canReadAssetCredentials}
				<div class="credential-statuses" aria-label={text.storedCredentials}>
					{#if credentialsLoading}<p>{text.loadingCredentials}</p>{:else if credentialsError}{#if !credentialsErrorDismissed}<StatusNotice message={credentialsError} tone="error" onDismiss={() => credentialsErrorDismissed = true} />{/if}{:else}
						{#each [['admin',text.adminPassword],['login',text.loginPassword],['management_console',text.consolePassword]] as credential}
							{@const type = credential[0] as CredentialType}
							<div><span>{credential[1]}</span><span class:configured={credentialStatus[type].configured}>{credentialStatus[type].configured ? credentialStatusText.configured : credentialStatusText.unconfigured}</span>{#if credentialStatus[type].configured}<button type="button" onclick={() => openCredentialAccess(type)}>{text.reveal}</button>{/if}</div>
						{/each}
					{/if}
				</div>
			{/if}
			</section>
			<ChangeHistorySection entries={changeHistory} loading={historyLoading} error={historyError} fieldLabels={historyFields} dateFields={['purchasedOn','disposalOn']} actionLabels={historyActions} />
		</DetailModal>
	{/if}
	{#if revealType}
		<ModalBackdrop>
			<dialog bind:this={credentialDialogElement} class="credential-dialog app-modal app-modal--compact" open aria-modal="true" aria-labelledby="credential-dialog-title">
				<header><h2 id="credential-dialog-title">{text.revealTitle}</h2><button class="modal-close app-modal-close" type="button" aria-label={text.closePassword} disabled={revealing} onclick={closeCredentialAccess}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg></button></header>
				<div class="credential-dialog-body">
					<p>{text.revealGuidance}</p>
					{#if revealedPassword}<label>{text.storedPassword}<input value={revealedPassword} type="text" readonly autocomplete="off"/></label>{:else}<label>{text.currentPassword}<input bind:value={currentPassword} type="password" maxlength="1024" autocomplete="current-password" onkeydown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void revealCredential(); } }}/></label>{/if}
					{#if revealError}<StatusNotice message={revealError} tone={revealError === text.passwordCopied ? 'success' : 'error'} onDismiss={() => revealError = ''} />{/if}
				</div>
				<footer class="app-modal-footer"><button class="secondary" type="button" disabled={revealing} onclick={closeCredentialAccess}>{common.close}</button>{#if revealedPassword}<button class="app-primary-action" type="button" onclick={() => void copyRevealedPassword()}>{text.copyPassword}</button>{:else}<button class="app-primary-action" type="button" disabled={revealing || !currentPassword} onclick={() => void revealCredential()}>{revealing ? text.verifying : text.reveal}</button>{/if}</footer>
			</dialog>
		</ModalBackdrop>
	{/if}
</AssetManagementShell>

<style>
	.asset-primary{display:block;color:var(--text);font-weight:600}.asset-secondary{display:block;color:var(--muted);font-size:var(--font-size-support)}.asset-note{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.status{display:inline-block;padding:3px 7px;border-radius:10px;background:#1abb9c1c;color:#169f85;font-size:var(--font-size-support)}
	.wide{grid-column:1/-1}
	.credential-field{display:grid;gap:6px}.clear-credential{display:flex;align-items:center;gap:6px;color:var(--muted);font-size:var(--font-size-support)}.clear-credential input{width:14px;height:14px}.console-link{color:var(--action-primary);overflow-wrap:anywhere}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}.credential-statuses{display:grid;gap:8px;margin-top:14px;padding-top:14px;border-top:1px solid var(--border-light)}.credential-statuses>div{display:grid;grid-template-columns:minmax(0,1fr) auto auto;align-items:center;gap:10px;font-size:var(--font-size-support)}.credential-statuses>div>span:nth-child(2){color:var(--muted)}.credential-statuses>div>span.configured{color:var(--success,#169f85)}.credential-statuses button{height:28px;padding:0 10px;border:1px solid var(--action-primary);border-radius:4px;background:transparent;color:var(--action-primary);font-size:var(--font-size-body)}.credential-dialog{width:min(480px,calc(100vw - 32px))}.credential-dialog-body{display:grid;gap:14px;padding:18px 24px 24px}.credential-dialog-body p{margin:0;color:var(--muted);font-size:var(--font-size-support)}.credential-dialog-body label{display:grid;gap:6px;font-size:var(--font-size-support)}.credential-dialog-body input{height:36px;padding:0 10px;border:1px solid var(--border);border-radius:4px;background:var(--surface);color:var(--text)}
</style>
