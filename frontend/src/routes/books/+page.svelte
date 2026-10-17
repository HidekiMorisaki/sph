<script lang="ts">
 import { initialSearch } from '$lib/search';
 import SearchPanel from '$lib/components/SearchPanel.svelte';
 import CsvExportButton from '$lib/components/CsvExportButton.svelte';
 import { searchCsv, downloadCsv, csvFilename, type CsvColumn } from '$lib/csv-export';
 let searchState=$state(initialSearch('books'));
	import BookPurchaseFields from '$lib/components/BookPurchaseFields.svelte';
	import BookPurchasePanel from '$lib/components/BookPurchasePanel.svelte';
	import BookPurchaseBadge from '$lib/components/BookPurchaseBadge.svelte';
	import { bookPurchaseMessages, type PurchaseOrder } from '$lib/book-purchase-messages';
	import { onMount, tick } from 'svelte';
	import { localization } from '$lib/localization';
	import { readSessionUser } from '$lib/client-session';
	import { apiData } from '$lib/api';
	import type { SessionUser } from '$lib/auth';
	import AssetManagementShell from '$lib/components/AssetManagementShell.svelte';
	import MasterPageHeader from '$lib/components/MasterPageHeader.svelte';
	import MasterList from '$lib/components/MasterList.svelte';
	import ViewportListPage from '$lib/components/ViewportListPage.svelte';
	import AddButton from '$lib/components/AddButton.svelte';
	import AddMenu from '$lib/components/AddMenu.svelte';
	import ModalBackdrop from '$lib/components/ModalBackdrop.svelte';
	import ModalActionButton from '$lib/components/ModalActionButton.svelte';
	import DetailModal from '$lib/components/DetailModal.svelte';
	import DetailActionButtons from '$lib/components/DetailActionButtons.svelte';
	import StatusNotice from '$lib/components/StatusNotice.svelte';
	import BookCover from '$lib/components/BookCover.svelte';
	import FormSection from '$lib/components/FormSection.svelte';
	import SearchSelect from '$lib/components/SearchSelect.svelte';
	import DatePicker from '$lib/components/DatePicker.svelte';
	import DiscardChangesDialog from '$lib/components/DiscardChangesDialog.svelte';
	import '$lib/styles/primary-action.css';

	type Title = { id: number; catalogCode: string; name: string; author: string | null; publisher: string | null; edition: string | null; isbn: string | null; notes: string | null; copyCount: number; rentable: boolean; purchaseRequestCount?: number; sourceProvider?: string | null; sourceUrl?: string | null; sourceRetrievedAt?: string | null; coverStatus?: 'stored' | 'missing' | 'unavailable' | 'manual' | null };
	type BookLookupCandidate = { title: string; author: string | null; publisher: string | null; edition: string | null; isbn: string; sourceUrl: string; coverImage: string | null };
	type BookLookupResult = { candidates: BookLookupCandidate[]; existingTitle: { id: number; name: string } | null };
	type Storage = { id: number; name: string; branchId: number; room: { name: string; branch: { name: string } } };
	type Copy = { id: number; copyCode: string; storageId: number; status: string; purchasedOn: string | null; notes: string | null; onLoan: boolean; storage: Storage; loans: Array<{ id: number; dueOn: string; employee: { firstName: string; lastName: string } }> };
	type Employee = { id: number; employeeCode: string; firstName: string; lastName: string; branchId: number };
	type Reservation = { id: number; status: string; title: { id: number }; branch: { name: string } };
	type CopyRow = { storageId: string; status: 'available' | 'unavailable'; notes: string; copyCode: string };
	type ApiError = { error?: { code?: string; message?: string; details?: Array<{ field?: string; reason: string }> } };

	const messages = {
		en: { catalogCode: 'Catalog code', title: 'Books', description: 'Manage purchased books and individual copies.', list: 'Book catalog', addTitle: 'Add book', addCopies: 'Add copies', name: 'Title', author: 'Author', publisher: 'Publisher', edition: 'Edition', isbn: 'ISBN', copies: 'Copies', storage: 'Storage', branch: 'Branch', status: 'Status', rental: 'Rental', rentable: 'Rentable', notRentable: 'Not rentable', bookInformation: 'Bibliographic information', available: 'Available', unavailable: 'Unavailable', purchasedOn: 'Purchase date', quantity: 'Quantity', sharedStorage: 'Storage for all copies', notes: 'Notes', code: 'Asset code (optional)', save: 'Save', cancel: 'Cancel', close: 'Close', noBooks: 'No books found.', loading: 'Loading books…', loadFailed: 'Unable to load books.', saveFailed: 'Unable to save books.', savedTitle: 'Book registered.', savedCopies: 'Copies registered.', selectBook: 'Select a book', selectStorage: 'Select storage', choose: 'Select…', row: 'Copy', detail: 'Book details', noCopies: 'No copies registered.', countHelp: 'Enter 1–100 copies. Change storage or code for individual copies below.', duplicate: 'An asset code already exists.', forbidden: 'You do not have permission for this branch.', retry: 'Retry', existing: 'Existing book' },
		ja: { catalogCode: '書誌コード', title: '書籍', description: '購入した書籍と現物を管理します。', list: '書籍一覧', addTitle: '書誌を登録', addCopies: '現物を追加', name: '書名', author: '著者', publisher: '出版社', edition: '版', isbn: 'ISBN', copies: '冊数', storage: '保管場所', branch: '拠点', status: '状態', rental: 'レンタル可否', rentable: '可', notRentable: '不可', bookInformation: '書誌情報', available: '利用可能', unavailable: '利用不可', purchasedOn: '購入日', quantity: '購入冊数', sharedStorage: '共通の保管場所', notes: '備考', code: '資産番号（任意）', save: '保存', cancel: 'キャンセル', close: '閉じる', noBooks: '書籍がありません。', loading: '書籍を読み込み中…', loadFailed: '書籍を読み込めませんでした。', saveFailed: '保存できませんでした。', savedTitle: '書誌を登録しました。', savedCopies: '現物を登録しました。', selectBook: '書籍を選択', selectStorage: '保管場所を選択', choose: '選択してください', row: '現物', detail: '書籍の詳細', noCopies: '現物はまだ登録されていません。', countHelp: '1～100冊を入力し、配置先や番号が異なる現物だけ下の行で変更できます。', duplicate: '資産番号が重複しています。', forbidden: 'この拠点への権限がありません。', retry: '再試行', existing: '登録済み書籍' }
	};
	let purchaseText = $derived(bookPurchaseMessages[$localization.displayLanguage]);
	let purchaseRequested = $state(false), purchaseOnly = $state(false), purchaseReady = $state(false);
	let purchaseQuantity = $state(1), purchaseReason = $state('');
	let purchaseOverview = $state(false);
	let purchaseOverviewProcessing = $state(false);
	let purchaseOverviewTrigger = $state<HTMLElement | null>(null);
	let addActionTrigger: HTMLButtonElement | null = null;
	let returnToPurchaseOverview = $state(false);
	let purchaseTitleId = $state('');
	let receiptOrderId = $state('');
	let receiptOrders = $state<PurchaseOrder[]>([]);

	let matchedTitle = $derived.by(() => {
		let isbn = titleForm.isbn.replace(/[\s-]/g, '').toUpperCase();
		if (isbn.length === 10) { const digits = '978' + isbn.slice(0,9); const sum = [...digits].reduce((n,c,i) => n+Number(c)*(i%2 ? 3 : 1),0); isbn = digits + (10-sum%10)%10; }
		return lookupExisting?.id ?? titles.find(item => Boolean(isbn) && item.isbn === isbn)?.id ?? null;
	});
	let t = $derived(messages[$localization.displayLanguage]);
	let supplementalText = $derived($localization.displayLanguage === 'ja' ? { label: '補足事項', placeholder: '補足事項' } : { label: 'Additional notes', placeholder: 'Additional notes' });
	let sectionText = $derived($localization.displayLanguage === 'ja' ? { title: '書誌情報', common: '登録内容', required: '必須項目です。', quantity: '1～100冊を入力してください。' } : { title: 'Book information', common: 'Registration details', required: 'This field is required.', quantity: 'Enter 1–100 copies.' });
	const circulationMessages = {
		en: { reserve: 'Reserve', cancelReservation: 'Cancel reservation', reserved: 'Reservation submitted.', reservationCancelled: 'Reservation cancelled.', loan: 'Lend', return: 'Return', borrower: 'Borrower', dueOn: 'Due date', loanSaved: 'Loan recorded.', returned: 'Return recorded.', onLoan: 'On loan', reservation: 'Reservation' },
		ja: { reserve: '予約する', cancelReservation: '予約を取り消す', reserved: '予約しました。', reservationCancelled: '予約を取り消しました。', loan: '貸し出す', return: '返却を記録', borrower: '借用者', dueOn: '返却予定日', loanSaved: '貸出を記録しました。', returned: '返却を記録しました。', onLoan: '貸出中', reservation: '予約' }
	};
	let c = $derived(circulationMessages[$localization.displayLanguage]);
	let coverText = $derived($localization.displayLanguage === 'ja' ? { cover: 'カバー', change: 'カバーを変更', image: 'PNG画像', drop: 'ここにPNG画像をドラッグ＆ドロップ、またはクリックして選択', replace: 'ドラッグ＆ドロップ、またはクリックして画像を変更', imageHelp: 'PNG形式、1 MB以下、幅と高さは各100～2000ピクセル。', saved: 'カバーを更新しました。', invalid: '有効なPNG画像を選択してください。' } : { cover: 'Cover', change: 'Change cover', image: 'PNG image', drop: 'Drag and drop a PNG here, or click to select', replace: 'Drag and drop, or click to replace the image', imageHelp: 'PNG, up to 1 MB, width and height between 100 and 2000 pixels.', saved: 'Cover updated.', invalid: 'Choose a valid PNG image.' });
	let coverImportText = $derived($localization.displayLanguage === 'ja' ? {
		missing: 'openBDに書影がないため、カバー画像は未設定です。必要に応じて、「書誌を編集」からPNG画像を登録してください。',
		failed: '書誌は保存しましたが、書影を取得できませんでした。「書誌を編集」の「openBD情報を更新」で再試行するか、PNG画像を登録してください。',
		refreshFailed: '書誌は更新しましたが、書影を取得できなかったため、カバー画像は変更していません。「openBD情報を更新」で再試行するか、PNG画像を登録してください。'
	} : {
		missing: 'openBD has no cover for this book. You can upload a PNG from Edit book.',
		failed: 'The book was saved, but its cover could not be retrieved. Retry with Refresh openBD details or upload a PNG from Edit book.',
		refreshFailed: 'The details were updated, but the cover could not be retrieved and was left unchanged. Retry with Refresh openBD details or upload a PNG.'
	});
	let actionText = $derived($localization.displayLanguage === 'ja' ? { editTitle: '書誌を編集', editCopy: '現物を編集', deleteTitle: '書誌を削除', deleteCopy: '現物を削除', deleteConfirm: 'この削除は通常の一覧から対象を除外します。続けますか？' } : { editTitle: 'Edit book', editCopy: 'Edit copy', deleteTitle: 'Delete book', deleteCopy: 'Delete copy', deleteConfirm: 'This removes the item from normal lists. Continue?' });
	let user = $state<SessionUser | null>(null);
	let titleList = $state<MasterList>();
	let exporting = $state(false);
	let exportError = $state(false);
	let exportErrorText = $derived($localization.displayLanguage === 'ja' ? '書籍を出力できませんでした。' : 'Unable to export books.');
	async function exportCsv() {
		if (exporting || !searchState.success || searchState.loading || searchState.error) return;
		exporting = true; exportError = false;
		const columns: CsvColumn<Title>[] = [
			{ header: t.catalogCode, value: row => row.catalogCode },
			{ header: t.name, value: row => row.name },
			{ header: t.author, value: row => row.author },
			{ header: t.publisher, value: row => row.publisher },
			{ header: t.edition, value: row => row.edition },
			{ header: t.isbn, value: row => row.isbn },
			{ header: t.notes, value: row => row.notes },
			{ header: t.copies, value: row => row.copyCount },
			{ header: t.rental, value: row => row.rentable ? t.rentable : t.notRentable }
		];
		try {
			const filename = csvFilename('books');
			// Capture the translated values too, so switching language while fetching
			// cannot mix languages within one file.
			const rentable = t.rentable, notRentable = t.notRentable;
			columns[8].value = row => row.rentable ? rentable : notRentable;
			const content = await searchCsv<Title>({ endpoint: '/v1/book-searches', searchState, columns });
			downloadCsv(content, filename);
		} catch { exportError = true; } finally { exporting = false; }
	}
	let titles = $state<Title[]>([]);
	let storage = $state<Storage[]>([]);
	let loaded = $state(false);
	let loadError = $state(false);
	let notice = $state('');
	let noticeTone = $state<'success' | 'error'>('success');
	let detailNotice = $state<{ message: string; tone: 'success' | 'error' } | null>(null);
	let modal = $state<'title' | 'copies' | 'detail' | 'loan' | 'cover' | 'copy_edit' | 'delete_title' | 'delete_copy' | null>(null);
	let returnToDetail = $state(false);
	let coverReturnToTitle = $state(false);
	type ParentModal = {
		modal: typeof modal; purchaseOverview: boolean; selectedTitle: Title | null; detailTrigger: HTMLElement | null;
		initialDraft: string; returnToDetail: boolean; returnToPurchaseOverview: boolean; coverReturnToTitle: boolean;
		error: string; fieldErrors: Record<string, string>; detailNotice: typeof detailNotice;
		focusTag: string; focusText: string; focusLabel: string | null; focusOccurrence: number; scrollTop: number; scrollLeft: number;
		titleDraft: ReturnType<typeof readTitleDraft> | null;
	};
	let modalParents = $state<ParentModal[]>([]);
	let purchasePanelRevision = $state(0);
	const modalFocusSelector = 'button, input, textarea, select, a[href], [tabindex]';
	function readTitleDraft() {
		return { titleForm: { ...titleForm }, editingTitleId, editingSourceProvider, lookupCandidates: [...lookupCandidates], lookupExisting, lookupStatus, lookupSource, lookupErrorCode,
			purchaseRequested, purchaseQuantity, purchaseReason };
	}
	function rememberParent() {
		if (!modal && !purchaseOverview) { modalParents = []; return; }
		const dialog = typeof document === 'undefined' ? null : [...document.querySelectorAll<HTMLDialogElement>('dialog[open]')].at(-1);
		const body = dialog?.querySelector<HTMLElement>('.book-dialog-body, .app-detail-body');
		const focused = dialog?.contains(document.activeElement) ? document.activeElement as HTMLElement : null;
		const focusTag = focused?.tagName ?? '', focusText = focused?.textContent?.trim() ?? '', focusLabel = focused?.getAttribute('aria-label') ?? null;
		const matching = dialog ? [...dialog.querySelectorAll(modalFocusSelector)].filter(item => item.tagName === focusTag && item.textContent?.trim() === focusText && item.getAttribute('aria-label') === focusLabel) : [];
		modalParents.push({ modal, purchaseOverview, selectedTitle, detailTrigger, initialDraft, returnToDetail, returnToPurchaseOverview, coverReturnToTitle,
			error, fieldErrors, detailNotice: null, focusTag, focusText, focusLabel, focusOccurrence: matching.indexOf(focused!),
			scrollTop: body?.scrollTop ?? 0, scrollLeft: body?.scrollLeft ?? 0, titleDraft: modal === 'title' ? readTitleDraft() : null });
	}
	function restoreParent() {
		const parent = modalParents.pop();
		if (!parent) return false;
		({ modal, purchaseOverview, selectedTitle, detailTrigger, initialDraft, returnToDetail, returnToPurchaseOverview, coverReturnToTitle, error, fieldErrors, detailNotice } = parent);
		if (parent.titleDraft) ({ titleForm, editingTitleId, editingSourceProvider, lookupCandidates, lookupExisting, lookupStatus, lookupSource, lookupErrorCode,
			purchaseRequested, purchaseQuantity, purchaseReason } = parent.titleDraft);
		activeDateField = null; confirmingDiscard = false;
		if (typeof document !== 'undefined') void tick().then(() => requestAnimationFrame(() => {
			const dialog = [...document.querySelectorAll<HTMLDialogElement>('dialog[open]')].filter(item => item.checkVisibility()).at(-1);
			const restoreView = (attempts: number) => {
				if (!dialog?.isConnected || !dialog.checkVisibility()) return;
				const matching = [...dialog.querySelectorAll<HTMLElement>(modalFocusSelector)].filter(item => item.tagName === parent.focusTag && item.textContent?.trim() === parent.focusText && item.getAttribute('aria-label') === parent.focusLabel);
				const target = matching[parent.focusOccurrence];
				if (!target && parent.focusOccurrence >= 0 && attempts > 0) { requestAnimationFrame(() => restoreView(attempts - 1)); return; }
				target?.focus({ preventScroll: true });
				const body = dialog.querySelector<HTMLElement>('.book-dialog-body, .app-detail-body');
				if (body) { body.scrollTop = parent.scrollTop; body.scrollLeft = parent.scrollLeft; }
			};
			restoreView(120);
		}));
		return true;
	}
	let saving = $state(false);
	let error = $state('');
	let fieldErrors = $state<Record<string, string>>({});
	let titleForm = $state({ name: '', author: '', publisher: '', edition: '', isbn: '', notes: '' });
	let lookupCandidates = $state<BookLookupCandidate[]>([]);
	let lookupExisting = $state<BookLookupResult['existingTitle']>(null);
	let lookupStatus = $state<'idle' | 'loading' | 'ready' | 'empty' | 'error'>('idle');
	let lookupSource = $state<BookLookupCandidate | null>(null);
	let editingSourceProvider = $state<string | null>(null);
	let sourceLocked = $derived(Boolean(lookupSource) || editingSourceProvider === 'openbd');
	let lookupErrorCode = $state('');
	let lookupRequest: AbortController | null = null;
	let lookupText = $derived($localization.displayLanguage === 'ja'
		? { search: '書誌情報を検索', searching: '検索中…', candidates: 'openBDの候補', apply: 'この書誌を反映', empty: 'openBDに該当する書誌がありません。手入力してください。', failed: 'openBDから書誌を取得できませんでした。手入力するか、時間をおいて再検索してください。', timeout: 'openBDへの通信がタイムアウトしました。時間をおいて再検索するか、手入力してください。', limited: '検索回数の上限に達しました。1分ほど待って再検索してください。', invalid: '10桁または13桁の有効なISBNを入力してください。', existing: 'このISBNの書誌は登録済みです。', addCopy: 'この書誌に現物を追加', source: '出典：openBD', help: '候補を確認して反映してください。取得した書誌は編集できません。補足事項は入力できます。', manual: '候補を破棄して手入力', refresh: 'openBD情報を更新', refreshed: 'openBDの書誌情報を更新しました。', readonly: '取得した書誌は原文を保持しています。変更は提供元へご連絡ください。補足事項は編集できます。' }
		: { search: 'Look up book details', searching: 'Searching…', candidates: 'openBD results', apply: 'Use these details', empty: 'No matching record exists in openBD. Enter the details manually.', failed: 'Book details could not be retrieved from openBD. Enter them manually or try again later.', timeout: 'The openBD request timed out. Try again later or enter the details manually.', limited: 'Too many searches. Wait about one minute before trying again.', invalid: 'Enter a valid 10 or 13 digit ISBN.', existing: 'A book with this ISBN is already registered.', addCopy: 'Add a copy to this book', source: 'Source: openBD', help: 'Review a result before using it. Imported details cannot be edited. You can add notes.', manual: 'Discard result and enter manually', refresh: 'Refresh openBD details', refreshed: 'Book details refreshed from openBD.', readonly: 'Imported details are preserved as supplied. Contact the provider for corrections. Additional notes remain editable.' });
	let editingTitleId = $state<number | null>(null);
	let editingCopy = $state<Copy | null>(null);
	let copyForm = $state({ storageId: '', status: 'available', purchasedOn: '', notes: '' });
	let selectedTitleId = $state('');
	let selectedTitle = $state<Title | null>(null);
	let detailTrigger = $state<HTMLElement | null>(null);
	let detailCopies = $state<Copy[]>([]);
	let reservations = $state<Reservation[]>([]);
	let reserveBranchId = $state('');
	let employees = $state<Employee[]>([]);
	let loanCopy = $state<Copy | null>(null);
	let coverTitle = $state<Title | null>(null);
	let coverFile = $state<File | null>(null);
	let coverInput = $state<HTMLInputElement>();
	let coverDragging = $state(false);
	let coverRefresh = $state(0);
	let borrowerId = $state('');
	let dueOn = $state('');
	let quantity = $state(1);
	let purchasedOn = $state('');
	let commonStorageId = $state('');
	let rows = $state<CopyRow[]>([{ storageId: '', status: 'available', notes: '', copyCode: '' }]);
	let pendingPayload = '';
	let pendingKey = '';
	let dialogElement = $state<HTMLDialogElement>();
	let activeDateField = $state<string | null>(null);
	let confirmingDiscard = $state(false);
	let initialDraft = $state('');
	let permittedStorageOptions = $derived(storage.filter(place => user?.capabilities.canManageBooksGlobally || place.branchId === user?.branchId).map(place => ({ value: String(place.id), label: `${place.room.branch.name} / ${place.room.name} / ${place.name}` })));
	let titleOptions = $derived(titles.map(title => ({ value: String(title.id), label: `${title.name}${title.edition ? ` (${title.edition})` : ''}` })));
	function selectDate(field: 'purchasedOn' | 'dueOn' | 'copyPurchasedOn', value: string) {
		if (field === 'purchasedOn') purchasedOn = value;
		else if (field === 'dueOn') dueOn = value;
		else copyForm.purchasedOn = value;
		activeDateField = null;
		clearField(field === 'copyPurchasedOn' ? 'purchasedOn' : field);
	}
	function clearField(field: string) { if (fieldErrors[field]) fieldErrors = { ...fieldErrors, [field]: '' }; }
	function focusFirstInvalid() { void tick().then(() => dialogElement?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()); }
	$effect(() => {
		if (!modal || modal === 'detail') return;
		void tick().then(() => (dialogElement?.querySelector<HTMLElement>('.book-cover-dropzone,input:not([type="hidden"]):not([hidden]),select,textarea') ?? dialogElement?.querySelector<HTMLElement>('button'))?.focus());
	});
	function handleDialogKeydown(event: KeyboardEvent) {
		if (event.defaultPrevented) return;
		if (event.key === 'Escape') {
			event.preventDefault();
			if (activeDateField) {
				const field = activeDateField === 'purchasedOn' ? 'book-purchased-on' : activeDateField === 'dueOn' ? 'book-due-on' : 'book-edit-purchased-on';
				activeDateField = null;
				void tick().then(() => dialogElement?.querySelector<HTMLElement>(`[data-field="${field}"] .date-trigger`)?.focus());
				return;
			}
			requestClose(true);
			return;
		}
		if (event.key !== 'Tab' || !dialogElement) return;
		const focusable = [...dialogElement.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled])')].filter(element => element.getClientRects().length > 0);
		if (!focusable.length) return;
		if (event.shiftKey && document.activeElement === focusable[0]) { event.preventDefault(); focusable.at(-1)?.focus(); }
		else if (!event.shiftKey && document.activeElement === focusable.at(-1)) { event.preventDefault(); focusable[0].focus(); }
	}

	async function allItems<T>(endpoint: string): Promise<T[]> {
		const results: T[] = [];
		for (let offset = 0; ; offset += 500) {
			const response = await fetch(`${endpoint}?limit=500&offset=${offset}`);
			if (!response.ok) throw new Error('load');
			const page = await apiData<T[]>(response);
			results.push(...page);
			if (page.length < 500) return results;
		}
	}
	async function load() {
		loadError = false;
		try {
			const [current, bookTitles, locations] = await Promise.all([readSessionUser(), allItems<Title>('/v1/book-titles'), allItems<Storage>('/v1/storages')]);
			if (!current) { window.location.assign('/'); return; }
			user = current;
			titles = bookTitles;
			storage = locations;
			loaded = true;
		} catch { loadError = true; }
	}
	onMount(() => { void load(); });

	function openTitle(item?: Title) { openModal('title'); returnToPurchaseOverview = false; purchaseRequested = false; purchaseQuantity = 1; purchaseReason = ''; lookupRequest?.abort(); lookupCandidates = []; lookupExisting = null; lookupStatus = 'idle'; lookupSource = null; editingSourceProvider = item?.sourceProvider ?? null; editingTitleId = item?.id ?? null; titleForm = { name: item?.name ?? '', author: item?.author ?? '', publisher: item?.publisher ?? '', edition: item?.edition ?? '', isbn: item?.isbn ?? '', notes: item?.notes ?? '' }; initialDraft = JSON.stringify({ ...titleForm, purchaseRequested, purchaseQuantity, purchaseReason }); error = ''; fieldErrors = {}; }
	async function searchBookLookup() {
		lookupRequest?.abort();
		const isbn = titleForm.isbn.replace(/[\s-]/g, '').toUpperCase();
		if (!/^(?:\d{10}|\d{13}|\d{9}X)$/.test(isbn)) { fieldErrors = { ...fieldErrors, isbn: lookupText.invalid }; focusFirstInvalid(); return; }
		const request = new AbortController();
		lookupRequest = request;
		lookupCandidates = [];
		lookupExisting = null;
		lookupStatus = 'loading';
		lookupErrorCode = '';
		try {
			const response = await fetch(`/v1/book-lookup?isbn=${encodeURIComponent(isbn)}`, { signal: request.signal });
			if (lookupRequest !== request || request.signal.aborted) return;
			if (response.status === 422) {
				lookupStatus = 'idle';
				fieldErrors = { ...fieldErrors, isbn: lookupText.invalid };
				focusFirstInvalid();
				return;
			}
			if (!response.ok) { const payload = await response.json().catch(() => ({})) as ApiError; if (!request.signal.aborted) { lookupErrorCode = payload.error?.code ?? ''; lookupStatus = 'error'; } return; }
			const result = await apiData<BookLookupResult>(response);
			if (lookupRequest !== request || request.signal.aborted) return;
			lookupCandidates = result.candidates;
			lookupExisting = result.existingTitle;
			lookupStatus = result.candidates.length || result.existingTitle ? 'ready' : 'empty';
		} catch { if (!request.signal.aborted) lookupStatus = 'error'; }
	}
	function applyBookLookup(candidate: BookLookupCandidate) {
		titleForm = { ...titleForm, name: candidate.title, author: candidate.author ?? '', publisher: candidate.publisher ?? '', edition: candidate.edition ?? '', isbn: candidate.isbn };
		lookupSource = candidate;
		lookupCandidates = [];
		lookupStatus = 'idle';
		fieldErrors = {};
	}
	function discardBookLookup() { changeLookupIsbn(); titleForm = { name: '', author: '', publisher: '', edition: '', isbn: '', notes: titleForm.notes }; }
	function changeLookupIsbn() {
		lookupRequest?.abort();
		lookupSource = null;
		lookupCandidates = [];
		lookupExisting = null;
		lookupStatus = 'idle';
		clearField('isbn');
	}
	function openCopyEdit(copy: Copy) { openModal('copy_edit'); editingCopy = copy; copyForm = { storageId: String(copy.storageId), status: copy.status, purchasedOn: copy.purchasedOn?.slice(0, 10) ?? '', notes: copy.notes ?? '' }; initialDraft = JSON.stringify(copyForm); error = ''; fieldErrors = {}; }
	function openCopies(title?: Title, order?: PurchaseOrder) {
		receiptOrderId = order ? String(order.id) : '';
		if (order) receiptOrders = [order];
		openModal('copies');
		selectedTitleId = title ? String(title.id) : '';
		quantity = order ? order.quantity - order.received : 1;
		purchasedOn = '';
		commonStorageId = '';
		rows = Array.from({ length: quantity }, () => ({ storageId: '', status: 'available' as const, notes: '', copyCode: '' }));
		initialDraft = JSON.stringify({ selectedTitleId, quantity, purchasedOn, commonStorageId, rows, receiptOrderId });
		pendingPayload = '';
		pendingKey = '';
		error = '';
		fieldErrors = {};
	}
	function receivePurchase(order: PurchaseOrder) {
        const title = titles.find(item => item.id === order.titleId);
        if (title) openCopies(title, order);
    }
	function startNewPurchase() {
		openTitle();
		returnToPurchaseOverview = true;
		purchaseRequested = true;
		initialDraft = JSON.stringify({ ...titleForm, purchaseRequested, purchaseQuantity, purchaseReason });
	}
	function openPurchaseOverview(titleId = '', trigger: HTMLElement | null = null) {
		modalParents = []; detailNotice = null; error = '';
		purchaseTitleId = titleId;
		purchaseOverviewProcessing = Boolean(titleId);
		purchaseOverviewTrigger = trigger;
		purchaseOverview = true;
	}
    $effect(() => {
        if (modal !== 'copies' || !selectedTitleId) return;
        const id = Number(selectedTitleId);
        const controller = new AbortController();
        void (async () => {
            try {
                const result: PurchaseOrder[] = [];
                for (let offset = 0; ; offset += 500) {
                    const response = await fetch(`/v1/book-purchase-orders?titleId=${id}&limit=500&offset=${offset}`, { signal: controller.signal });
                    if (!response.ok) return;
                    const page = await apiData<PurchaseOrder[]>(response); result.push(...page); if (page.length < 500) break;
                }
                if (!controller.signal.aborted) { receiptOrders = result; if (!result.some(order => String(order.id) === receiptOrderId)) receiptOrderId = ''; }
            } catch { /* The API validates a linked order at submission. */ }
        })();
        return () => controller.abort();
    });
	function resizeRows() {
		const count = Math.max(1, Math.min(100, Number.isInteger(quantity) ? quantity : 1));
		rows = Array.from({ length: count }, (_, index) => rows[index] ?? { storageId: commonStorageId, status: 'available', notes: '', copyCode: '' });
	}
	function applyStorage() { rows = rows.map(row => ({ ...row, storageId: commonStorageId })); }
	function openModal(next: Exclude<typeof modal, 'detail' | null>) {
		rememberParent();
		detailNotice = null; notice = '';
		returnToDetail = modal === 'detail';
		modal = next;
	}
	function close() {
		if (saving) return;
		lookupRequest?.abort();
		if (restoreParent()) return;
		if (modal === 'cover' && coverReturnToTitle) { modal = 'title'; coverReturnToTitle = false; error = ''; detailNotice = null; return; }
		const reopenPurchaseOverview = modal === 'title' && returnToPurchaseOverview;
		modal = returnToDetail && modal !== 'detail' && selectedTitle ? 'detail' : null;
		returnToDetail = false;
		returnToPurchaseOverview = false;
		if (reopenPurchaseOverview) purchaseOverview = true;
		detailNotice = null; error = ''; fieldErrors = {}; activeDateField = null; confirmingDiscard = false;
		if (!modal && !purchaseOverview && addActionTrigger) {
			const trigger = addActionTrigger; addActionTrigger = null;
			void tick().then(() => trigger.focus({ preventScroll: true }));
		}
	}
	function requestClose(escape = false) {
		if (saving) return;
		const draft = modal === 'title' ? JSON.stringify({ ...titleForm, purchaseRequested, purchaseQuantity, purchaseReason }) : modal === 'copy_edit' ? JSON.stringify(copyForm) : modal === 'copies' ? JSON.stringify({ selectedTitleId, quantity, purchasedOn, commonStorageId, rows, receiptOrderId }) : '';
		if (draft && draft !== initialDraft && (escape || editingTitleId !== null && modal === 'title' || modal === 'copy_edit')) confirmingDiscard = true;
		else close();
	}
	function announce(message: string, tone: 'success' | 'error' = 'success') {
		if (modal || purchaseOverview) { notice = ''; detailNotice = { message, tone }; }
		else { detailNotice = null; notice = message; noticeTone = tone; }
	}
	async function saveTitle() {
		if (purchaseRequested && (!purchaseReady || !Number.isInteger(purchaseQuantity) || purchaseQuantity < 1 || purchaseQuantity > 100)) { error = purchaseText.quantityRequired; return; }
		if (!titleForm.name.trim()) { fieldErrors = { name: sectionText.required }; focusFirstInvalid(); return; }
		saving = true; error = ''; detailNotice = null; fieldErrors = {};
		try {
			const payload = editingTitleId && sourceLocked ? { notes: titleForm.notes } : !lookupSource ? titleForm : { ...titleForm, sourceUrl: lookupSource.sourceUrl };
			const response = await fetch(editingTitleId ? `/v1/book-titles/${editingTitleId}` : '/v1/book-titles', { method: editingTitleId ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, ...(!editingTitleId && purchaseRequested ? { purchaseRequest: { quantity: purchaseQuantity, reason: purchaseReason } } : {}) }) });
			if (!response.ok) { await showError(response); return; }
			const created = await apiData<Title>(response);
			titles = await allItems<Title>('/v1/book-titles');
			await titleList?.refresh();
			returnToPurchaseOverview = false;
			if (editingTitleId) { restoreParent(); selectedTitle = { ...selectedTitle!, ...created }; modal = 'detail'; announce(t.savedTitle); }
			else if (purchaseRequested || !user?.capabilities.canManageBooks) { modalParents = []; purchaseOverview = false; modal = null; announce(purchaseRequested ? purchaseText.saved : t.savedTitle); }
			else { modalParents = []; purchaseOverview = false; modal = null; openCopies(created); announce(created.coverStatus === 'unavailable' ? coverImportText.failed : created.coverStatus === 'missing' ? `${t.savedTitle} ${coverImportText.missing}` : t.savedTitle, created.coverStatus === 'unavailable' ? 'error' : 'success'); }
		} catch { error = t.saveFailed; } finally { saving = false; }
	}
	async function showError(response: Response) {
		const payload = await response.json().catch(() => ({})) as ApiError;
		const purchaseErrors: Record<string, string> = { DUPLICATE_BOOK_ISBN: purchaseText.isbnDuplicate, PURCHASE_ALREADY_REQUESTED: purchaseText.duplicate, PURCHASE_STATE_CONFLICT: purchaseText.conflict, PURCHASE_MANAGER_REQUIRED: purchaseText.forbidden };
		const operationErrors: Record<string, string> = $localization.displayLanguage === 'ja'
			? {
				PURCHASE_HISTORY_PRESENT: '購入依頼の履歴がある書誌は削除できません。履歴を保持するため書誌を残します。',
				BOOK_SOURCE_READ_ONLY: lookupText.readonly,
				BOOK_SOURCE_UNAVAILABLE: 'openBDに書誌がありません。新規登録では候補を破棄して手入力してください。登録済みの書誌で提供終了や削除要請があった場合は、管理者に連絡してください。',
				BOOK_LOOKUP_TIMEOUT: lookupText.timeout, BOOK_LOOKUP_UNAVAILABLE: lookupText.failed, INVALID_IMAGE: coverText.invalid,
				TITLE_IN_USE: 'この書誌には現物または有効な予約が残っているため、削除できません。「キャンセル」で閉じ、一覧から書籍の詳細を開いて、有効な予約を取り消し、すべての現物を削除してから、書誌の削除をやり直してください。',
				COPY_ON_LOAN: 'この現物は貸出中のため、この操作を実行できません。「キャンセル」で閉じ、書籍の詳細でこの現物の「返却を記録」を行ってから、操作をやり直してください。',
				COPY_HELD: 'この現物は予約のために取り置き中なので、この操作を実行できません。「キャンセル」で閉じ、書籍の詳細で該当する予約を取り消してから、操作をやり直してください。'
			}
			: {
				PURCHASE_HISTORY_PRESENT: 'Books with purchase requests cannot be deleted because their request history must be retained.',
				BOOK_SOURCE_READ_ONLY: lookupText.readonly,
				BOOK_SOURCE_UNAVAILABLE: 'The record is unavailable in openBD. For a new book, discard the result and enter details manually. Contact an administrator if a saved record has been withdrawn or its removal requested.',
				BOOK_LOOKUP_TIMEOUT: lookupText.timeout, BOOK_LOOKUP_UNAVAILABLE: lookupText.failed, INVALID_IMAGE: coverText.invalid,
				TITLE_IN_USE: 'This book cannot be deleted while copies or active reservations remain. Select Cancel, open the book details from the list, cancel active reservations and delete all copies, then try deleting the book again.',
				COPY_ON_LOAN: 'This action cannot be completed while the copy is on loan. Select Cancel, open the book details and record its return using Return, then try again.',
				COPY_HELD: 'This action cannot be completed while the copy is held for a reservation. Select Cancel, open the book details and cancel the corresponding reservation, then try again.'
			};
		const reasonText: Record<string, string> = $localization.displayLanguage === 'ja'
			? { ADDITIONAL_REASON_REQUIRED: purchaseText.reasonRequired, INVALID_ISBN: 'ISBNの形式を確認してください。', DUPLICATE_VALUE: '同じ値が入力されています。', INVALID_CODE: '資産番号の形式を確認してください。', NOT_FOUND: '有効な選択肢を選んでください。', INVALID_VALUE: '入力値を確認してください。', BEFORE_LOAN: '貸出日以降の日付を選んでください。', REQUIRED_OR_TOO_LONG: '必須項目または文字数を確認してください。' }
			: { ADDITIONAL_REASON_REQUIRED: purchaseText.reasonRequired, INVALID_ISBN: 'Check the ISBN format.', DUPLICATE_VALUE: 'The value is duplicated.', INVALID_CODE: 'Check the asset code format.', NOT_FOUND: 'Choose a valid option.', INVALID_VALUE: 'Check the value.', BEFORE_LOAN: 'Choose a date on or after the loan date.', REQUIRED_OR_TOO_LONG: 'Check the required value and length.' };
		fieldErrors = Object.fromEntries((payload.error?.details ?? []).filter(detail => detail.field).map(detail => [detail.field!, reasonText[detail.reason] ?? detail.reason]));
		error = payload.error?.details?.some(detail => detail.reason === 'ADDITIONAL_REASON_REQUIRED') ? purchaseText.reasonRequired : response.status === 403 ? t.forbidden : payload.error?.details?.some(detail => detail.reason === 'BOOK_SOURCE_READ_ONLY') ? lookupText.readonly : purchaseErrors[payload.error?.code ?? ''] ?? operationErrors[payload.error?.code ?? ''] ?? payload.error?.message ?? (response.status === 409 ? t.duplicate : t.saveFailed);
		if (Object.keys(fieldErrors).length) focusFirstInvalid();
	}
	async function saveCopies() {
		const invalid: Record<string, string> = {};
		if (!selectedTitleId) invalid.titleId = sectionText.required;
		if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) invalid.quantity = sectionText.quantity;
		rows.forEach((row, index) => { if (!row.storageId) invalid[`copies[${index}].storageId`] = sectionText.required; });
		if (Object.keys(invalid).length) { fieldErrors = invalid; focusFirstInvalid(); return; }
		saving = true; error = ''; detailNotice = null; fieldErrors = {};
		try {
			if (rows.length !== quantity) { error = t.saveFailed; return; }
			const body = { titleId: Number(selectedTitleId), purchaseOrderId: receiptOrderId ? Number(receiptOrderId) : null, purchasedOn: purchasedOn || null, copies: rows.map(row => ({ storageId: Number(row.storageId), status: row.status, notes: row.notes || null, copyCode: row.copyCode || null })) };
			const payload = JSON.stringify(body);
			if (payload !== pendingPayload) { pendingPayload = payload; pendingKey = crypto.randomUUID(); }
			const response = await fetch('/v1/book-copies', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': pendingKey }, body: payload });
			if (!response.ok) { await showError(response); return; }
			await apiData<Array<{ copyCode: string }>>(response);
			if (!restoreParent()) { modal = returnToDetail && selectedTitle ? 'detail' : null; returnToDetail = false; }
			if (purchaseOverview) purchasePanelRevision++;
			announce(t.savedCopies);
			if (modal === 'detail') await refreshDetail();
			await titleList?.refresh();
		} catch { error = modal === 'detail' ? t.loadFailed : t.saveFailed; } finally { saving = false; }
	}
	async function showDetail(item: Title, trigger: HTMLElement | null) {
		rememberParent();
		returnToDetail = false;
		selectedTitle = item;
		detailNotice = null; notice = '';
		detailTrigger = trigger;
		detailCopies = [];
		reservations = [];
		reserveBranchId = '';
		error = '';
		modal = 'detail';
		try {
			await refreshDetail();
		} catch { error = t.loadFailed; }
	}
	async function refreshDetail() {
		if (!selectedTitle) return;
		const [copyResponse, reservationResponse] = await Promise.all([
			fetch(`/v1/book-copies?titleId=${selectedTitle.id}&limit=500`),
			fetch('/v1/book-reservations?limit=500')
		]);
		if (!copyResponse.ok || !reservationResponse.ok) throw new Error('load');
		detailCopies = await apiData<Copy[]>(copyResponse);
		reservations = (await apiData<Reservation[]>(reservationResponse)).filter(item => item.title.id === selectedTitle?.id && ['waiting', 'held'].includes(item.status));
		if (!reserveBranchId && detailCopies.length) reserveBranchId = String(detailCopies[0].storage.branchId);
	}
	async function reserve() {
		if (!selectedTitle || !reserveBranchId) return;
		saving = true; error = ''; detailNotice = null;
		try {
			const response = await fetch('/v1/book-reservations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ titleId: selectedTitle.id, branchId: Number(reserveBranchId) }) });
			if (!response.ok) { await showError(response); return; }
			await refreshDetail(); announce(c.reserved);
		} catch { error = t.saveFailed; } finally { saving = false; }
	}
	async function cancelReservation(id: number) {
		saving = true; error = ''; detailNotice = null;
		try {
			const response = await fetch(`/v1/book-reservations/${id}`, { method: 'DELETE' });
			if (!response.ok) { await showError(response); return; }
			await refreshDetail(); announce(c.reservationCancelled);
		} catch { error = t.saveFailed; } finally { saving = false; }
	}
	async function openLoan(copy: Copy) {
		openModal('loan'); loanCopy = copy; borrowerId = ''; dueOn = ''; error = '';
		try { employees = await allItems<Employee>('/v1/employees'); }
		catch { error = t.loadFailed; }
	}
	async function saveLoan() {
		if (!loanCopy) return;
		const invalid: Record<string, string> = {};
		if (!borrowerId) invalid.employeeId = sectionText.required;
		if (!dueOn) invalid.dueOn = sectionText.required;
		if (Object.keys(invalid).length) { fieldErrors = invalid; focusFirstInvalid(); return; }
		saving = true; error = ''; detailNotice = null;
		try {
			const response = await fetch('/v1/book-loans', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ copyId: loanCopy.id, employeeId: Number(borrowerId), dueOn }) });
			if (!response.ok) { await showError(response); return; }
			restoreParent(); modal = 'detail'; await refreshDetail(); announce(c.loanSaved);
		} catch { error = t.saveFailed; } finally { saving = false; }
	}
	async function returnLoan(id: number) {
		saving = true; error = ''; detailNotice = null;
		try {
			const response = await fetch(`/v1/book-loans/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: '{}' });
			if (!response.ok) { await showError(response); return; }
			await refreshDetail(); announce(c.returned);
		} catch { error = t.saveFailed; } finally { saving = false; }
	}
	async function saveCopyEdit() {
		if (!editingCopy) return;
		if (!copyForm.storageId) { fieldErrors = { storageId: sectionText.required }; focusFirstInvalid(); return; }
		saving = true; error = ''; detailNotice = null;
		try {
			const response = await fetch(`/v1/book-copies/${editingCopy.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ storageId: Number(copyForm.storageId), status: copyForm.status, purchasedOn: copyForm.purchasedOn || null, notes: copyForm.notes || null }) });
			if (!response.ok) { await showError(response); return; }
			restoreParent(); modal = 'detail'; await refreshDetail(); await titleList?.refresh(); announce(t.savedCopies);
		} catch { error = t.saveFailed; } finally { saving = false; }
	}
	async function deleteSelected() {
		const titleDeletion = modal === 'delete_title';
		const id = titleDeletion ? selectedTitle?.id : editingCopy?.id;
		if (!id) return;
		saving = true; error = ''; detailNotice = null;
		try {
			const response = await fetch(titleDeletion ? `/v1/book-titles/${id}` : `/v1/book-copies/${id}`, { method: 'DELETE' });
			if (!response.ok) { await showError(response); return; }
			await titleList?.refresh();
			if (titleDeletion) { modalParents = []; titles = await allItems<Title>('/v1/book-titles'); selectedTitle = null; modal = null; }
			else { restoreParent(); modal = 'detail'; await refreshDetail(); }
			announce($localization.displayLanguage === 'ja' ? '削除しました。' : 'Deleted.');
		} catch { error = t.saveFailed; } finally { saving = false; }
	}
	async function refreshSource() {
		if (!selectedTitle || saving) return;
		saving = true; error = ''; detailNotice = null;
		try {
			const response = await fetch(`/v1/book-titles/${selectedTitle.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshSource: true }) });
			if (!response.ok) { await showError(response); coverRefresh += 1; detailNotice = { message: error, tone: 'error' }; error = ''; return; }
			const result = await apiData<{ coverStatus: Title['coverStatus'] }>(response);
			const detail = await fetch(`/v1/book-titles/${selectedTitle.id}`);
			if (!detail.ok) throw new Error('Unable to load book details');
			selectedTitle = { ...selectedTitle, ...await apiData<Title>(detail) };
			if (modal === 'title' && editingTitleId === selectedTitle.id) {
				titleForm = { ...titleForm, name: selectedTitle.name, author: selectedTitle.author ?? '', publisher: selectedTitle.publisher ?? '', edition: selectedTitle.edition ?? '', isbn: selectedTitle.isbn ?? '' };
				initialDraft = JSON.stringify({ ...titleForm, notes: JSON.parse(initialDraft).notes, purchaseRequested, purchaseQuantity, purchaseReason });
			}
			coverRefresh += 1; titles = await allItems<Title>('/v1/book-titles');
			await titleList?.refresh();
			detailNotice = { message: result.coverStatus === 'unavailable' ? coverImportText.refreshFailed : result.coverStatus === 'missing' ? `${lookupText.refreshed} ${coverImportText.missing}` : lookupText.refreshed, tone: result.coverStatus === 'unavailable' ? 'error' : 'success' };
		} catch { detailNotice = { message: lookupText.failed, tone: 'error' }; } finally { saving = false; }
	}
	function openCover(title: Title) { const fromTitle = modal === 'title'; openModal('cover'); coverReturnToTitle = fromTitle; coverTitle = title; coverFile = null; coverDragging = false; error = ''; }
	function selectCoverFiles(files: FileList | null) {
		if (saving) return;
		coverDragging = false;
		detailNotice = null;
		const file = files?.[0];
		if (files?.length !== 1 || !file || file.type !== 'image/png' || file.size > 1_000_000) {
			coverFile = null;
			error = coverText.invalid;
			return;
		}
		coverFile = file;
		error = '';
	}
	async function saveCover() {
		if (!coverTitle || !coverFile || coverFile.type !== 'image/png' || coverFile.size > 1_000_000) { error = coverText.invalid; return; }
		saving = true; error = ''; detailNotice = null;
		try {
			const form = new FormData();
			form.set('image', coverFile);
			const response = await fetch(`/v1/book-titles/${coverTitle.id}/cover`, { method: 'PUT', body: form });
			if (!response.ok) { await showError(response); return; }
			coverRefresh += 1;
			if (!restoreParent()) { modal = coverReturnToTitle ? 'title' : 'detail'; coverReturnToTitle = false; }
			announce(coverText.saved);
		} catch { error = t.saveFailed; } finally { saving = false; }
	}
</script>

{#snippet titleCell(item: Title)}<span>{item.name}</span>{#if item.purchaseRequestCount}<BookPurchaseBadge titleId={item.id} count={item.purchaseRequestCount} label={$localization.displayLanguage === 'ja' ? `${purchaseText.badge} ${item.purchaseRequestCount}件` : `${purchaseText.badge} ${item.purchaseRequestCount} ${item.purchaseRequestCount === 1 ? 'request' : 'requests'}`} onOpen={(trigger) => openPurchaseOverview(String(item.id), trigger)} />{/if}{/snippet}

{#snippet coverCell(item: Title)}<BookCover titleId={item.id} refresh={coverRefresh} />{/snippet}

{#snippet pageActions()}
	<AddMenu label={$localization.displayLanguage === 'ja' ? '書籍の登録・購入依頼' : 'Add books or request purchase'} items={[
		...(user?.capabilities.canManageBookTitles ? [{ label: t.addTitle, action: (trigger: HTMLButtonElement) => { addActionTrigger = trigger; openTitle(); } }] : []),
		...(user?.capabilities.canManageBooks ? [{ label: t.addCopies, action: (trigger: HTMLButtonElement) => { addActionTrigger = trigger; openCopies(); } }] : []),
		{ label: purchaseText.heading, action: (trigger) => openPurchaseOverview('', trigger) }
	]} />
{/snippet}

{#snippet listActions()}<CsvExportButton {exporting} disabled={!searchState.success || searchState.loading || searchState.error} onExport={() => void exportCsv()} />{@render pageActions()}{/snippet}

{#snippet detailActions()}
	{#if user?.capabilities.canManageBooks && selectedTitle}<AddButton label={t.addCopies} onclick={() => openCopies(selectedTitle!)} />{/if}
{/snippet}

{#snippet detailHeaderActions()}
	{#if user?.capabilities.canUpdateBookTitles && selectedTitle}<DetailActionButtons editLabel={actionText.editTitle} deleteLabel={actionText.deleteTitle} disabled={saving} onEdit={() => openTitle(selectedTitle!)} onDelete={() => openModal('delete_title')} />{/if}
{/snippet}

{#snippet bookDetail()}
	{#if detailNotice}<StatusNotice message={detailNotice.message} tone={detailNotice.tone} onDismiss={() => detailNotice = null} />{/if}
	{#if error}<p class="book-error" role="alert">{error}</p>{/if}
	{#if selectedTitle}<div class="book-detail">
		<section class="app-detail-section">
			<h3>{t.bookInformation}</h3>
			<div class="book-detail-overview">
				<div class="book-detail-cover"><BookCover titleId={selectedTitle.id} refresh={coverRefresh} large /></div>
				<dl class="app-detail-grid">
					<div><dt>{t.name}</dt><dd>{selectedTitle.name}</dd></div>
					<div><dt>{t.author}</dt><dd>{selectedTitle.author ?? ''}</dd></div>
					<div><dt>{t.publisher}</dt><dd>{selectedTitle.publisher ?? ''}</dd></div>
					<div><dt>{t.edition}</dt><dd>{selectedTitle.edition ?? ''}</dd></div>
					<div><dt>{t.isbn}</dt><dd>{selectedTitle.isbn ?? ''}</dd></div>
					{#if selectedTitle.sourceProvider === 'openbd' && selectedTitle.sourceUrl}<div class="app-detail-wide"><dt>{lookupText.source}</dt><dd class="book-detail-source">{selectedTitle.sourceRetrievedAt?.slice(0, 10) ?? ''} · <a href={selectedTitle.sourceUrl} target="_blank" rel="noopener noreferrer">{selectedTitle.sourceUrl}</a></dd></div>{/if}
				</dl>
			</div>
		</section>
		{#if selectedTitle.notes}<section class="app-detail-section"><h3>{supplementalText.label}</h3><p class="app-detail-notes book-title-notes">{selectedTitle.notes}</p></section>{/if}
		<section class="app-detail-section"><h3>{purchaseText.heading}</h3><BookPurchasePanel titleId={selectedTitle.id} branchId={user?.branchId} canRequest={user?.capabilities.canRequestBookPurchases} onChanged={() => void titleList?.refresh()} onReceive={user?.capabilities.canManageBooks ? receivePurchase : undefined} /></section>
		<section class="app-detail-section">
			<h3>{t.copies}: {detailCopies.length}</h3>
			{#if detailCopies.length}
				{#if reservations.length}{#each reservations as reservation}<p class="book-reservation-row">{c.reservation}: {reservation.branch.name} · {reservation.status} <button type="button" disabled={saving} onclick={() => void cancelReservation(reservation.id)}>{c.cancelReservation}</button></p>{/each}{:else}<div class="book-reserve"><SearchSelect label={t.branch} field="book-reservation-branch" value={reserveBranchId} options={[...new Map(detailCopies.map(copy => [copy.storage.branchId, { value: String(copy.storage.branchId), label: copy.storage.room.branch.name }])).values()]} onSelect={(value) => reserveBranchId = value} /><button type="button" disabled={saving || !reserveBranchId} onclick={() => void reserve()}>{c.reserve}</button></div>{/if}
				<ul class="book-copy-list">
					{#each detailCopies as copy}
						<li class="book-copy-item">
							<div class="book-copy-meta"><strong>{copy.copyCode}</strong><span>{copy.storage.room.branch.name} / {copy.storage.name} · {copy.onLoan ? c.onLoan : copy.status === 'available' ? t.available : t.unavailable}</span>{#if copy.loans[0]}<span>{copy.loans[0].employee.lastName} {copy.loans[0].employee.firstName} · {c.dueOn}: {copy.loans[0].dueOn.slice(0, 10)}</span>{/if}</div>
							{#if user?.capabilities.canManageBooks && (user.capabilities.canManageBooksGlobally || user.branchId === copy.storage.branchId)}
								<div class="book-copy-actions">
									{#if copy.loans[0]}<button type="button" disabled={saving} onclick={() => void returnLoan(copy.loans[0].id)}>{c.return}</button>{:else if !copy.onLoan && copy.status === 'available'}<button type="button" disabled={saving} onclick={() => void openLoan(copy)}>{c.loan}</button>{/if}
									<button type="button" disabled={saving} onclick={() => openCopyEdit(copy)}>{actionText.editCopy}</button>
									<button type="button" class="danger" disabled={saving} onclick={() => { editingCopy = copy; openModal('delete_copy'); }}>{actionText.deleteCopy}</button>
								</div>
							{/if}
						</li>
					{/each}
				</ul>
			{:else}<p>{t.noCopies}</p>{/if}
		</section>
	</div>{/if}
{/snippet}

{#snippet purchaseFilter()}<label class="book-purchase-filter"><input type="checkbox" bind:checked={purchaseOnly} />{purchaseText.filter}</label>{/snippet}

{#snippet sourceCredit()}
	<p class="book-source-credit">{lookupText.source} · <a href="https://openbd.jp/" target="_blank" rel="noopener noreferrer">openBD API</a> · <a href="https://openbd.jp/terms/" target="_blank" rel="noopener noreferrer">{$localization.displayLanguage === 'ja' ? '利用条件' : 'Terms of use'}</a></p>
{/snippet}

<AssetManagementShell title={t.title}>
	{#if purchaseOverview}
		<div hidden={modal !== null} inert={modal !== null}>
		<DetailModal title={purchaseOverviewProcessing ? ($localization.displayLanguage === 'ja' ? '購入依頼の受付処理' : 'Process purchase requests') : purchaseText.heading} pretitle={purchaseOverviewProcessing ? titles.find(item => String(item.id) === purchaseTitleId)?.name ?? '' : ''} titleId="book-purchases-title" closeLabel={t.close} returnFocus={purchaseOverviewTrigger} onClose={() => purchaseOverview = false}>
			{#if detailNotice}<StatusNotice message={detailNotice.message} tone={detailNotice.tone} onDismiss={() => detailNotice = null} />{/if}
			{#if error}<p class="book-error" role="alert">{error}</p>{/if}
			{#if !purchaseOverviewProcessing && user?.capabilities.canRequestBookPurchases}
				<FormSection title={purchaseText.submit} framed>
					<div class="wide"><SearchSelect label={t.selectBook} field="book-purchase-title" value={purchaseTitleId} options={titleOptions} onSelect={(value) => purchaseTitleId = value} /></div>
					{#if user.capabilities.canManageBookTitles}<div class="wide"><AddButton label={$localization.displayLanguage === 'ja' ? '未登録の書籍を登録して購入依頼' : 'Register a new book and request purchase'} onclick={startNewPurchase} /></div>{/if}
				</FormSection>
			{/if}
			{#key `${purchaseTitleId}:${purchasePanelRevision}`}
				<BookPurchasePanel titleId={purchaseTitleId ? Number(purchaseTitleId) : undefined} branchId={user?.branchId} canRequest={!purchaseOverviewProcessing && user?.capabilities.canRequestBookPurchases} requestOpen={Boolean(purchaseTitleId)} onChanged={() => void titleList?.refresh()} onReceive={user?.capabilities.canManageBooks ? receivePurchase : undefined} />
			{/key}
		</DetailModal>
		</div>
	{/if}
	<ViewportListPage naturalMobileScroll>
	<MasterPageHeader title={t.title} />
	{#if exportError}<StatusNotice message={exportErrorText} tone="error" onDismiss={() => exportError = false} />{/if}
	{#if notice && !modal}<StatusNotice message={notice} tone={noticeTone} onDismiss={() => notice = ''} />{/if}
	{#if loadError}<div class="book-load-error"><p role="alert">{t.loadFailed}</p><button type="button" onclick={() => void load()}>{t.retry}</button></div>{/if}
	{#if loaded}<SearchPanel target="books" userId={user?.id ?? null} bind:searchState draftOptions={purchaseOnly?{purchaseRequests:true}:{}} onRestoreOptions={options=>purchaseOnly=options.purchaseRequests===true} filters={purchaseFilter}/><MasterList bind:searchState bind:this={titleList} endpoint="/v1/book-searches" title={t.list} listHeading={t.list} headerActions={listActions} footerLeading={sourceCredit} initialSortBy="name" pageSizeStorageKey="books-page-size" minTableWidth={760} canDetail actionLabel={(item) => (item as Title).name} loadingLabel={t.loading} emptyLabel={t.noBooks} columns={[
		{ key: 'cover', label: coverText.cover, width: '76px', cell: coverCell, sortable: false },
		{ key: 'name', label: t.name, width: 'calc(70% - 296px)', cell: titleCell, value: (item) => (item as Title).name, sortable: true },
		{ key: 'author', label: t.author, width: 30, value: (item) => (item as Title).author ?? '' },
		{ key: 'copyCount', label: t.copies, width: '80px', align: 'center', value: (item) => (item as Title).copyCount, sortable: false },
		{ key: 'rental', label: t.rental, width: '140px', headerNoWrap: true, align: 'center', value: (item) => (item as Title).rentable ? t.rentable : t.notRentable, sortable: false }
	]} onDetail={(item, trigger) => void showDetail(item as Title, trigger)} />{/if}
	</ViewportListPage>
	{#if modal === 'detail' && selectedTitle}
		<DetailModal title={t.detail} titleId="book-modal-title" closeLabel={t.close} returnFocus={detailTrigger} compact headerActions={detailHeaderActions} actions={user?.capabilities.canManageBooks ? detailActions : undefined} onClose={close}>{@render bookDetail()}</DetailModal>
	{:else if modal}
		<ModalBackdrop>
			<dialog bind:this={dialogElement} class="app-modal book-dialog" class:app-modal--compact={modal !== 'copies'} open aria-modal="true" aria-labelledby="book-modal-title" onkeydown={handleDialogKeydown}>
				<header><h2 id="book-modal-title">{modal === 'title' ? editingTitleId ? actionText.editTitle : t.addTitle : modal === 'copies' ? t.addCopies : modal === 'loan' ? c.loan : modal === 'cover' ? coverText.change : modal === 'copy_edit' ? actionText.editCopy : modal === 'delete_title' ? actionText.deleteTitle : modal === 'delete_copy' ? actionText.deleteCopy : t.detail}</h2><button class="app-modal-close" type="button" aria-label={t.close} onclick={() => requestClose()} disabled={saving}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg></button></header>
				<div class="app-modal-form-body book-dialog-body">
					{#if detailNotice}<StatusNotice message={detailNotice.message} tone={detailNotice.tone} onDismiss={() => detailNotice = null} />{/if}
					{#if error}<p class="book-error" role="alert">{error}</p>{/if}
					{#if modal === 'title'}
							{#if editingTitleId && selectedTitle}
								<div class="book-edit-actions">{#if user?.capabilities.canManageBookCovers}<ModalActionButton label={coverText.change} variant="secondary" disabled={saving} onclick={() => openCover(selectedTitle!)} />{/if}{#if editingSourceProvider === 'openbd' && user?.capabilities.canUpdateBookTitles}<ModalActionButton label={lookupText.refresh} variant="secondary" disabled={saving} onclick={() => void refreshSource()} />{/if}</div>
							{/if}
						<form id="book-title-form" class="app-modal-form book-form" novalidate onsubmit={(event) => { event.preventDefault(); void saveTitle(); }}>
							<FormSection title={sectionText.title} framed>
								{#if sourceLocked}<p class="wide field-hint">{lookupText.readonly}</p>{/if}
								<div class="book-lookup book-isbn-row" class:book-isbn-edit={editingTitleId !== null}>
									<label>{t.isbn}<input maxlength="17" placeholder="9784873115658" bind:value={titleForm.isbn} readonly={sourceLocked} class:invalid={Boolean(fieldErrors.isbn)} aria-invalid={Boolean(fieldErrors.isbn)} aria-describedby={fieldErrors.isbn ? 'book-title-isbn-error' : undefined} oninput={changeLookupIsbn} onkeydown={(event) => { if (editingTitleId === null && event.key === 'Enter') { event.preventDefault(); void searchBookLookup(); } }} /></label>
									{#if editingTitleId === null}<ModalActionButton label={lookupStatus === 'loading' ? lookupText.searching : lookupText.search} variant="secondary" size="field" disabled={lookupStatus === 'loading' || saving || sourceLocked} onclick={() => void searchBookLookup()} />{/if}
									{#if fieldErrors.isbn}<small id="book-title-isbn-error" class="field-error" role="alert">{fieldErrors.isbn}</small>{/if}
									{#if editingTitleId === null}<small class="field-hint">{lookupText.help}</small>
									{#if lookupStatus === 'empty'}<p role="status">{lookupText.empty}</p>{/if}
									{#if lookupStatus === 'error'}<p role="alert">{lookupErrorCode === 'BOOK_LOOKUP_TIMEOUT' ? lookupText.timeout : lookupErrorCode === 'BOOK_LOOKUP_RATE_LIMITED' ? lookupText.limited : lookupText.failed}</p>{/if}
										{#if lookupExisting}<div class="book-lookup-existing"><strong>{lookupText.existing} {lookupExisting.name}</strong><ModalActionButton label={purchaseText.existing} variant="secondary" onclick={() => { const item = titles.find(title => title.id === lookupExisting!.id); if (item) void showDetail(item, null); }} />{#if user?.capabilities.canManageBooks}<AddButton label={lookupText.addCopy} onclick={() => { const item = titles.find(title => title.id === lookupExisting!.id); if (item) openCopies(item); }} />{/if}</div>{/if}
										{#if lookupCandidates.length}<div class="book-lookup-results" aria-label={lookupText.candidates}><h3>{lookupText.candidates}</h3>{#each lookupCandidates as candidate (candidate.isbn)}<div class="book-lookup-result"><BookCover titleId={null} image={candidate.coverImage} /><div class="book-lookup-result-details"><strong>{candidate.title}</strong><span>{candidate.author ?? ''} · {candidate.publisher ?? ''} · {candidate.isbn}</span><ModalActionButton label={lookupText.apply} variant="secondary" onclick={() => applyBookLookup(candidate)} /></div></div>{/each}</div>{/if}
										{#if lookupSource}<ModalActionButton label={lookupText.manual} variant="secondary" onclick={discardBookLookup} /><p class="book-source">{lookupText.source} <a href={lookupSource.sourceUrl} target="_blank" rel="noopener noreferrer">{lookupSource.sourceUrl}</a></p>{/if}
									{/if}
								</div>
								<label>{t.author}<input maxlength="500" placeholder={t.author} bind:value={titleForm.author} readonly={sourceLocked} /></label>
								<label>{t.publisher}<input maxlength="255" placeholder={t.publisher} bind:value={titleForm.publisher} readonly={sourceLocked} /></label>
								<label>{t.edition}<input maxlength="100" placeholder={t.edition} bind:value={titleForm.edition} readonly={sourceLocked} /></label>
								<label class="wide"><span>{t.name}<span class="required" aria-hidden="true">*</span></span><input required maxlength="500" placeholder={t.name} bind:value={titleForm.name} readonly={sourceLocked} class:invalid={Boolean(fieldErrors.name)} aria-invalid={Boolean(fieldErrors.name)} aria-describedby={fieldErrors.name ? 'book-title-name-error' : undefined} oninput={() => clearField('name')} />{#if fieldErrors.name}<small id="book-title-name-error" class="field-error" role="alert">{fieldErrors.name}</small>{/if}</label>
								<label class="wide">{supplementalText.label}<textarea maxlength="5000" rows="4" placeholder={supplementalText.placeholder} bind:value={titleForm.notes}></textarea></label>
							</FormSection>
							{#if !editingTitleId && user?.capabilities.canRequestBookPurchases}<FormSection title={purchaseText.heading} framed><label class="book-purchase-check wide"><input type="checkbox" bind:checked={purchaseRequested} />{purchaseText.request}</label>{#if purchaseRequested}<div class="wide"><BookPurchaseFields titleId={matchedTitle} branchId={user?.branchId} bind:quantity={purchaseQuantity} bind:reason={purchaseReason} bind:ready={purchaseReady} /></div>{/if}</FormSection>{/if}
						</form>
					{:else if modal === 'copies'}
							<form id="book-copy-form" class="app-modal-form book-form" novalidate onsubmit={(event) => { event.preventDefault(); void saveCopies(); }}>
								<FormSection title={sectionText.common} framed>
									<SearchSelect label={t.existing} field="book-title" value={selectedTitleId} options={titleOptions} required error={fieldErrors.titleId ?? ''} onSelect={(value) => { selectedTitleId = value; clearField('titleId'); }} />
									<div class="wide"><label>{purchaseText.orders}<select bind:value={receiptOrderId}><option value="">{purchaseText.noLink}</option>{#each receiptOrders.filter(order => order.status === 'ordered' && order.titleId === Number(selectedTitleId)) as order}<option value={String(order.id)}>{order.branch.name} · {order.orderCode} · {order.received}/{order.quantity}</option>{/each}</select></label><small class="field-hint">{purchaseText.receiptHelp}</small></div>
									<label><span>{t.quantity}<span class="required" aria-hidden="true">*</span></span><input type="number" min="1" max="100" required bind:value={quantity} class:invalid={Boolean(fieldErrors.quantity)} aria-invalid={Boolean(fieldErrors.quantity)} aria-describedby={fieldErrors.quantity ? 'book-quantity-error' : undefined} oninput={() => { resizeRows(); clearField('quantity'); }} />{#if fieldErrors.quantity}<small id="book-quantity-error" class="field-error" role="alert">{fieldErrors.quantity}</small>{/if}</label>
									<DatePicker label={t.purchasedOn} field="book-purchased-on" value={purchasedOn} error={fieldErrors.purchasedOn ?? ''} open={activeDateField === 'purchasedOn'} onToggle={() => activeDateField = activeDateField === 'purchasedOn' ? null : 'purchasedOn'} onSelect={(value) => selectDate('purchasedOn', value)} />
									<SearchSelect label={t.sharedStorage} field="book-common-storage" value={commonStorageId} options={permittedStorageOptions} onSelect={(value) => { commonStorageId = value; applyStorage(); }} />
								</FormSection>
								<p class="field-hint">{t.countHelp}</p>
								<div class="book-rows">{#each rows as row, index}<FormSection title={`${t.row} ${index + 1}`} framed>
									<SearchSelect label={t.storage} field={`book-storage-${index}`} value={row.storageId} options={permittedStorageOptions} required error={fieldErrors[`copies[${index}].storageId`] ?? ''} onSelect={(value) => { row.storageId = value; clearField(`copies[${index}].storageId`); }} />
									<SearchSelect label={t.status} field={`book-status-${index}`} value={row.status} options={[{ value: 'available', label: t.available }, { value: 'unavailable', label: t.unavailable }]} searchable={false} onSelect={(value) => row.status = value as CopyRow['status']} />
									<label>{t.code}<input maxlength="40" placeholder="BK-000001" bind:value={row.copyCode} class:invalid={Boolean(fieldErrors[`copies[${index}].copyCode`])} aria-invalid={Boolean(fieldErrors[`copies[${index}].copyCode`])} aria-describedby={fieldErrors[`copies[${index}].copyCode`] ? `book-code-${index}-error` : undefined} oninput={() => clearField(`copies[${index}].copyCode`)} />{#if fieldErrors[`copies[${index}].copyCode`]}<small id={`book-code-${index}-error`} class="field-error">{fieldErrors[`copies[${index}].copyCode`]}</small>{/if}</label>
									<label class="wide">{t.notes}<input maxlength="5000" placeholder={t.notes} bind:value={row.notes} /></label>
								</FormSection>{/each}</div>
							</form>
					{:else if modal === 'loan' && loanCopy}
						<form id="book-loan-form" class="app-modal-form book-form" novalidate onsubmit={(event) => { event.preventDefault(); void saveLoan(); }}><FormSection title={loanCopy.copyCode} framed columns={2}>
							<SearchSelect label={c.borrower} field="book-borrower" value={borrowerId} options={employees.filter(employee => user?.capabilities.canManageBooksGlobally || employee.branchId === loanCopy?.storage.branchId).map(employee => ({ value: String(employee.id), label: `${employee.lastName} ${employee.firstName} (${employee.employeeCode})` }))} required error={fieldErrors.employeeId ?? ''} onSelect={(value) => { borrowerId = value; clearField('employeeId'); }} />
							<DatePicker label={c.dueOn} field="book-due-on" value={dueOn} required error={fieldErrors.dueOn ?? ''} open={activeDateField === 'dueOn'} onToggle={() => activeDateField = activeDateField === 'dueOn' ? null : 'dueOn'} onSelect={(value) => selectDate('dueOn', value)} />
						</FormSection></form>
					{:else if modal === 'copy_edit' && editingCopy}
						<form id="book-copy-edit-form" class="app-modal-form book-form" novalidate onsubmit={(event) => { event.preventDefault(); void saveCopyEdit(); }}><FormSection title={editingCopy.copyCode} framed>
							<SearchSelect label={t.storage} field="book-edit-storage" value={copyForm.storageId} options={permittedStorageOptions} required error={fieldErrors.storageId ?? ''} onSelect={(value) => { copyForm.storageId = value; clearField('storageId'); }} />
							<SearchSelect label={t.status} field="book-edit-status" value={copyForm.status} options={[{ value: 'available', label: t.available }, { value: 'unavailable', label: t.unavailable }]} searchable={false} onSelect={(value) => copyForm.status = value} />
							<DatePicker label={t.purchasedOn} field="book-edit-purchased-on" value={copyForm.purchasedOn} error={fieldErrors.purchasedOn ?? ''} open={activeDateField === 'copyPurchasedOn'} onToggle={() => activeDateField = activeDateField === 'copyPurchasedOn' ? null : 'copyPurchasedOn'} onSelect={(value) => selectDate('copyPurchasedOn', value)} />
							<label class="wide">{t.notes}<input maxlength="5000" bind:value={copyForm.notes} placeholder={t.notes} /></label>
						</FormSection></form>
					{:else if modal === 'cover' && coverTitle}
						<form id="book-cover-form" class="app-modal-form book-form" onsubmit={(event) => { event.preventDefault(); void saveCover(); }}><FormSection title={coverTitle.name} framed columns={2}>
							<div class="wide book-cover-picker">
								<span id="book-cover-label" class="book-cover-label">{coverText.image}</span>
								<input bind:this={coverInput} type="file" accept="image/png" hidden disabled={saving} aria-label={coverText.image} onchange={(event) => { if (event.currentTarget.files?.length) selectCoverFiles(event.currentTarget.files); event.currentTarget.value = ''; }} />
								<button class="book-cover-dropzone" class:dragging={coverDragging} type="button" disabled={saving} aria-labelledby="book-cover-label book-cover-prompt" aria-describedby="book-cover-help" onclick={() => coverInput?.click()}
									ondragover={(event) => { event.preventDefault(); if (!saving) { coverDragging = true; if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'; } }}
									ondragleave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) coverDragging = false; }}
									ondrop={(event) => { event.preventDefault(); selectCoverFiles(event.dataTransfer?.files ?? null); }}>
									{#if coverFile}<strong class="book-cover-filename">{coverFile.name}</strong>{/if}
									<span id="book-cover-prompt">{coverFile ? coverText.replace : coverText.drop}</span>
								</button>
								<small id="book-cover-help" class="field-hint">{coverText.imageHelp}</small>
							</div>
						</FormSection></form>
					{:else if modal === 'delete_title' || modal === 'delete_copy'}
						<p>{actionText.deleteConfirm}</p><p><strong>{modal === 'delete_title' ? selectedTitle?.name : editingCopy?.copyCode}</strong></p>
					{/if}
				</div>
				<footer class="app-modal-footer">
					<button type="button" class="secondary" onclick={() => requestClose()} disabled={saving}>{t.cancel}</button>
					{#if modal === 'title'}<button type="submit" form="book-title-form" class="app-primary-action" disabled={saving}>{t.save}</button>
					{:else if modal === 'copies'}<button type="submit" form="book-copy-form" class="app-primary-action" disabled={saving}>{t.save}</button>
					{:else if modal === 'loan'}<button type="submit" form="book-loan-form" class="app-primary-action" disabled={saving}>{c.loan}</button>
					{:else if modal === 'copy_edit'}<button type="submit" form="book-copy-edit-form" class="app-primary-action" disabled={saving}>{t.save}</button>
					{:else if modal === 'cover'}<button type="submit" form="book-cover-form" class="app-primary-action" disabled={saving}>{t.save}</button>
					{:else if modal === 'delete_title' || modal === 'delete_copy'}<button type="button" class="app-danger-action" disabled={saving} onclick={() => void deleteSelected()}>{modal === 'delete_title' ? actionText.deleteTitle : actionText.deleteCopy}</button>{/if}
				</footer>
			</dialog>
		</ModalBackdrop>
		{#if confirmingDiscard}<DiscardChangesDialog onContinue={() => confirmingDiscard = false} onDiscard={close} />{/if}
	{/if}
</AssetManagementShell>

<style>
	.book-purchase-check,.book-purchase-filter{display:flex;align-items:center;gap:8px}.book-purchase-filter{flex:0 1 auto;align-self:flex-end;min-height:32px;max-width:100%;margin:0;padding:0;color:var(--text-secondary);font-size:var(--font-size-support);cursor:pointer}.book-purchase-check input,.book-purchase-filter input{width:16px;height:16px;flex:none}
	.book-load-error{padding:24px;border:1px solid var(--border);border-radius:12px;color:var(--text)}
	.book-dialog{width:min(100%,900px)}
	.book-dialog.app-modal--compact .book-dialog-body{flex:initial}
	.book-form{display:grid;flex:none;grid-column:1/-1;gap:16px;min-width:0;overflow:visible;background:transparent}
	#book-copy-form{padding-bottom:16px}
	.book-form .wide{grid-column:1/-1}
	.book-rows{display:grid;gap:12px}
	.book-error{grid-column:1/-1;color:var(--danger)}
	.book-dialog-body>p{grid-column:1/-1}
	.book-copy-list{list-style:none;margin:12px 0;padding:0;display:grid;gap:10px}
	.book-copy-item{border:1px solid var(--border);border-radius:9px;padding:12px;display:grid;gap:10px}
	.book-copy-meta{display:flex;flex-wrap:wrap;align-items:baseline;gap:6px 12px}
	.book-copy-actions{display:flex;flex-wrap:wrap;gap:8px}
	.book-copy-actions button{border:1px solid var(--border);border-radius:7px;padding:6px 10px;background:var(--surface);color:var(--text);font:inherit;cursor:pointer}
	.book-copy-actions button:disabled{opacity:.55;cursor:default}
	.book-detail{display:grid;min-width:0;gap:16px}.book-detail-overview{display:grid;grid-template-columns:112px minmax(0,1fr);align-items:start;gap:18px}.book-detail-cover{display:flex;justify-content:center}.book-detail-overview .app-detail-grid{min-width:0}.book-reservation-row{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 0 10px;color:var(--text-secondary);font-size:var(--font-size-body)}
	.book-lookup{display:grid;gap:8px;min-width:0}.book-lookup-results{display:grid;gap:8px;max-height:320px;overflow:auto;border:1px solid var(--border);border-radius:6px;padding:12px}.book-lookup-results h3{margin:0;font-size:var(--font-size-section)}.book-lookup-result,.book-lookup-existing{display:grid;gap:5px;border-top:1px solid var(--border);padding-top:8px}.book-lookup-result span,.book-source{overflow-wrap:anywhere;font-size:var(--font-size-support);color:var(--muted)}.book-lookup p{margin:0}
	.book-isbn-row{grid-column:1/-1;grid-template-columns:minmax(0,1fr) auto;align-items:end;gap:8px 12px}.book-isbn-row>.field-error,.book-isbn-row>.field-hint,.book-isbn-row>p,.book-isbn-row>.book-lookup-existing,.book-isbn-row>.book-lookup-results,.book-isbn-row>.book-source{grid-column:1/-1}.book-isbn-edit label{grid-column:1/-1}.book-title-notes{white-space:pre-wrap;overflow-wrap:anywhere}
	.book-lookup-result{grid-template-columns:44px minmax(0,1fr);align-items:start;gap:12px}.book-lookup-result-details{display:grid;min-width:0;gap:5px}.book-lookup-result-details strong{overflow-wrap:anywhere}
	.book-source-credit{display:flex;flex-wrap:wrap;justify-content:flex-start;gap:0 4px;margin:0;text-align:left;color:var(--muted);font-size:var(--font-size-support)}.book-source-credit a,.book-source a,.book-detail-source a{color:var(--link-color,#337ab7)}
	.book-edit-actions{grid-column:1/-1;display:flex;flex-wrap:wrap;gap:8px}.book-detail button.danger{border:1px solid var(--border);border-radius:7px;padding:6px 10px;background:var(--surface);color:var(--text);font:inherit;cursor:pointer}.book-detail button.danger{border-color:#b91c1c;color:#b91c1c}
	.book-cover-picker{display:grid;gap:8px;min-width:0}.book-cover-picker input[hidden]{display:none}.book-cover-label{font-size:var(--font-size-support);font-weight:500}.book-cover-dropzone{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;width:100%;min-height:160px;padding:24px;border:2px dashed var(--border);border-radius:6px;background:var(--surface)!important;color:var(--text-secondary)!important;font:inherit;text-align:center;overflow-wrap:anywhere;cursor:pointer}.book-cover-dropzone:hover:not(:disabled),.book-cover-dropzone.dragging{border-color:var(--action-primary);background:var(--surface-secondary)!important}.book-cover-dropzone:hover:not(:disabled){border-color:var(--action-primary);background:var(--surface-hover,var(--surface-secondary))!important}.book-cover-dropzone:focus-visible{outline:2px solid var(--action-primary);outline-offset:3px}.book-cover-dropzone:disabled{opacity:.65;cursor:not-allowed}.book-cover-filename{max-width:100%;color:var(--text)}
	.book-detail button,.book-reserve button{border:1px solid var(--border);border-radius:7px;padding:6px 10px;background:var(--surface);color:var(--text);font:inherit;cursor:pointer}
	.book-reserve{display:flex;align-items:end;gap:8px;margin:0 0 14px}.book-reserve :global(.form-select-field){min-width:180px;max-width:280px;flex:1}
	@media(max-width:700px){.book-detail-overview{grid-template-columns:1fr;gap:14px}.book-detail-cover{justify-content:flex-start}.book-reservation-row{align-items:flex-start;flex-direction:column}}
</style>
