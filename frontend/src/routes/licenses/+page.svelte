<script lang="ts">
	import '$lib/styles/table-scroll.css';
	import { onMount, tick } from 'svelte';
	import { apiData } from '$lib/api';
	import { localeMessages, formatLocaleTemplate } from '$lib/locale-messages';
	import { localization, formatEmployeeName } from '$lib/localization';
	import AssetManagementShell from '$lib/components/AssetManagementShell.svelte';
	import MasterPageHeader from '$lib/components/MasterPageHeader.svelte';
	import AddButton from '$lib/components/AddButton.svelte';
	import MasterList from '$lib/components/MasterList.svelte';
	import DetailModal from '$lib/components/DetailModal.svelte';
	import DetailActionButtons from '$lib/components/DetailActionButtons.svelte';
	import ModalBackdrop from '$lib/components/ModalBackdrop.svelte';
	import FormSection from '$lib/components/FormSection.svelte';
	import DiscardChangesDialog from '$lib/components/DiscardChangesDialog.svelte';
	import SearchSelect from '$lib/components/SearchSelect.svelte';
	import DatePicker from '$lib/components/DatePicker.svelte';
	import SearchInput from '$lib/components/SearchInput.svelte';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
	import StatusNotice from '$lib/components/StatusNotice.svelte';
	import ChangeHistorySection from '$lib/components/ChangeHistorySection.svelte';
	import SoftwareInstallationsSection from '$lib/components/SoftwareInstallationsSection.svelte';
	import type { ChangeHistoryEntry } from '$lib/change-history';
	import { formSnapshot } from '$lib/modalForm';
	import { currencyOptions, isFinancialCurrency } from '$lib/financial-currency';

	let text = $derived(localeMessages[$localization.displayLanguage].software);
	let common = $derived(localeMessages[$localization.displayLanguage].common);
	type Product = { id: number; name: string; manufacturer: string; edition: string | null; version: string | null; productCode: string | null; notes: string | null };
	type Terms = { usersPerLicense: number | null; devicesPerUser: number | null; usersPerDevice: number | null; concurrentLimit: number | null; evidenceStatus: 'confirmed' | 'unverified'; termsReference: string | null; notes: string | null };
	type Metrics = { countingUnit: string; allocated: number; capacity: number | null; remaining: number | null; overage: number | null; observedInstallations: number; observedUsers: number; unmatchedRecords: number; overLimitDevices: number; overLimitUsers: number; missingObservation: boolean; daysToRenewal: number | null; status: string };
	type Contract = { id: number; productId: number; reference: string; licenseType: 'user' | 'device' | 'concurrent'; purchasedQuantity: number; startsOn: string; endsOn: string | null; renewsOn: string | null; autoRenew: boolean; vendor: string | null; orderNumber: string | null; amount: string | null; currency: string | null; evidenceReference: string | null; notes: string | null; product: Product; terms: Terms | null; metrics: Metrics };
	type Key = { id: number; label: string | null; lastFour: string; activationLimit: number | null; expiresOn: string | null; notes: string | null };
	type Assignment = { id: number; assignmentNo: number; employeeId: number | null; assetId: number | null; keyId: number | null; assignedOn: string; plannedReleaseOn: string | null; releasedOn: string | null; releaseReason: string | null; deactivatedOn: string | null; notes: string | null; employee: { id: number; employeeCode: string; firstName: string; middleName: string | null; lastName: string } | null; asset: { id: number; assetTag: string } | null };
	type History = { id: number; action: string; changes: unknown; changedAt: string; actor: { firstName: string; middleName: string | null; lastName: string } };
	type Target = { id: number; employeeCode?: string; firstName?: string; middleName?: string | null; lastName?: string; assetTag?: string };
	const today = () => new Date().toISOString().slice(0, 10);
	const blankProduct = () => ({ name: '', manufacturer: '', edition: '', version: '', productCode: '', notes: '' });
	const blankContract = () => ({ productId: '', reference: '', licenseType: 'user' as Contract['licenseType'], purchasedQuantity: '1', startsOn: today(), endsOn: '', renewsOn: '', autoRenew: false, vendor: '', orderNumber: '', amount: '', currency: '', evidenceReference: '', notes: '', usersPerLicense: '1', devicesPerUser: '', usersPerDevice: '', concurrentLimit: '', evidenceStatus: 'unverified' as Terms['evidenceStatus'], termsReference: '', termsNotes: '' });
	const blankKey = () => ({ key: '', label: '', activationLimit: '', expiresOn: '', notes: '' });
	const blankAssignment = () => ({ targetId: '', keyId: '', assignedOn: today(), plannedReleaseOn: '', notes: '' });
	const blankRelease = () => ({ releasedOn: today(), releaseReason: '', deactivatedOn: '' });

	let productList = $state<MasterList>();
	let contractList = $state<MasterList>();
	let productChoices = $state<Product[]>([]);
	let selected = $state<Contract | null>(null);
	let selectedProduct = $state<Product | null>(null);
	let activeDetail = $state<'product' | 'contract' | null>(null);
	let detailReturnFocus = $state<HTMLElement | null>(null);
	let productHistory = $state<History[]>([]);
	let keys = $state<Key[]>([]);
	let assignments = $state<Assignment[]>([]);
	let history = $state<History[]>([]);
	let targets = $state<Target[]>([]);
	let targetSearch = $state('');
	let targetSearchTimer: ReturnType<typeof setTimeout> | null = null;
	let targetRequest = 0;
	let alerts = $state<Contract[]>([]);
	let canManage = $state(false);
	let canDeleteProducts = $state(false);
	let canDeleteContracts = $state(false);
	let canReadKeys = $state(false);
	let canWriteKeys = $state(false);
	let usageCapabilities = $state({ canCreateSoftwareInstallations: false, canEndSoftwareInstallations: false, canCreateSoftwareUsage: false, canEndSoftwareUsage: false });
	let loading = $state(true);
	let saving = $state(false);
	let error = $state('');
	let notice = $state('');
	let editor = $state<'product' | 'contract' | 'key' | 'assignment' | 'release' | null>(null);
	let editorReturnFocus = $state<HTMLElement | null>(null);
	let editorReturnDetail = $state<'product' | 'contract' | null>(null);
	let restoreDetailEditFocus = $state(false);
	let openEditorDate = $state<string | null>(null);
	let editorDialogElement = $state<HTMLDialogElement>();
	let fieldErrors = $state<Record<string, string>>({});
	let confirmingDiscard = $state(false);
	let initialEditorSnapshot = $state('');
	let editingProduct = $state<Product | null>(null);
	let editingContract = $state<Contract | null>(null);
	let editingKey = $state<Key | null>(null);
	let releasing = $state<Assignment | null>(null);
	let productForm = $state(blankProduct());
	let contractForm = $state(blankContract());
	let keyForm = $state(blankKey());
	let assignmentForm = $state(blankAssignment());
	let releaseForm = $state(blankRelease());
	let revealKeyId = $state<number | null>(null);
	let currentPassword = $state('');
	let revealedKey = $state('');
	let revealError = $state('');
	let revealTimer: ReturnType<typeof setTimeout> | null = null;
	let detailRequest = 0;
	let historyFields = $derived<Record<string, string>>({ name: text.name, manufacturer: text.manufacturer, edition: text.edition, version: text.version, productCode: text.productCode, notes: text.notes, reference: text.reference, licenseType: text.licenseType, purchasedQuantity: text.purchasedQuantity, startsOn: text.startsOn, endsOn: text.endsOn, renewsOn: text.renewsOn, usersPerLicense: text.usersPerLicense, devicesPerUser: text.devicesPerUser, usersPerDevice: text.usersPerDevice, evidenceStatus: text.evidenceStatus, termsReference: text.termsReference, assignmentNo: text.assignmentNumber, assignedOn: text.assignedOn, releasedOn: text.releasedOn, releaseReason: text.releaseReason, deactivatedOn: text.deactivatedOn, installationNo: text.installationNumber, installedOn: text.installedOn, removedOn: text.removedOn, startedOn: text.startedOn, endedOn: text.endedOn, label: text.keyLabel, lastFour: text.key, activationLimit: text.activationLimit, expiresOn: text.keyExpiresOn });
	let historyActions = $derived<Record<string, string>>({ create: common.created, update: common.updated, delete: common.deleted, assign: text.assign, release: text.release, add_key: text.keyAdded, update_key: text.keyUpdated, install: text.addInstallation, remove_installation: text.endInstallation, record_usage: text.addUsage, end_usage: text.endUsage });
	const hiddenHistoryFields = new Set(['id', 'productId', 'contractId', 'keyId', 'employeeId', 'assetId', 'catalogKey']);
	function historyObject(value: unknown): Record<string, unknown> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
	function flattenHistory(value: unknown): Record<string, string | null> {
		const output: Record<string, string | null> = {};
		for (const [field, raw] of Object.entries(historyObject(value))) {
			if (hiddenHistoryFields.has(field)) continue;
			if (field === 'terms') Object.assign(output, flattenHistory(raw));
			else if (raw === null) output[field] = null;
			else if (typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean') output[field] = String(raw);
		}
		return output;
	}
	function historyEntry(entry: History): ChangeHistoryEntry {
		const raw = historyObject(entry.changes);
		const before = flattenHistory(raw.before);
		const after = flattenHistory(raw.after ?? raw);
		const fields = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(field => field in historyFields && before[field] !== after[field]);
		return { id: entry.id, changedAt: entry.changedAt, action: entry.action, actor: entry.actor, changes: fields.map(field => ({ field, before: before[field] ?? null, after: after[field] ?? null })) };
	}
	let contractHistoryEntries = $derived(history.map(historyEntry));
	let productHistoryEntries = $derived(productHistory.map(historyEntry));

	function date(value: string | null) { return value ? value.slice(0, 10) : ''; }
	function statusLabel(value: string) { return ({ compliant: text.compliant, overallocated: text.overallocated, expired: text.expired, not_started: text.notStarted, needs_review: text.needsReview, pending_measurement: text.pendingMeasurement } as Record<string, string>)[value] ?? text.needsReview; }
	function typeLabel(value: string) { return value === 'user' ? text.userLicense : value === 'device' ? text.deviceLicense : text.concurrentLicense; }
	function count(value: number | null) { return value === null ? '' : String(value); }
	function renewal(value: Metrics) { return value.daysToRenewal === null ? '' : value.daysToRenewal < 0 ? formatLocaleTemplate(text.daysOverdue, Math.abs(value.daysToRenewal)) : formatLocaleTemplate(text.daysRemaining, value.daysToRenewal); }
	function targetName(item: Assignment) { return item.employee ? `${formatEmployeeName(item.employee, $localization)} (${item.employee.employeeCode})` : item.asset?.assetTag ?? ''; }
	function targetOption(item: Target) { return item.assetTag ?? `${formatEmployeeName({ firstName: item.firstName ?? '', middleName: item.middleName ?? null, lastName: item.lastName ?? '' }, $localization)} (${item.employeeCode ?? ''})`; }
	async function loadAlerts() {
		const collected: Contract[] = [];
		for (let offset = 0; ; offset += 500) {
			const response = await fetch(`/v1/software-renewal-alerts?limit=500&offset=${offset}`);
			if (!response.ok) throw new Error(text.loadFailed);
			const page = await apiData<Contract[]>(response);
			collected.push(...page);
			if (page.length < 500) break;
		}
		alerts = collected;
	}
	async function loadProductChoices() {
		const collected: Product[] = [];
		for (let offset = 0; ; offset += 500) {
			const response = await fetch(`/v1/software-products?limit=500&offset=${offset}`);
			if (!response.ok) throw new Error(text.loadFailed);
			const page = await apiData<Product[]>(response);
			collected.push(...page);
			if (page.length < 500) break;
		}
		productChoices = collected;
	}
	async function loadDetail(id: number, open = true, focusReturn?: HTMLElement) {
		const requestId = ++detailRequest;
		if (open) restoreDetailEditFocus = false;
		if (open && !editor) { error = ''; notice = ''; }
		if (open && !editor) detailReturnFocus = focusReturn ?? document.activeElement as HTMLElement;
		clearReveal();
		const responses = await Promise.all([
			fetch(`/v1/software-contracts/${id}`),
			fetch(`/v1/software-contracts/${id}/keys?limit=500`),
			fetch(`/v1/software-contracts/${id}/assignments?limit=500&sortOrder=desc`),
			fetch(`/v1/software-history?resource=software_contract&resourceId=${id}&limit=100&sortOrder=desc`)
		]);
		if (requestId !== detailRequest) return;
		if (responses.some(response => !response.ok)) { error = text.loadFailed; return; }
		const [contract, keyItems, assignmentItems, historyItems] = await Promise.all(responses.map(response => apiData<unknown>(response)));
		if (requestId !== detailRequest) return;
		selected = contract as Contract;
		keys = keyItems as Key[];
		assignments = assignmentItems as Assignment[];
		history = historyItems as History[];
		if (open) activeDetail = 'contract';
	}
	async function loadProductDetail(product: Product, focusReturn?: HTMLElement) {
		error = ''; notice = '';
		restoreDetailEditFocus = false;
		detailReturnFocus = focusReturn ?? document.activeElement as HTMLElement;
		const response = await fetch(`/v1/software-history?resource=software_product&resourceId=${product.id}&limit=100&sortOrder=desc`);
		if (!response.ok) { error = text.loadFailed; return; }
		productHistory = await apiData<History[]>(response);
		selectedProduct = product;
		activeDetail = 'product';
	}
	function closeDetail() { activeDetail = null; error = ''; notice = ''; clearReveal(); }
	async function loadTargets() {
		if (!selected) return;
		const request = ++targetRequest;
		const kind = selected.licenseType === 'user' ? 'employee' : 'asset';
		const response = await fetch(`/v1/software-assignment-targets?kind=${kind}&limit=100&q=${encodeURIComponent(targetSearch)}`);
		if (!response.ok) throw new Error(text.loadFailed);
		const items = await apiData<Target[]>(response);
		if (request === targetRequest) targets = items;
	}
	function searchTargets(value: string) { targetSearch = value; if (targetSearchTimer) clearTimeout(targetSearchTimer); targetSearchTimer = setTimeout(() => { void loadTargets().catch(() => error = text.loadFailed); }, 350); }
	async function initialize() {
		loading = true;
		try {
			const session = await fetch('/v1/auth/session');
			if (!session.ok) { error = text.signInRequired; return; }
			const data = await apiData<{ user: { capabilities: { canReadSoftware: boolean; canManageSoftware: boolean; canDeleteSoftwareProducts: boolean; canDeleteSoftwareContracts: boolean; canReadSoftwareKeys: boolean; canWriteSoftwareKeys: boolean; canCreateSoftwareInstallations: boolean; canEndSoftwareInstallations: boolean; canCreateSoftwareUsage: boolean; canEndSoftwareUsage: boolean } } }>(session);
			if (!data.user.capabilities.canReadSoftware) { error = text.noAccess; return; }
			canManage = data.user.capabilities.canManageSoftware;
			canDeleteProducts = data.user.capabilities.canDeleteSoftwareProducts;
			canDeleteContracts = data.user.capabilities.canDeleteSoftwareContracts;
			canReadKeys = data.user.capabilities.canReadSoftwareKeys;
			canWriteKeys = data.user.capabilities.canWriteSoftwareKeys;
			usageCapabilities = { canCreateSoftwareInstallations: data.user.capabilities.canCreateSoftwareInstallations, canEndSoftwareInstallations: data.user.capabilities.canEndSoftwareInstallations, canCreateSoftwareUsage: data.user.capabilities.canCreateSoftwareUsage, canEndSoftwareUsage: data.user.capabilities.canEndSoftwareUsage };
			await Promise.all([loadAlerts(), loadProductChoices()]);
		} catch { error = text.loadFailed; }
		finally { loading = false; }
	}
	onMount(() => { void initialize(); return () => { clearReveal(); if (targetSearchTimer) clearTimeout(targetSearchTimer); }; });
	function editorSnapshot() { return formSnapshot({ editor, productForm, contractForm, keyForm, assignmentForm, releaseForm, targetSearch }); }
	let hasDraftChanges = $derived(Boolean(editor) && initialEditorSnapshot !== editorSnapshot());
	function closeEditor(restoreFocus = true) { if (saving) return; if (targetSearchTimer) { clearTimeout(targetSearchTimer); targetSearchTimer = null; } ++targetRequest; const focusReturn = editorReturnFocus; const returnDetail = editorReturnDetail; editor = null; openEditorDate = null; editingProduct = null; editingContract = null; editingKey = null; releasing = null; fieldErrors = {}; confirmingDiscard = false; error = ''; editorReturnDetail = null; if (restoreFocus) { restoreDetailEditFocus = returnDetail === 'contract'; activeDetail = returnDetail; if (!returnDetail) void tick().then(() => focusReturn?.isConnected && focusReturn.focus()); } }
	function requestCloseEditor(fromEscape = false) { if (saving) return; if (hasDraftChanges && (fromEscape || Boolean(editingProduct || editingContract || editingKey))) confirmingDiscard = true; else closeEditor(); }
	function toggleEditorDate(field: string) { openEditorDate = openEditorDate === field ? null : field; }
	function focusEditor(focusReturn?: HTMLElement | null) { notice = ''; editorReturnDetail = activeDetail; editorReturnFocus = focusReturn ?? document.activeElement as HTMLElement; activeDetail = null; fieldErrors = {}; initialEditorSnapshot = editorSnapshot(); void tick().then(() => requestAnimationFrame(() => editorDialogElement?.querySelector<HTMLElement>('.form-select-trigger, input, textarea')?.focus())); }
	function clearFieldError(field: string) { if (!fieldErrors[field]) return; const next = { ...fieldErrors }; delete next[field]; fieldErrors = next; if (!Object.keys(next).length) error = ''; }
	function focusField(field: string) { const target = editorDialogElement?.querySelector<HTMLElement>(`.form-select-picker[data-field="${field}"] .form-select-trigger, .custom-date[data-field="${field}"] .date-trigger, [name="${field}"]`); target?.scrollIntoView({ block: 'nearest' }); target?.focus(); }
	function showFieldErrors(fields: Record<string, string>) { fieldErrors = fields; error = text.correctFields; void tick().then(() => focusField(Object.keys(fields)[0])); }
	function requiredError(label: string) { return formatLocaleTemplate(text.requiredField, label); }
	function validateEditor() {
		const fields: Record<string, string> = {};
		const required = (field: string, label: string, value: string) => { if (!value.trim()) fields[field] = requiredError(label); };
		const positive = (field: string, label: string, value: string, optional = false) => { const input = String(value ?? '').trim(); if (!input && optional) return; if (!/^\d+$/.test(input) || Number(input) < 1 || Number(input) > 1000000) fields[field] = formatLocaleTemplate(text.positiveNumber, label); };
		if (editor === 'product') { required('name', text.name, productForm.name); required('manufacturer', text.manufacturer, productForm.manufacturer); }
		if (editor === 'contract') {
			required('productId', text.product, contractForm.productId); required('reference', text.reference, contractForm.reference); required('licenseType', text.licenseType, contractForm.licenseType); positive('purchasedQuantity', text.purchasedQuantity, contractForm.purchasedQuantity); required('startsOn', text.startsOn, contractForm.startsOn);
			if (contractForm.licenseType === 'user') { positive('usersPerLicense', text.usersPerLicense, contractForm.usersPerLicense); positive('devicesPerUser', text.devicesPerUser, contractForm.devicesPerUser, true); }
			if (contractForm.licenseType === 'device') positive('usersPerDevice', text.usersPerDevice, contractForm.usersPerDevice, true);
			if (contractForm.licenseType === 'concurrent') positive('concurrentLimit', text.concurrentLimit, contractForm.concurrentLimit, true);
			if (contractForm.amount && (!/^\d{1,14}(?:\.\d{1,2})?$/.test(contractForm.amount))) fields.amount = formatLocaleTemplate(text.invalidValue, text.amount);
			if (contractForm.currency && !isFinancialCurrency(contractForm.currency)) fields.currency = formatLocaleTemplate(text.invalidValue, text.currency);
			if (contractForm.endsOn && contractForm.endsOn < contractForm.startsOn) fields.endsOn = text.endBeforeStart;
			if (contractForm.renewsOn && contractForm.renewsOn < contractForm.startsOn) fields.renewsOn = text.renewBeforeStart;
			if (Boolean(contractForm.amount) !== Boolean(contractForm.currency)) fields[contractForm.amount ? 'currency' : 'amount'] = text.amountCurrencyPair;
			if (contractForm.evidenceStatus === 'confirmed' && !contractForm.termsReference.trim() && !contractForm.evidenceReference.trim()) fields.termsReference = text.termsSourceRequired;
		}
		if (editor === 'key') { if (!editingKey) required('key', text.key, keyForm.key); if (keyForm.key && keyForm.key.length < 4) fields.key = text.keyTooShort; positive('activationLimit', text.activationLimit, keyForm.activationLimit, true); }
		if (editor === 'assignment') { required('targetId', text.target, assignmentForm.targetId); required('assignedOn', text.assignedOn, assignmentForm.assignedOn); }
		if (editor === 'release') required('releasedOn', text.releasedOn, releaseForm.releasedOn);
		return fields;
	}
	function editorKeydown(event: KeyboardEvent) {
		if (event.defaultPrevented || !editor || confirmingDiscard || !editorDialogElement) return;
		if (event.key === 'Escape') { event.preventDefault(); if (openEditorDate) { openEditorDate = null; return; } requestCloseEditor(true); return; }
		if (event.key !== 'Tab') return;
		const focusable = [...editorDialogElement.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled)')].filter((element) => element.tabIndex >= 0 && element.getClientRects().length > 0);
		const first = focusable[0], last = focusable.at(-1);
		if (!first || !last) return;
		if (!editorDialogElement.contains(document.activeElement)) { event.preventDefault(); (event.shiftKey ? last : first).focus(); }
		else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
		else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
	}
	function clearReveal() { if (revealTimer) clearTimeout(revealTimer); revealTimer = null; revealKeyId = null; currentPassword = ''; revealedKey = ''; revealError = ''; }
	function openProduct(item: Product | null = null, focusReturn?: HTMLElement | null) { closeEditor(false); editingProduct = item; productForm = item ? { name: item.name, manufacturer: item.manufacturer, edition: item.edition ?? '', version: item.version ?? '', productCode: item.productCode ?? '', notes: item.notes ?? '' } : blankProduct(); editor = 'product'; focusEditor(focusReturn); }
	function openContract(item: Contract | null = null, focusReturn?: HTMLElement | null) {
		closeEditor(false); editingContract = item;
		contractForm = item ? { productId: String(item.productId), reference: item.reference, licenseType: item.licenseType, purchasedQuantity: String(item.purchasedQuantity), startsOn: date(item.startsOn), endsOn: date(item.endsOn), renewsOn: date(item.renewsOn), autoRenew: item.autoRenew, vendor: item.vendor ?? '', orderNumber: item.orderNumber ?? '', amount: item.amount ?? '', currency: item.currency ?? '', evidenceReference: item.evidenceReference ?? '', notes: item.notes ?? '', usersPerLicense: String(item.terms?.usersPerLicense ?? 1), devicesPerUser: String(item.terms?.devicesPerUser ?? ''), usersPerDevice: String(item.terms?.usersPerDevice ?? ''), concurrentLimit: String(item.terms?.concurrentLimit ?? ''), evidenceStatus: item.terms?.evidenceStatus ?? 'unverified', termsReference: item.terms?.termsReference ?? '', termsNotes: item.terms?.notes ?? '' } : blankContract();
		editor = 'contract'; focusEditor(focusReturn);
	}
	function openKey(item: Key | null = null) { closeEditor(false); editingKey = item; keyForm = item ? { key: '', label: item.label ?? '', activationLimit: String(item.activationLimit ?? ''), expiresOn: date(item.expiresOn), notes: item.notes ?? '' } : blankKey(); editor = 'key'; focusEditor(); }
	function openAssignment() { closeEditor(false); assignmentForm = blankAssignment(); targetSearch = ''; targets = []; editor = 'assignment'; void loadTargets().catch(() => error = text.loadFailed); focusEditor(); }
	function openRelease(item: Assignment) { closeEditor(false); releasing = item; releaseForm = blankRelease(); editor = 'release'; focusEditor(); }
	async function send(path: string, method: string, body: unknown) {
		const response = await fetch(path, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
		if (!response.ok) {
			const payload = await response.json().catch(() => null) as { error?: { code?: string; details?: { field?: string; reason?: string }[] } } | null;
			const mapped: Record<string, string> = {};
			const labels: Record<string, string> = { name: text.name, manufacturer: text.manufacturer, productId: text.product, reference: text.reference, licenseType: text.licenseType, purchasedQuantity: text.purchasedQuantity, startsOn: text.startsOn, endsOn: text.endsOn, renewsOn: text.renewsOn, amount: text.amount, currency: text.currency, usersPerLicense: text.usersPerLicense, devicesPerUser: text.devicesPerUser, usersPerDevice: text.usersPerDevice, concurrentLimit: text.concurrentLimit, termsReference: text.termsReference, key: text.key, activationLimit: text.activationLimit, targetId: text.target, assignedOn: text.assignedOn, releasedOn: text.releasedOn };
			for (const detail of payload?.error?.details ?? []) if (detail.field && labels[detail.field]) mapped[detail.field] = formatLocaleTemplate(text.invalidValue, labels[detail.field]);
			if (response.status === 409 && editor === 'product') mapped.name = text.duplicateProduct;
			if (response.status === 409 && editor === 'contract') mapped.reference = text.duplicateContract;
			if (payload?.error?.code === 'TERMS_SOURCE_REQUIRED') mapped.termsReference = text.termsSourceRequired;
			if (payload?.error?.code === 'INVALID_DATE_RANGE') mapped[contractForm.endsOn && contractForm.endsOn < contractForm.startsOn ? 'endsOn' : 'renewsOn'] = contractForm.endsOn && contractForm.endsOn < contractForm.startsOn ? text.endBeforeStart : text.renewBeforeStart;
			if (Object.keys(mapped).length) showFieldErrors(mapped);
			else error = text.saveFailed;
			throw new Error('save_failed');
		}
		return response;
	}
	async function save(event: SubmitEvent) {
		event.preventDefault();
		if (!editor || saving) return;
		const validationErrors = validateEditor();
		if (Object.keys(validationErrors).length) { showFieldErrors(validationErrors); return; }
		saving = true; error = ''; notice = '';
		try {
			if (editor === 'product') {
				await send(editingProduct ? `/v1/software-products/${editingProduct.id}` : '/v1/software-products', editingProduct ? 'PATCH' : 'POST', productForm);
				await Promise.all([productList?.refresh(), loadProductChoices()]);
			} else if (editor === 'contract') {
				const body = { ...contractForm, productId: Number(contractForm.productId), purchasedQuantity: Number(contractForm.purchasedQuantity), usersPerLicense: contractForm.licenseType === 'user' ? Number(contractForm.usersPerLicense) : null, devicesPerUser: contractForm.licenseType === 'user' && contractForm.devicesPerUser ? Number(contractForm.devicesPerUser) : null, usersPerDevice: contractForm.licenseType === 'device' && contractForm.usersPerDevice ? Number(contractForm.usersPerDevice) : null, concurrentLimit: contractForm.licenseType === 'concurrent' && contractForm.concurrentLimit ? Number(contractForm.concurrentLimit) : null, amount: contractForm.amount === '' ? null : contractForm.amount, currency: contractForm.currency.toUpperCase() };
				await send(editingContract ? `/v1/software-contracts/${editingContract.id}` : '/v1/software-contracts', editingContract ? 'PATCH' : 'POST', body);
				await Promise.all([contractList?.refresh(), loadAlerts()]);
				if (editingContract && selected?.id === editingContract.id) await loadDetail(editingContract.id, false);
			} else if (editor === 'key' && selected) {
				const body = { ...keyForm, activationLimit: keyForm.activationLimit ? Number(keyForm.activationLimit) : null, ...(editingKey && !keyForm.key ? { key: undefined } : {}) };
				await send(editingKey ? `/v1/software-contracts/${selected.id}/keys/${editingKey.id}` : `/v1/software-contracts/${selected.id}/keys`, editingKey ? 'PUT' : 'POST', body);
				await loadDetail(selected.id);
			} else if (editor === 'assignment' && selected) {
				await send(`/v1/software-contracts/${selected.id}/assignments`, 'POST', { employeeId: selected.licenseType === 'user' ? Number(assignmentForm.targetId) : null, assetId: selected.licenseType === 'device' ? Number(assignmentForm.targetId) : null, keyId: assignmentForm.keyId ? Number(assignmentForm.keyId) : null, assignedOn: assignmentForm.assignedOn, plannedReleaseOn: assignmentForm.plannedReleaseOn, notes: assignmentForm.notes });
				await Promise.all([loadDetail(selected.id), contractList?.refresh()]);
			} else if (editor === 'release' && selected && releasing) {
				await send(`/v1/software-contracts/${selected.id}/assignments/${releasing.id}`, 'PATCH', releaseForm);
				await Promise.all([loadDetail(selected.id), contractList?.refresh()]);
			}
			const refreshError = error;
			saving = false; closeEditor(); notice = text.saved; error = refreshError;
		} catch { if (!error) error = text.saveFailed; }
		finally { saving = false; }
	}
	async function reveal(keyId: number) {
		if (!selected) return;
		revealError = ''; revealedKey = '';
		try {
			const response = await send(`/v1/software-contracts/${selected.id}/keys/${keyId}/revelations`, 'POST', { currentPassword });
			const payload = await apiData<{ key: string }>(response);
			revealedKey = payload.key; currentPassword = '';
			if (revealTimer) clearTimeout(revealTimer);
			revealTimer = setTimeout(clearReveal, 30000);
		} catch { revealError = text.keyNotAvailable; currentPassword = ''; }
	}
	async function removeProduct(item: Product) {
		if (!canDeleteProducts || !confirm(formatLocaleTemplate(text.deleteConfirm, item.name))) return;
		if (selectedProduct?.id === item.id) closeDetail();
		const response = await fetch(`/v1/software-products/${item.id}`, { method: 'DELETE' });
		if (!response.ok) { error = response.status === 409 ? text.deleteProductInUse : response.status === 403 ? text.deleteForbidden : text.deleteFailed; return; }
		await Promise.all([productList?.refresh(), loadProductChoices()]);
		notice = text.deleted;
	}
	async function removeContract(item: Contract) {
		if (!canDeleteContracts || !confirm(formatLocaleTemplate(text.deleteConfirm, `${item.product.name} · ${item.reference}`))) return;
		if (selected?.id === item.id) closeDetail();
		const response = await fetch(`/v1/software-contracts/${item.id}`, { method: 'DELETE' });
		if (!response.ok) { error = response.status === 409 ? text.deleteContractInUse : response.status === 403 ? text.deleteForbidden : text.deleteFailed; return; }
		await Promise.all([contractList?.refresh(), loadAlerts()]);
		notice = text.deleted;
	}
</script>

{#snippet detailMessages()}
	{#if error}<StatusNotice message={error} tone="error" onDismiss={() => error = ''} />{/if}
	{#if notice}<StatusNotice message={notice} tone="success" onDismiss={() => notice = ''} />{/if}
{/snippet}

<svelte:window onkeydown={editorKeydown} />

<AssetManagementShell title={text.title}>
<div class="software-page">
	<MasterPageHeader title={text.title} description={text.description} />
	{#if error && !editor && !activeDetail}<StatusNotice message={error} tone="error" onDismiss={() => error = ''} />{/if}
	{#if notice && !editor && !activeDetail}<StatusNotice message={notice} tone="success" onDismiss={() => notice = ''} />{/if}
	{#if loading}<LoadingSpinner label={text.loading} />{:else}
		<section class="software-card" aria-labelledby="renewal-title">
			<h2 id="renewal-title">{text.renewalAlerts}</h2><p class="help">{text.renewalAlertDescription}</p>
			{#if alerts.length === 0}<p class="empty">{text.noAlerts}</p>{:else}<ul class="alert-list">{#each alerts as item}<li><button type="button" onclick={() => void loadDetail(item.id)}>{item.product.name} · {item.reference}</button><span class:overdue={item.metrics.daysToRenewal !== null && item.metrics.daysToRenewal < 0}>{renewal(item.metrics)}</span></li>{/each}</ul>{/if}
		</section>
		{#snippet productActions()}{#if canManage}<AddButton label={text.addProduct} onclick={() => openProduct()} />{/if}{/snippet}
		<MasterList bind:this={productList} endpoint="/v1/software-products" searchParam="q" title={text.products} listHeading={text.products} description="" initialSortBy="name" pageSizeStorageKey="software-products-page-size" sortStorageKey="software-products-sort" minTableWidth={650} canDetail actionLabel={(item) => (item as Product).name} headerActions={productActions} loadingLabel={text.loading} emptyLabel={text.noProducts} columns={[
			{ key: 'name', label: text.name, width: 28, value: (item) => (item as Product).name },
			{ key: 'manufacturer', label: text.manufacturer, width: 27, value: (item) => (item as Product).manufacturer },
			{ key: 'edition', label: text.edition, width: 19, sortable: false, value: (item) => (item as Product).edition },
			{ key: 'version', label: text.version, width: 19, sortable: false, value: (item) => (item as Product).version }
		]} onDetail={(item, trigger) => void loadProductDetail(item as Product, trigger ?? undefined)} />
		{#if selectedProduct && activeDetail === 'product' && !editor}
			<DetailModal title={selectedProduct.name} titleId="product-detail-title" closeLabel={text.close} returnFocus={detailReturnFocus} compact onClose={closeDetail}>
				{#snippet headerActions()}<DetailActionButtons editLabel={text.editProduct} deleteLabel={common.delete} onEdit={canManage ? () => openProduct(selectedProduct) : undefined} onDelete={canDeleteProducts ? () => void removeProduct(selectedProduct!) : undefined} />{/snippet}
				{@render detailMessages()}
				<section class="app-detail-section"><h3>{common.basicInformation}</h3><dl class="app-detail-grid">
					<div><dt>{text.manufacturer}</dt><dd>{selectedProduct.manufacturer}</dd></div>
					<div><dt>{text.edition}</dt><dd>{selectedProduct.edition ?? ''}</dd></div>
					<div><dt>{text.version}</dt><dd>{selectedProduct.version ?? ''}</dd></div>
					<div><dt>{text.productCode}</dt><dd>{selectedProduct.productCode ?? ''}</dd></div>
					<div class="app-detail-wide"><dt>{text.notes}</dt><dd class="app-detail-notes">{selectedProduct.notes ?? ''}</dd></div>
				</dl></section>
				<ChangeHistorySection entries={productHistoryEntries} fieldLabels={historyFields} actionLabels={historyActions} />
			</DetailModal>
		{/if}
		{#snippet contractActions()}{#if canManage}<AddButton label={text.addContract} onclick={() => openContract()} disabled={productChoices.length === 0} />{/if}{/snippet}
		{#snippet contractStatusCell(item: Contract)}<span class="status" data-status={item.metrics.status}>{statusLabel(item.metrics.status)}</span>{/snippet}
		<MasterList bind:this={contractList} endpoint="/v1/software-contracts" searchParam="q" title={text.contracts} listHeading={text.contracts} description="" initialSortBy="reference" pageSizeStorageKey="software-contracts-page-size" sortStorageKey="software-contracts-sort" minTableWidth={900} canDetail actionLabel={(item) => `${(item as Contract).product.name} · ${(item as Contract).reference}`} headerActions={contractActions} loadingLabel={text.loading} emptyLabel={text.noContracts} columns={[
			{ key: 'product', label: text.product, width: 16, sortable: false, value: (item) => (item as Contract).product.name },
			{ key: 'reference', label: text.reference, width: 19, value: (item) => (item as Contract).reference },
			{ key: 'licenseType', label: text.licenseType, width: 13, sortable: false, value: (item) => typeLabel((item as Contract).licenseType) },
			{ key: 'allocated', label: text.allocated, width: 10, sortable: false, value: (item) => (item as Contract).metrics.allocated },
			{ key: 'remaining', label: text.remaining, width: 10, sortable: false, value: (item) => count((item as Contract).metrics.remaining) },
			{ key: 'renewsOn', label: text.renewal, width: 14, value: (item) => renewal((item as Contract).metrics) },
			{ key: 'status', label: text.complianceStatus, width: 13, sortable: false, cell: contractStatusCell }
		]} onDetail={(item, trigger) => void loadDetail(item.id, true, trigger ?? undefined)} />
		{#if selected && activeDetail === 'contract' && !editor}
			<DetailModal title={`${selected.product.name} · ${selected.reference}`} titleId="detail-title" closeLabel={text.close} returnFocus={detailReturnFocus} initialFocusSelector={restoreDetailEditFocus && canManage ? '.detail-header-edit' : '.app-modal-close'} onClose={closeDetail}>
				{#snippet headerActions()}<DetailActionButtons editLabel={text.editContract} deleteLabel={common.delete} onEdit={canManage ? () => openContract(selected) : undefined} onDelete={canDeleteContracts ? () => void removeContract(selected!) : undefined} />{/snippet}
				{@render detailMessages()}
				<section class="app-detail-section">
					<h3>{text.complianceStatus}</h3>
					<p class="status" data-status={selected.metrics.status}>{statusLabel(selected.metrics.status)}</p>
					<div class="metric-grid">
						<div><span>{text.purchasedQuantity}</span><strong>{selected.purchasedQuantity}</strong></div>
						<div><span>{text.capacity}</span><strong>{count(selected.metrics.capacity)} {selected.metrics.capacity === null ? '' : selected.metrics.countingUnit === 'employee' ? text.unitEmployee : selected.metrics.countingUnit === 'asset' ? text.unitAsset : ''}</strong></div>
						<div><span>{text.allocated}</span><strong>{selected.metrics.allocated}</strong></div>
						<div><span>{text.remaining}</span><strong>{count(selected.metrics.remaining)}</strong></div>
						<div><span>{text.overage}</span><strong>{count(selected.metrics.overage)}</strong></div>
						<div><span>{text.renewal}</span><strong class:overdue={selected.metrics.daysToRenewal !== null && selected.metrics.daysToRenewal < 0}>{renewal(selected.metrics)}</strong></div>
					</div>
					{#if selected.licenseType !== 'concurrent'}
						<div class="metric-grid observation-metrics"><div><span>{text.observedInstallations}</span><strong>{selected.metrics.observedInstallations}</strong></div><div><span>{text.observedUsers}</span><strong>{selected.metrics.observedUsers}</strong></div><div><span>{text.unmatchedRecords}</span><strong>{selected.metrics.unmatchedRecords}</strong></div><div><span>{text.overLimitDevices}</span><strong>{selected.metrics.overLimitDevices}</strong></div><div><span>{text.overLimitUsers}</span><strong>{selected.metrics.overLimitUsers}</strong></div></div>
						{#if selected.metrics.missingObservation}<p class="help">{text.missingObservation}</p>{/if}
					{/if}
				</section>
				<section class="app-detail-section"><h3>{text.contractOverview}</h3><dl class="app-detail-grid">
					<div><dt>{text.licenseType}</dt><dd>{typeLabel(selected.licenseType)}</dd></div>
					<div><dt>{text.startsOn}</dt><dd>{date(selected.startsOn)}</dd></div>
					<div><dt>{text.endsOn}</dt><dd class:overdue={selected.renewsOn === null && selected.metrics.daysToRenewal !== null && selected.metrics.daysToRenewal < 0}>{date(selected.endsOn)}</dd></div>
					<div><dt>{text.renewsOn}</dt><dd class:overdue={selected.renewsOn !== null && selected.metrics.daysToRenewal !== null && selected.metrics.daysToRenewal < 0}>{date(selected.renewsOn)}</dd></div>
					<div><dt>{text.autoRenew}</dt><dd>{selected.autoRenew ? common.yes : common.no}</dd></div>
				</dl></section>
				<section class="app-detail-section"><h3>{text.purchaseDetails}</h3><dl class="app-detail-grid">
					<div><dt>{text.vendor}</dt><dd>{selected.vendor ?? ''}</dd></div>
					<div><dt>{text.orderNumber}</dt><dd>{selected.orderNumber ?? ''}</dd></div>
					<div><dt>{text.amount}</dt><dd>{selected.amount ? `${selected.amount} ${selected.currency ?? ''}` : ''}</dd></div>
					<div class="app-detail-wide"><dt>{text.evidenceReference}</dt><dd>{selected.evidenceReference ?? ''}</dd></div>
				</dl></section>
				<section class="app-detail-section"><h3>{text.usageTerms}</h3>
					{#if selected.licenseType === 'concurrent'}<p class="help">{text.concurrentNote}</p>{:else if selected.terms?.devicesPerUser}<p class="help">{text.termsNote}</p>{/if}
					<dl class="app-detail-grid">
						<div><dt>{text.usersPerLicense}</dt><dd>{count(selected.terms?.usersPerLicense ?? null)}</dd></div>
						<div><dt>{text.devicesPerUser}</dt><dd>{count(selected.terms?.devicesPerUser ?? null)}</dd></div>
						<div><dt>{text.usersPerDevice}</dt><dd>{count(selected.terms?.usersPerDevice ?? null)}</dd></div>
						<div><dt>{text.concurrentLimit}</dt><dd>{count(selected.terms?.concurrentLimit ?? null)}</dd></div>
						<div><dt>{text.evidenceStatus}</dt><dd>{selected.terms ? selected.terms.evidenceStatus === 'confirmed' ? text.confirmed : text.unverified : ''}</dd></div>
						<div class="app-detail-wide"><dt>{text.termsReference}</dt><dd>{selected.terms?.termsReference ?? ''}</dd></div>
						<div class="app-detail-wide"><dt>{text.termsNotes}</dt><dd class="app-detail-notes">{selected.terms?.notes ?? ''}</dd></div>
					</dl>
				</section>
				<section class="app-detail-section"><h3>{text.additionalInfo}</h3><dl class="app-detail-grid"><div class="app-detail-wide"><dt>{text.notes}</dt><dd class="app-detail-notes">{selected.notes ?? ''}</dd></div></dl></section>
				<section class="app-detail-section"><div class="section-heading"><h3>{text.recordedUse}</h3>{#if canManage && selected.licenseType !== 'concurrent'}<AddButton label={text.assign} onclick={openAssignment} />{/if}</div>
					<div class="table-wrap app-table-scroll app-table-scroll--bounded"><table><thead><tr><th>{text.target}</th><th>{text.assignedOn}</th><th>{text.plannedReleaseOn}</th><th>{text.releasedOn}</th><th></th></tr></thead><tbody>{#each assignments as item}<tr><td>{targetName(item)}</td><td>{date(item.assignedOn)}</td><td>{date(item.plannedReleaseOn)}</td><td>{date(item.releasedOn)}</td><td>{#if canManage && !item.releasedOn}<button type="button" class="text-button" onclick={() => openRelease(item)}>{text.release}</button>{/if}</td></tr>{:else}<tr><td colspan="5">{text.noAssignments}</td></tr>{/each}</tbody></table></div>
				</section>
				{#if selected.licenseType !== 'concurrent'}<div class="app-detail-section">{#key selected.id}<SoftwareInstallationsSection contractId={selected.id} capabilities={usageCapabilities} onChanged={async () => { if (selected) await Promise.all([loadDetail(selected.id, false), contractList?.refresh()]); }} />{/key}</div>{/if}
				<section class="app-detail-section"><div class="section-heading"><h3>{text.key}</h3>{#if canWriteKeys}<AddButton label={text.addKey} onclick={() => openKey()} />{/if}</div>
					<div class="table-wrap app-table-scroll app-table-scroll--bounded"><table><thead><tr><th>{text.keyLabel}</th><th>{text.key}</th><th>{text.activationLimit}</th><th>{text.keyExpiresOn}</th><th></th></tr></thead><tbody>{#each keys as item}<tr><td>{item.label ?? ''}</td><td>•••• {item.lastFour}</td><td>{count(item.activationLimit)}</td><td>{date(item.expiresOn)}</td><td>{#if canWriteKeys}<button type="button" class="text-button" onclick={() => openKey(item)}>{text.editKey}</button>{/if}{#if canReadKeys}<button type="button" class="text-button" onclick={() => { clearReveal(); revealKeyId = item.id; }}>{text.reveal}</button>{/if}</td></tr>{:else}<tr><td colspan="5">{text.noKeys}</td></tr>{/each}</tbody></table></div>
					{#if revealKeyId !== null}<div class="reveal-panel"><h3>{text.reveal}</h3><p>{text.keyWarning}</p><form onsubmit={(event) => { event.preventDefault(); void reveal(revealKeyId!); }}><label><span>{text.currentPassword} <span class="required" aria-hidden="true">*</span></span><input type="password" bind:value={currentPassword} autocomplete="current-password" placeholder={text.currentPasswordPlaceholder} required /></label><button type="submit" class="app-primary-action">{text.reveal}</button><button type="button" class="secondary" onclick={clearReveal}>{text.close}</button></form>{#if revealError}<p role="alert">{revealError}</p>{/if}{#if revealedKey}<output>{revealedKey}</output>{/if}</div>{/if}
				</section>
				<ChangeHistorySection entries={contractHistoryEntries} fieldLabels={historyFields} actionLabels={historyActions} dateFields={['startsOn', 'endsOn', 'renewsOn', 'assignedOn', 'releasedOn', 'deactivatedOn', 'expiresOn']} />
			</DetailModal>
		{/if}
		{#if editor}
			<ModalBackdrop>
				<dialog bind:this={editorDialogElement} class="app-modal" class:app-modal--compact={editor !== 'contract'} open aria-modal="true" aria-labelledby="editor-title">
					<header><h2 id="editor-title">{editor === 'product' ? (editingProduct ? text.editProduct : text.addProduct) : editor === 'contract' ? (editingContract ? text.editContract : text.addContract) : editor === 'key' ? (editingKey ? text.editKey : text.addKey) : editor === 'assignment' ? text.assign : text.release}</h2><button type="button" class="app-modal-close" aria-label={text.close} disabled={saving} onclick={() => requestCloseEditor()}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg></button></header>
					<form id="software-editor-form" class="app-modal-form" novalidate onsubmit={save}>
						<div class="app-modal-form-body">
							{#if error}<StatusNotice message={error} tone="error" onDismiss={() => error = ''} />{/if}
							{#if editor === 'product'}
								<FormSection title={common.basicInformation} framed>
									<label><span>{text.name} <span class="required" aria-hidden="true">*</span></span><input name="name" bind:value={productForm.name} maxlength="255" placeholder={text.nameExample} class:invalid={Boolean(fieldErrors.name)} aria-invalid={Boolean(fieldErrors.name)} aria-describedby={fieldErrors.name ? 'software-name-error' : undefined} oninput={() => clearFieldError('name')} />{#if fieldErrors.name}<span id="software-name-error" class="field-error" role="alert">{fieldErrors.name}</span>{/if}</label>
									<label><span>{text.manufacturer} <span class="required" aria-hidden="true">*</span></span><input name="manufacturer" bind:value={productForm.manufacturer} maxlength="255" placeholder={text.manufacturerExample} class:invalid={Boolean(fieldErrors.manufacturer)} aria-invalid={Boolean(fieldErrors.manufacturer)} aria-describedby={fieldErrors.manufacturer ? 'software-manufacturer-error' : undefined} oninput={() => clearFieldError('manufacturer')} />{#if fieldErrors.manufacturer}<span id="software-manufacturer-error" class="field-error" role="alert">{fieldErrors.manufacturer}</span>{/if}</label>
									<label>{text.edition}<input bind:value={productForm.edition} maxlength="128" placeholder={text.editionExample} /></label><label>{text.version}<input bind:value={productForm.version} maxlength="128" placeholder={text.versionExample} /></label><label>{text.productCode}<input bind:value={productForm.productCode} maxlength="128" placeholder={text.productCodeExample} /></label>
								</FormSection>
								<FormSection title={text.notes} framed><label class="wide">{text.notes}<textarea bind:value={productForm.notes} maxlength="5000" placeholder={text.notesExample}></textarea></label></FormSection>
							{:else if editor === 'contract'}
								<FormSection title={text.contractOverview} framed>
									<SearchSelect label={text.product} field="productId" value={contractForm.productId} options={[{ value: '', label: '-' }, ...productChoices.map((product) => ({ value: String(product.id), label: `${product.name} · ${product.manufacturer}` }))]} required error={fieldErrors.productId ?? ''} onOpen={() => openEditorDate = null} onSelect={(value) => { contractForm.productId = value; clearFieldError('productId'); }} />
									<label><span>{text.reference} <span class="required" aria-hidden="true">*</span></span><input name="reference" bind:value={contractForm.reference} maxlength="255" placeholder={text.contractReferenceExample} class:invalid={Boolean(fieldErrors.reference)} aria-invalid={Boolean(fieldErrors.reference)} aria-describedby={fieldErrors.reference ? 'software-reference-error' : undefined} oninput={() => clearFieldError('reference')} />{#if fieldErrors.reference}<span id="software-reference-error" class="field-error" role="alert">{fieldErrors.reference}</span>{/if}</label>
									<SearchSelect label={text.licenseType} field="licenseType" value={contractForm.licenseType} options={[{ value: 'user', label: text.userLicense }, { value: 'device', label: text.deviceLicense }, { value: 'concurrent', label: text.concurrentLicense }]} required searchable={false} error={fieldErrors.licenseType ?? ''} onOpen={() => openEditorDate = null} onSelect={(value) => { contractForm.licenseType = value as Contract['licenseType']; clearFieldError('licenseType'); }} />
									<label><span>{text.purchasedQuantity} <span class="required" aria-hidden="true">*</span></span><input name="purchasedQuantity" value={contractForm.purchasedQuantity} type="number" min="1" max="1000000" placeholder={text.quantityExample} class:invalid={Boolean(fieldErrors.purchasedQuantity)} aria-invalid={Boolean(fieldErrors.purchasedQuantity)} aria-describedby={fieldErrors.purchasedQuantity ? 'software-quantity-error' : undefined} oninput={(event) => { contractForm.purchasedQuantity = event.currentTarget.value; clearFieldError('purchasedQuantity'); }} />{#if fieldErrors.purchasedQuantity}<span id="software-quantity-error" class="field-error" role="alert">{fieldErrors.purchasedQuantity}</span>{/if}</label>
									<DatePicker label={text.startsOn} field="startsOn" value={contractForm.startsOn} required error={fieldErrors.startsOn ?? ''} open={openEditorDate === 'startsOn'} onToggle={() => toggleEditorDate('startsOn')} onSelect={(value) => { contractForm.startsOn = value; openEditorDate = null; clearFieldError('startsOn'); }} />
									<DatePicker label={text.endsOn} field="endsOn" value={contractForm.endsOn} error={fieldErrors.endsOn ?? ''} open={openEditorDate === 'endsOn'} onToggle={() => toggleEditorDate('endsOn')} onSelect={(value) => { contractForm.endsOn = value; openEditorDate = null; clearFieldError('endsOn'); }} />
									<DatePicker label={text.renewsOn} field="renewsOn" value={contractForm.renewsOn} error={fieldErrors.renewsOn ?? ''} open={openEditorDate === 'renewsOn'} onToggle={() => toggleEditorDate('renewsOn')} onSelect={(value) => { contractForm.renewsOn = value; openEditorDate = null; clearFieldError('renewsOn'); }} />
									<label class="checkbox"><input bind:checked={contractForm.autoRenew} type="checkbox" />{text.autoRenew}</label>
								</FormSection>
								<FormSection title={text.purchaseDetails} framed>
									<label>{text.vendor}<input bind:value={contractForm.vendor} maxlength="255" placeholder={text.vendorExample} /></label><label>{text.orderNumber}<input bind:value={contractForm.orderNumber} maxlength="128" placeholder={text.orderNumberExample} /></label>
									<label>{text.amount}<input name="amount" value={contractForm.amount} type="number" min="0" step="0.01" placeholder={text.amountExample} class:invalid={Boolean(fieldErrors.amount)} aria-invalid={Boolean(fieldErrors.amount)} aria-describedby={fieldErrors.amount ? 'software-amount-error' : undefined} oninput={(event) => { contractForm.amount = event.currentTarget.value; clearFieldError('amount'); }} />{#if fieldErrors.amount}<span id="software-amount-error" class="field-error" role="alert">{fieldErrors.amount}</span>{/if}</label>
									<div class="currency-field"><SearchSelect label={text.currency} field="currency" value={isFinancialCurrency(contractForm.currency) ? contractForm.currency : ''} options={[{ value: '', label: '-' }, ...currencyOptions]} searchable={false} error={fieldErrors.currency ?? ''} onOpen={() => openEditorDate = null} onSelect={(value) => { contractForm.currency = value; clearFieldError('currency'); }} />{#if contractForm.currency && !isFinancialCurrency(contractForm.currency)}<small class="legacy-currency">{contractForm.currency}</small>{/if}</div>
									<label class="wide">{text.evidenceReference}<input bind:value={contractForm.evidenceReference} maxlength="2048" placeholder={text.documentReferenceExample} /></label>
								</FormSection>
								<FormSection title={text.usageTerms} framed>
									{#if contractForm.licenseType === 'user'}
										<label><span>{text.usersPerLicense} <span class="required" aria-hidden="true">*</span></span><input name="usersPerLicense" value={contractForm.usersPerLicense} type="number" min="1" max="1000000" placeholder={text.usersPerLicenseExample} class:invalid={Boolean(fieldErrors.usersPerLicense)} aria-invalid={Boolean(fieldErrors.usersPerLicense)} aria-describedby={fieldErrors.usersPerLicense ? 'software-users-error' : undefined} oninput={(event) => { contractForm.usersPerLicense = event.currentTarget.value; clearFieldError('usersPerLicense'); }} />{#if fieldErrors.usersPerLicense}<span id="software-users-error" class="field-error" role="alert">{fieldErrors.usersPerLicense}</span>{/if}</label>
										<label>{text.devicesPerUser}<input name="devicesPerUser" value={contractForm.devicesPerUser} type="number" min="1" max="1000000" placeholder={text.devicesPerUserExample} class:invalid={Boolean(fieldErrors.devicesPerUser)} aria-invalid={Boolean(fieldErrors.devicesPerUser)} aria-describedby={fieldErrors.devicesPerUser ? 'software-devices-error' : undefined} oninput={(event) => { contractForm.devicesPerUser = event.currentTarget.value; clearFieldError('devicesPerUser'); }} />{#if fieldErrors.devicesPerUser}<span id="software-devices-error" class="field-error" role="alert">{fieldErrors.devicesPerUser}</span>{/if}</label>
									{:else if contractForm.licenseType === 'device'}<label>{text.usersPerDevice}<input name="usersPerDevice" value={contractForm.usersPerDevice} type="number" min="1" max="1000000" placeholder={text.usersPerDeviceExample} class:invalid={Boolean(fieldErrors.usersPerDevice)} aria-invalid={Boolean(fieldErrors.usersPerDevice)} aria-describedby={fieldErrors.usersPerDevice ? 'software-per-device-error' : undefined} oninput={(event) => { contractForm.usersPerDevice = event.currentTarget.value; clearFieldError('usersPerDevice'); }} />{#if fieldErrors.usersPerDevice}<span id="software-per-device-error" class="field-error" role="alert">{fieldErrors.usersPerDevice}</span>{/if}</label>
									{:else}<label>{text.concurrentLimit}<input name="concurrentLimit" value={contractForm.concurrentLimit} type="number" min="1" max="1000000" placeholder={text.concurrentLimitExample} class:invalid={Boolean(fieldErrors.concurrentLimit)} aria-invalid={Boolean(fieldErrors.concurrentLimit)} aria-describedby={fieldErrors.concurrentLimit ? 'software-concurrent-error' : undefined} oninput={(event) => { contractForm.concurrentLimit = event.currentTarget.value; clearFieldError('concurrentLimit'); }} />{#if fieldErrors.concurrentLimit}<span id="software-concurrent-error" class="field-error" role="alert">{fieldErrors.concurrentLimit}</span>{/if}</label>{/if}
									<SearchSelect label={text.evidenceStatus} field="evidenceStatus" value={contractForm.evidenceStatus} options={[{ value: 'unverified', label: text.unverified }, { value: 'confirmed', label: text.confirmed }]} searchable={false} onOpen={() => openEditorDate = null} onSelect={(value) => contractForm.evidenceStatus = value as Terms['evidenceStatus']} />
									<label class="wide">{text.termsReference}<input name="termsReference" bind:value={contractForm.termsReference} maxlength="2048" placeholder={text.termsReferenceExample} class:invalid={Boolean(fieldErrors.termsReference)} aria-invalid={Boolean(fieldErrors.termsReference)} aria-describedby={fieldErrors.termsReference ? 'software-terms-source-error' : undefined} oninput={() => clearFieldError('termsReference')} />{#if fieldErrors.termsReference}<span id="software-terms-source-error" class="field-error" role="alert">{fieldErrors.termsReference}</span>{/if}</label><label class="wide">{text.termsNotes}<textarea bind:value={contractForm.termsNotes} maxlength="5000" placeholder={text.termsNotesExample}></textarea></label>
								</FormSection>
								<FormSection title={text.additionalInfo} framed><label class="wide">{text.notes}<textarea bind:value={contractForm.notes} maxlength="5000" placeholder={text.notesExample}></textarea></label></FormSection>
							{:else if editor === 'key'}
								<FormSection title={text.key} framed>
									<label><span>{text.key}{#if !editingKey} <span class="required" aria-hidden="true">*</span>{/if}</span><input name="key" bind:value={keyForm.key} type="password" autocomplete="new-password" minlength="4" maxlength="2048" placeholder={text.productKeyExample} class:invalid={Boolean(fieldErrors.key)} aria-invalid={Boolean(fieldErrors.key)} aria-describedby={fieldErrors.key ? 'software-key-error' : undefined} oninput={() => clearFieldError('key')} />{#if fieldErrors.key}<span id="software-key-error" class="field-error" role="alert">{fieldErrors.key}</span>{/if}</label>
									<label>{text.keyLabel}<input bind:value={keyForm.label} maxlength="255" placeholder={text.keyLabelExample} /></label><label>{text.activationLimit}<input name="activationLimit" value={keyForm.activationLimit} type="number" min="1" max="1000000" placeholder={text.activationLimitExample} class:invalid={Boolean(fieldErrors.activationLimit)} aria-invalid={Boolean(fieldErrors.activationLimit)} aria-describedby={fieldErrors.activationLimit ? 'software-activation-error' : undefined} oninput={(event) => { keyForm.activationLimit = event.currentTarget.value; clearFieldError('activationLimit'); }} />{#if fieldErrors.activationLimit}<span id="software-activation-error" class="field-error" role="alert">{fieldErrors.activationLimit}</span>{/if}</label>
									<DatePicker label={text.keyExpiresOn} field="expiresOn" value={keyForm.expiresOn} open={openEditorDate === 'expiresOn'} onToggle={() => toggleEditorDate('expiresOn')} onSelect={(value) => { keyForm.expiresOn = value; openEditorDate = null; }} />
									<label class="wide">{text.notes}<textarea bind:value={keyForm.notes} maxlength="5000" placeholder={text.notesExample}></textarea></label>
								</FormSection>
							{:else if editor === 'assignment'}
								<FormSection title={text.target} framed>
									<SearchInput label={text.targetSearch} value={targetSearch} placeholder={text.targetSearch} onValueChange={searchTargets} />
									<SearchSelect label={text.target} field="targetId" value={assignmentForm.targetId} options={[{ value: '', label: '-' }, ...targets.map((target) => ({ value: String(target.id), label: targetOption(target) }))]} required error={fieldErrors.targetId ?? ''} onOpen={() => openEditorDate = null} onSelect={(value) => { assignmentForm.targetId = value; clearFieldError('targetId'); }} />
									<DatePicker label={text.assignedOn} field="assignedOn" value={assignmentForm.assignedOn} required error={fieldErrors.assignedOn ?? ''} open={openEditorDate === 'assignedOn'} onToggle={() => toggleEditorDate('assignedOn')} onSelect={(value) => { assignmentForm.assignedOn = value; openEditorDate = null; clearFieldError('assignedOn'); }} />
									<DatePicker label={text.plannedReleaseOn} field="plannedReleaseOn" value={assignmentForm.plannedReleaseOn} open={openEditorDate === 'plannedReleaseOn'} onToggle={() => toggleEditorDate('plannedReleaseOn')} onSelect={(value) => { assignmentForm.plannedReleaseOn = value; openEditorDate = null; }} />
									<SearchSelect label={text.keySelect} field="keyId" value={assignmentForm.keyId} options={[{ value: '', label: '-' }, ...keys.map((item) => ({ value: String(item.id), label: item.label ? `${item.label} · •••• ${item.lastFour}` : `•••• ${item.lastFour}` }))]} onOpen={() => openEditorDate = null} onSelect={(value) => assignmentForm.keyId = value} />
									<label class="wide">{text.notes}<textarea bind:value={assignmentForm.notes} maxlength="5000" placeholder={text.notesExample}></textarea></label>
								</FormSection>
							{:else}
								<FormSection title={text.release} framed>
									<p class="wide">{releasing ? targetName(releasing) : ''}</p>
									<DatePicker label={text.releasedOn} field="releasedOn" value={releaseForm.releasedOn} required error={fieldErrors.releasedOn ?? ''} open={openEditorDate === 'releasedOn'} onToggle={() => toggleEditorDate('releasedOn')} onSelect={(value) => { releaseForm.releasedOn = value; openEditorDate = null; clearFieldError('releasedOn'); }} />
									<DatePicker label={text.deactivatedOn} field="deactivatedOn" value={releaseForm.deactivatedOn} open={openEditorDate === 'deactivatedOn'} onToggle={() => toggleEditorDate('deactivatedOn')} onSelect={(value) => { releaseForm.deactivatedOn = value; openEditorDate = null; }} />
									<label class="wide">{text.releaseReason}<textarea bind:value={releaseForm.releaseReason} maxlength="1000" placeholder={text.releaseReasonExample}></textarea></label>
								</FormSection>
							{/if}
						</div>
						<footer class="app-modal-footer"><button type="button" class="secondary" disabled={saving} onclick={() => requestCloseEditor()}>{text.cancel}</button><button type="submit" class="app-primary-action" disabled={saving}>{saving ? common.saving : editor === 'release' ? text.confirmRelease : text.save}</button></footer>
					</form>
				</dialog>
			</ModalBackdrop>
			{#if confirmingDiscard}<DiscardChangesDialog onContinue={() => confirmingDiscard = false} onDiscard={() => closeEditor()} />{/if}
		{/if}
	{/if}
</div>
</AssetManagementShell>

<style>
	.reveal-panel input::placeholder{color:#c0c7cf}:global(html[data-theme='dark']) .reveal-panel input::placeholder{color:#5a6473}
	.software-page{min-width:0;color:var(--text)}.software-page :global(.master-list){margin-bottom:20px}.software-card{background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:20px;margin-bottom:20px}.software-card h2{font-size:var(--font-size-section);margin:0}.section-heading h3{font-size:var(--font-size-subsection);margin:0}.section-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:16px}.reveal-panel input{font:inherit;color:var(--text);background:var(--surface);border:1px solid var(--border);border-radius:4px;padding:7px 9px;min-height:38px}.reveal-panel input:focus{outline:2px solid var(--action-primary)}.table-wrap{overflow-x:auto;border:1px solid var(--border);border-radius:6px}table{border-collapse:collapse;width:100%;min-width:650px}th,td{text-align:left;padding:10px 12px;border-bottom:1px solid var(--border);font-size:var(--font-size-body);vertical-align:top}th{font-size:var(--font-size-support);color:var(--muted);background:var(--surface-secondary)}td{overflow-wrap:anywhere}.text-button{border:0;background:none;color:var(--action-primary);text-decoration:underline;cursor:pointer;margin-right:10px;font:inherit}button:disabled{opacity:.5;cursor:not-allowed}.help,.empty{color:var(--muted);font-size:var(--font-size-support)}.alert-list{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px 16px;list-style:none;padding:0;margin:14px 0 0}.alert-list li{display:flex;min-width:0;align-items:baseline;justify-content:space-between;gap:10px;padding:9px 12px;border:1px solid var(--border-light);border-radius:4px;background:var(--surface-secondary)}.alert-list button{min-width:0;padding:0;border:0;background:transparent;color:var(--action-primary);font:inherit;text-align:left;overflow-wrap:anywhere;cursor:pointer}.alert-list button:hover{text-decoration:underline}.alert-list button:focus-visible{outline:2px solid var(--action-primary);outline-offset:2px}.alert-list li>span{flex:none;font-size:var(--font-size-support)}.metric-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.metric-grid>div{background:var(--surface-secondary);border:1px solid var(--border);border-radius:6px;padding:12px}.observation-metrics{margin-top:10px}.app-detail-section .section-heading{margin-bottom:14px}.app-detail-section .status{margin:0 0 14px}.metric-grid span{display:block;color:var(--muted);font-size:var(--font-size-support)}.metric-grid strong{display:block;margin-top:4px;font-size:var(--font-size-body)}.status{display:inline-block;padding:4px 10px;border-radius:99px;background:var(--surface-secondary);border:1px solid var(--border);font-size:var(--font-size-support)}.status[data-status="overallocated"],.status[data-status="expired"]{color:var(--danger)}.reveal-panel{border:1px solid var(--border);border-radius:6px;padding:16px;margin-top:16px}.reveal-panel form{display:flex;gap:10px;align-items:end;flex-wrap:wrap}.reveal-panel label{display:flex;flex-direction:column;gap:5px}.app-modal-form .checkbox{display:flex;align-items:center;flex-direction:row;gap:8px}.app-modal-form .checkbox input{width:auto;height:auto}.app-modal-form .wide{grid-column:1/-1}.reveal-panel output{display:block;padding:12px;margin-top:12px;overflow-wrap:anywhere;background:var(--surface-secondary);border:1px solid var(--border)}@media(max-width:900px){.metric-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}@media(max-width:1000px){.alert-list{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:700px){.software-card{padding:16px}.alert-list{grid-template-columns:1fr}.metric-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.section-heading{align-items:flex-start;flex-wrap:wrap}}
	.overdue{color:var(--danger)!important}
	.app-modal-form .required,.reveal-panel .required{color:var(--danger)}
	.currency-field{min-width:0}.legacy-currency{display:block;margin-top:6px;color:var(--danger);font-size:var(--font-size-support)}
</style>
