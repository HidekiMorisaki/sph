<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { apiData } from '$lib/api';
	import AssetManagementShell from '$lib/components/AssetManagementShell.svelte';
	import DatePicker from '$lib/components/DatePicker.svelte';
	import DiscardChangesDialog from '$lib/components/DiscardChangesDialog.svelte';
	import FinancialStracPreview from '$lib/components/FinancialStracPreview.svelte';
	import MasterPageHeader from '$lib/components/MasterPageHeader.svelte';
	import ModalBackdrop from '$lib/components/ModalBackdrop.svelte';
	import SearchSelect from '$lib/components/SearchSelect.svelte';
	import StatusNotice from '$lib/components/StatusNotice.svelte';
	import { formatFinancialAmount, type FinancialCurrency } from '$lib/financial-currency';
	import { formatLocaleTemplate, localeMessages, type MessageLanguage } from '$lib/locale-messages';
	import { localization } from '$lib/localization';
	import { formSnapshot } from '$lib/modalForm';
	type Settings = { basis: 'calendar' | 'fiscal'; fiscalStartMonth: number };
	type Item = { branchId: number; branchName: string; branchDeleted: boolean; completedMonths: number; missingRates: string[]; revenue: string | null; variableCost: string | null; fixedCost: string | null; netProfit: string | null; published: boolean };
	type Month = { month: string; revenue: string | null; variableCost: string | null; fixedCost: string | null; version: number | null };
	type Draft = { month: string; revenue: string; variableCost: string; fixedCost: string; version: number | null };
	type PreviewTotals = { currency: FinancialCurrency; completedMonths: number; revenue: string; variableCost: string; fixedCost: string; netProfit: string };
	const bojHomeByLanguage: Record<MessageLanguage, string> = {
		ja: 'https://www.stat-search.boj.or.jp/',
		en: 'https://www.stat-search.boj.or.jp/index_en.html'
	};
	const yearStoragePrefix = 'asset-business-overview-year-';
	function storedYear(basis: Settings['basis']): number | null {
		try {
			const saved = Number(localStorage.getItem(`${yearStoragePrefix}${basis}`));
			return Number.isInteger(saved) && saved >= 1980 && saved <= 2100 ? saved : null;
		} catch { return null; }
	}
	function rememberYear(basis: Settings['basis'], selectedYear: number) {
		try { localStorage.setItem(`${yearStoragePrefix}${basis}`, String(selectedYear)); }
		catch { /* Browser storage can be unavailable; the current selection still works. */ }
	}
	let title = $derived(localeMessages[$localization.displayLanguage].navigation.items.businessOverview);
	let text = $derived(localeMessages[$localization.displayLanguage].financial);
	let common = $derived(localeMessages[$localization.displayLanguage].common);
	let fallbackCurrency = $state<FinancialCurrency | null>(null);
	let currency = $derived(fallbackCurrency ?? $localization.displayCurrency);
	let bojHome = $derived(bojHomeByLanguage[$localization.displayLanguage]);
	let loading = $state(true), rateLoading = $state(false), denied = $state(false), deniedDismissed = $state(false), busy = $state(false), saving = $state(false);
	let error = $state(''), notice = $state(''), rateNotice = $state(''), fallbackNotice = $state(''), editError = $state(''), noticeError = $state(false);
	let settings = $state<Settings>({ basis: 'calendar', fiscalStartMonth: 1 });
	let canRetrieveRates = $state(false);
	let year = $state(new Date().getFullYear()), offset = $state(0), total = $state(0);
	let yearPickerOpen = $state(false);
	let items = $state<Item[]>([]), editing = $state<Item | null>(null), draft = $state<Draft[]>([]);
	let draftCurrency = $state<FinancialCurrency>('JPY'), preview = $state<PreviewTotals | null>(null), previewBusy = $state(false);
	let previewButton = $state<HTMLButtonElement>();
	let editorDialog = $state<HTMLDialogElement>();
	let editorTrigger: HTMLButtonElement | null = null;
	let initialEditorSnapshot = $state('');
	let confirmingDiscard = $state(false);
	let hasUnsavedChanges = $derived(Boolean(editing) && formSnapshot({ draftCurrency, draft }) !== initialEditorSnapshot);
	let hasDraftAmounts = $derived(draft.some((row) => row.revenue.trim() !== '' || row.variableCost.trim() !== '' || row.fixedCost.trim() !== ''));
	let inputUnit = $derived(draftCurrency === 'JPY' ? text.inputUnitJPY : text.inputUnitUSD);
	let sequence = 0;
	const autoRateAttempts = new Set<string>();
	function inputLabel(label: string) { return $localization.displayLanguage === 'ja' ? `${label}（${inputUnit}）` : `${label} (${inputUnit})`; }
	function amountToInput(value: string | null, selectedCurrency: FinancialCurrency): string {
		if (value === null) return '';
		const minorUnits = selectedCurrency === 'JPY'
			? BigInt(value)
			: BigInt(value.split('.')[0]) * 100n + BigInt((value.split('.')[1] ?? '').padEnd(2, '0'));
		const scale = selectedCurrency === 'JPY' ? 10000n : 100000n;
		const places = selectedCurrency === 'JPY' ? 4 : 5;
		const fraction = String(minorUnits % scale).padStart(places, '0').replace(/0+$/, '');
		return `${minorUnits / scale}${fraction ? `.${fraction}` : ''}`;
	}
	function inputToAmount(value: string, selectedCurrency: FinancialCurrency): string {
		const [whole, fraction = ''] = value.split('.');
		const places = selectedCurrency === 'JPY' ? 4 : 5;
		const scale = selectedCurrency === 'JPY' ? 10000n : 100000n;
		const minorUnits = BigInt(whole) * scale + BigInt(fraction.padEnd(places, '0') || '0');
		return selectedCurrency === 'JPY'
			? String(minorUnits)
			: `${minorUnits / 100n}.${String(minorUnits % 100n).padStart(2, '0')}`;
	}
	function submittedMonths() {
		return draft.map((row) => ({ ...row, revenue: submittedAmount(row.revenue), variableCost: submittedAmount(row.variableCost), fixedCost: submittedAmount(row.fixedCost) }));
	}
	function submittedAmount(value: string): string | null {
		const trimmed = value.trim();
		return trimmed ? inputToAmount(trimmed, draftCurrency) : null;
	}
	function format(value: string | null, item: Item) { return formatFinancialAmount(value, currency, $localization.displayLanguage) ?? (item.missingRates.length ? text.rateMissing : text.notEntered); }
	function periodLabel() { return `${year} ${settings.basis === 'calendar' ? text.calendarYear : text.fiscalYear}`; }
	let selectYearLabel = $derived(settings.basis === 'calendar' ? text.selectCalendarYear : text.selectFiscalYear);
	async function responseError(response: Response, fallback: string) {
		const payload = await response.json().catch(() => null) as { error?: { code?: string } } | null;
		switch (payload?.error?.code) {
			case 'INCOMPLETE_PERIOD': return text.incomplete;
			case 'STALE_FINANCIAL_DATA': case 'PERIOD_SETTINGS_CHANGED': return text.stale;
			case 'EXCHANGE_RATE_UNAVAILABLE': case 'EXCHANGE_RATE_SERVICE_UNAVAILABLE': return text.rateMissing;
			case 'CURRENCY_LOCKED': return text.currencyLocked;
			default: return fallback;
		}
	}
	async function refresh(autoFetchRates = false) {
		const current = ++sequence; error = ''; rateLoading = autoFetchRates;
		const selectedYear = year, selectedCurrency = currency, selectedOffset = offset;
		try {
			async function loadRows(displayCurrency: FinancialCurrency) {
				const url = `/v1/financial-periods?year=${selectedYear}&currency=${displayCurrency}&sortBy=branchName&sortOrder=asc&offset=${selectedOffset}&limit=100`;
				const response = await fetch(url);
				if (response.status === 401) { if (current === sequence) window.location.assign('/'); return null; }
				if (response.status === 403) { if (current === sequence) denied = true; return null; }
				if (!response.ok) throw new Error();
				return response.json() as Promise<{ data: Item[]; meta: { total: number; basis: Settings['basis']; fiscalStartMonth: number } }>;
			}
			let payload = await loadRows(selectedCurrency);
			if (!payload || current !== sequence) return;
			const periodSettings = { basis: payload.meta.basis, fiscalStartMonth: payload.meta.fiscalStartMonth };
			const attemptKey = `${selectedYear}:${periodSettings.basis}:${periodSettings.fiscalStartMonth}:${selectedCurrency}`;
			if (autoFetchRates && canRetrieveRates && payload.data.some((item) => item.missingRates.length > 0)) {
				let fetchFailed = false;
				if (!autoRateAttempts.has(attemptKey)) {
					autoRateAttempts.add(attemptKey);
					const missingMonths = await retrieveRates(selectedYear, periodSettings);
					if (current !== sequence) return;
					fetchFailed = missingMonths === null;
					if (missingMonths !== null) {
						const updated = await loadRows(selectedCurrency);
						if (!updated || current !== sequence) return;
						payload = updated;
					}
				}
				const stillMissing = [...new Set(payload.data.flatMap((item) => item.missingRates))].sort();
				if (stillMissing.length && selectedCurrency === 'USD') {
					const yenRows = await loadRows('JPY');
					if (!yenRows || current !== sequence) return;
					if (yenRows.data.every((item) => item.missingRates.length === 0)) {
						fallbackCurrency = 'JPY'; payload = yenRows;
						rateNotice = ''; fallbackNotice = text.rateFallbackJPY;
					} else rateNotice = fetchFailed ? text.rateFetchFailed : formatLocaleTemplate(text.rateMissingMonths, stillMissing.join(', '));
				} else rateNotice = stillMissing.length ? (fetchFailed ? text.rateFetchFailed : formatLocaleTemplate(text.rateMissingMonths, stillMissing.join(', '))) : '';
			}
			if (current !== sequence) return;
			items = payload.data; total = payload.meta.total;
			settings = { basis: payload.meta.basis, fiscalStartMonth: payload.meta.fiscalStartMonth };
			if (fallbackCurrency === 'JPY') fallbackNotice = payload.data.every((item) => item.missingRates.length === 0) ? text.rateFallbackJPY : '';
		} catch { if (current === sequence) error = text.loadFailed; }
		finally { if (current === sequence) rateLoading = false; }
	}
	async function initialize() {
		try {
			const response = await fetch('/v1/auth/session');
			if (response.status === 401) { window.location.assign('/'); return; }
			if (!response.ok) throw new Error();
			const user = (await apiData<{ user: { capabilities: { canManageSystemSettings: boolean; canManageBranches: boolean } } }>(response)).user;
			if (!user.capabilities.canManageBranches) { denied = true; return; }
			canRetrieveRates = user.capabilities.canManageSystemSettings;
			const settingResponse = await fetch('/v1/financial-period-settings');
			if (!settingResponse.ok) throw new Error();
			settings = await apiData<Settings>(settingResponse);
			const today = new Date();
			const currentYear = settings.basis === 'fiscal' && today.getMonth() + 1 < settings.fiscalStartMonth ? today.getFullYear() - 1 : today.getFullYear();
			year = storedYear(settings.basis) ?? currentYear;
			await refresh(true);
		} catch { error = text.loadFailed; }
		finally { loading = false; }
	}
	async function edit(item: Item, trigger: HTMLButtonElement) {
		busy = true; editError = ''; preview = null;
		try {
			const response = await fetch(`/v1/financial-periods/${item.branchId}/${year}/months`);
			if (!response.ok) throw new Error();
			const data = await apiData<{ currency: FinancialCurrency; months: Month[] }>(response);
			draft = data.months.map((row) => ({ ...row, revenue: amountToInput(row.revenue, data.currency), variableCost: amountToInput(row.variableCost, data.currency), fixedCost: amountToInput(row.fixedCost, data.currency) }));
			draftCurrency = data.currency;
			initialEditorSnapshot = formSnapshot({ draftCurrency, draft });
			editorTrigger = trigger;
			editing = item;
			void tick().then(() => editorDialog?.querySelector<HTMLInputElement>('.month-table input')?.focus());
		} catch { notice = text.loadFailed; noticeError = true; }
		finally { busy = false; }
	}
	function closeEditor() {
		if (saving || previewBusy) return;
		confirmingDiscard = false;
		editing = null; preview = null; editError = '';
		void tick().then(() => editorTrigger?.focus());
	}
	function requestEditorClose() {
		if (saving || previewBusy) return;
		if (hasUnsavedChanges) { confirmingDiscard = true; return; }
		closeEditor();
	}
	function handleEditorKeydown(event: KeyboardEvent) {
		if (event.defaultPrevented || !editorDialog || confirmingDiscard) return;
		const openDialogs = [...document.querySelectorAll<HTMLDialogElement>('dialog[open]')];
		if (openDialogs.at(-1) !== editorDialog) return;
		if (event.key === 'Escape') { event.preventDefault(); requestEditorClose(); return; }
		if (event.key !== 'Tab') return;
		const focusable = [...editorDialog.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])')]
			.filter((element) => element.tabIndex >= 0 && element.getClientRects().length > 0);
		if (!focusable.length) return;
		const first = focusable[0]; const last = focusable[focusable.length - 1];
		if (!editorDialog.contains(document.activeElement)) { event.preventDefault(); (event.shiftKey ? last : first).focus(); }
		else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
		else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
	}
	function change(index: number, field: 'revenue' | 'variableCost' | 'fixedCost', value: string) {
		draft = draft.map((row, position) => position === index ? { ...row, [field]: value } : row);
	}
	function valid() {
		return draft.length === 12 && draft.every((row) => {
			const fields = [row.revenue.trim(), row.variableCost.trim(), row.fixedCost.trim()];
			if (fields.every((field) => field === '')) return true;
			const pattern = draftCurrency === 'JPY' ? /^(0|[1-9]\d{0,13})(\.\d{1,4})?$/ : /^(0|[1-9]\d{0,14})(\.\d{1,5})?$/;
			return fields.every((field) => pattern.test(field));
		});
	}
	async function retrieveRates(selectedYear = year, periodSettings = settings): Promise<string[] | null> {
		if (!canRetrieveRates) return null;
		try {
			const response = await fetch('/v1/financial-exchange-rates', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...periodSettings, year: selectedYear }) });
			if (!response.ok) return null;
			const data = await apiData<{ missingMonths: string[] }>(response);
			return data.missingMonths;
		} catch { return null; }
	}
	async function save() {
		if (!editing || saving) return;
		if (!valid()) { editError = text.invalidAmount; return; }
		saving = true; editError = ''; rateNotice = '';
		try {
			const months = submittedMonths();
			const response = await fetch(`/v1/financial-periods/${editing.branchId}/${year}/months`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...settings, currency: draftCurrency, months }) });
			if (!response.ok) { editError = await responseError(response, text.saveFailed); return; }
			notice = text.saved; noticeError = false;
			const missingMonths = canRetrieveRates ? await retrieveRates() : [];
			rateNotice = missingMonths === null ? text.rateFetchFailed
				: missingMonths.length ? formatLocaleTemplate(text.rateMissingMonths, missingMonths.join(', ')) : '';
			await refresh(); saving = false; closeEditor();
		} catch { editError = text.saveFailed; }
		finally { saving = false; }
	}
	async function showPreview() {
		if (!editing || previewBusy || saving) return;
		if (!valid()) { editError = text.invalidAmount; return; }
		previewBusy = true; editError = '';
		try {
			const missingMonths = canRetrieveRates ? await retrieveRates() : null;
			if (missingMonths !== null) rateNotice = '';
			const months = submittedMonths();
			const response = await fetch(`/v1/financial-periods/${editing.branchId}/${year}/preview`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...settings, currency: draftCurrency, displayCurrency: currency, months }) });
			if (!response.ok) {
				const payload = await response.json().catch(() => null) as { error?: { code?: string; details?: { field?: string }[] } } | null;
				const missing = payload?.error?.details?.map((detail) => detail.field).filter((month): month is string => Boolean(month)) ?? [];
				editError = payload?.error?.code === 'EXCHANGE_RATE_UNAVAILABLE' && missing.length
					? formatLocaleTemplate(text.rateMissingMonths, missing.join(', '))
					: payload?.error?.code === 'PERIOD_SETTINGS_CHANGED' ? text.stale : text.previewFailed;
				if (missingMonths !== null) await refresh();
				return;
			}
			preview = await apiData<PreviewTotals>(response);
			if (missingMonths !== null) await refresh();
		} catch { editError = text.previewFailed; }
		finally { previewBusy = false; }
	}
	function closePreview() {
		preview = null;
		void tick().then(() => previewButton?.focus());
	}
	async function toggle(item: Item) {
		if (busy || (!item.published && item.completedMonths !== 12)) return;
		busy = true; notice = '';
		try {
			const response = await fetch(`/v1/financial-periods/${item.branchId}/${year}/publication`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...settings, published: !item.published }) });
			if (!response.ok) { notice = await responseError(response, text.publishFailed); noticeError = true; return; }
			notice = item.published ? text.unpublished : text.published; noticeError = false; await refresh();
		} catch { notice = text.publishFailed; noticeError = true; }
		finally { busy = false; }
	}
	function chooseYear(value: string) {
		const next = Number(value);
		if (!Number.isInteger(next) || next < 1980 || next > 2100) return;
		year = next; rememberYear(settings.basis, next); offset = 0; editing = null; preview = null; fallbackCurrency = null; rateNotice = ''; fallbackNotice = ''; void refresh(true);
	}
	onMount(() => { void initialize(); });
</script>

<svelte:window onkeydown={handleEditorKeydown} />
<AssetManagementShell {title}>
	<div class="finance-page"><MasterPageHeader {title} description={text.description} />
		{#if loading}<p class="state">{common.loading}</p>
		{:else if denied}{#if !deniedDismissed}<StatusNotice message={localeMessages[$localization.displayLanguage].systemSettings.accessDenied} tone="error" onDismiss={() => deniedDismissed = true} />{/if}
		{:else}
			{#if error}<StatusNotice message={error} tone="error" onDismiss={() => error = ''} />{/if}
			{#if notice}<StatusNotice message={notice} tone={noticeError ? 'error' : 'success'} onDismiss={() => notice = ''} />{/if}
			{#if rateNotice}<StatusNotice message={rateNotice} tone="warning" onDismiss={() => rateNotice = ''} />{/if}
			{#if fallbackNotice}<StatusNotice message={fallbackNotice} tone="info" onDismiss={() => fallbackNotice = ''} />{/if}
			<section class="panel" aria-label={title}>
				<div class="toolbar"><div><h2>{periodLabel()}</h2><p>{text.converted} {currency}</p></div><div class="controls"><DatePicker label={selectYearLabel} field="financial-year" value={String(year)} mode="year" min="1980" max="2100" required disabled={busy} open={yearPickerOpen} onToggle={() => yearPickerOpen = !yearPickerOpen} onSelect={(value) => { yearPickerOpen = false; chooseYear(value); }} /></div></div>
				{#if rateLoading}<p class="state">{common.loading}</p>{:else if items.length === 0}<p class="state">{text.empty}</p>{:else}<div class="table-wrap"><table><thead><tr><th>{text.branch}</th><th>{text.revenue}</th><th>{text.variableCost}</th><th>{text.fixedCost}</th><th>{text.netProfit}</th><th>{text.month}</th><th>{text.publication}</th><th></th></tr></thead><tbody>
					{#each items as item}<tr><th scope="row">{item.branchName}</th><td class:muted={item.revenue === null && item.missingRates.length === 0}>{format(item.revenue, item)}</td><td class:muted={item.variableCost === null && item.missingRates.length === 0}>{format(item.variableCost, item)}</td><td class:muted={item.fixedCost === null && item.missingRates.length === 0}>{format(item.fixedCost, item)}</td><td class:negative={item.netProfit?.startsWith('-')} class:muted={item.netProfit === null && item.missingRates.length === 0}>{format(item.netProfit, item)}</td><td class="muted">{item.completedMonths === 12 ? text.monthsComplete : formatLocaleTemplate(text.monthsEntered, item.completedMonths)}</td><td><button class="app-status-switch" class:is-on={item.published} type="button" role="switch" aria-checked={item.published} aria-label={`${item.branchName} ${text.publication}`} title={!item.published && item.completedMonths !== 12 ? text.incomplete : undefined} disabled={busy || item.branchDeleted || (!item.published && item.completedMonths !== 12)} onclick={() => toggle(item)}><span class="app-status-switch__text">{item.published ? text.published : text.unpublished}</span><span class="app-status-switch__knob"></span></button></td><td><button class="edit-button" type="button" disabled={busy || item.branchDeleted} onclick={(event) => edit(item, event.currentTarget)}>{text.edit}</button></td></tr>{/each}
				</tbody></table></div>{/if}
				{#if total > 100}<div class="pagination"><button type="button" disabled={offset === 0 || busy || rateLoading} onclick={() => { offset -= 100; void refresh(true); }}>‹</button><span>{offset + 1}–{Math.min(offset + 100, total)} / {total}</span><button type="button" disabled={offset + 100 >= total || busy || rateLoading} onclick={() => { offset += 100; void refresh(true); }}>›</button></div>{/if}
			</section>
			<p class="rate-note">{text.rateHint} {text.rateCreditPrefix}<a href={bojHome} target="_blank" rel="noopener noreferrer">{text.rateCreditLink}</a>{text.rateCreditSuffix}</p>
			{#if editing && !preview}<ModalBackdrop>
				<dialog bind:this={editorDialog} class="app-modal monthly-editor-dialog" open aria-modal="true" aria-labelledby="monthly-editor-title">
					<header><div><p class="app-detail-pretitle">{editing.branchName} · {periodLabel()}</p><h2 id="monthly-editor-title">{text.edit}</h2></div><button class="app-modal-close" type="button" aria-label={text.close} disabled={saving || previewBusy} onclick={requestEditorClose}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg></button></header>
					<form class="app-modal-form" novalidate onsubmit={(event) => { event.preventDefault(); void save(); }}>
						<div class="app-modal-form-body monthly-editor-body">
							{#if editError}<StatusNotice message={editError} tone="error" onDismiss={() => editError = ''} />{/if}
							<section class="app-form-section app-form-section--framed"><p>{text.publishedEdit}</p><div class="editor-currency"><SearchSelect label={text.currency} field="financial-input-currency" value={draftCurrency} options={[{ value: 'JPY', label: 'JPY' }, { value: 'USD', label: 'USD' }]} searchable={false} disabled={saving || previewBusy || hasDraftAmounts} onSelect={(value) => draftCurrency = value as FinancialCurrency} /><p>{text.currencyHint}</p></div></section>
							<section class="app-form-section app-form-section--framed"><div class="table-wrap"><table class="month-table"><thead><tr><th>{text.month}</th><th>{text.revenue}</th><th>{text.variableCost}</th><th>{text.fixedCost}</th></tr></thead><tbody>{#each draft as row, index}<tr><th scope="row">{row.month}</th><td><div class="amount-field"><input aria-label={`${row.month} ${inputLabel(text.revenue)}`} inputmode="decimal" value={row.revenue} oninput={(event) => change(index, 'revenue', event.currentTarget.value)} /><span class="amount-unit">{inputUnit}</span></div></td><td><div class="amount-field"><input aria-label={`${row.month} ${inputLabel(text.variableCost)}`} inputmode="decimal" value={row.variableCost} oninput={(event) => change(index, 'variableCost', event.currentTarget.value)} /><span class="amount-unit">{inputUnit}</span></div></td><td><div class="amount-field"><input aria-label={`${row.month} ${inputLabel(text.fixedCost)}`} inputmode="decimal" value={row.fixedCost} oninput={(event) => change(index, 'fixedCost', event.currentTarget.value)} /><span class="amount-unit">{inputUnit}</span></div></td></tr>{/each}</tbody></table></div></section>
						</div>
						<footer class="app-modal-footer"><button class="secondary" type="button" disabled={saving || previewBusy} onclick={requestEditorClose}>{common.cancel}</button><button bind:this={previewButton} class="secondary" type="button" disabled={saving || previewBusy} onclick={showPreview}>{previewBusy ? text.previewLoading : text.preview}</button><button class="app-primary-action" type="submit" disabled={saving || previewBusy}>{saving ? text.saving : text.save}</button></footer>
					</form>
				</dialog>
			</ModalBackdrop>{/if}
			{#if preview && editing}<FinancialStracPreview branchName={editing.branchName} periodLabel={periodLabel()} totals={preview} returnFocus={null} onClose={closePreview} />{/if}
			{#if confirmingDiscard}<DiscardChangesDialog onContinue={() => confirmingDiscard = false} onDiscard={closeEditor} />{/if}
		{/if}
	</div>
</AssetManagementShell>

<style>
	.finance-page{display:grid;gap:16px;min-width:0}.panel{background:var(--surface);border:1px solid var(--border);border-radius:6px;box-shadow:var(--shadow);min-width:0}.toolbar{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:18px 20px;border-bottom:1px solid var(--border)}h2{font-size:1.13rem;margin:0 0 4px}p{margin:0;color:var(--text-secondary)}.controls{display:flex;align-items:end;gap:10px}input{min-height:34px;padding:6px 8px;border:1px solid var(--border);border-radius:4px;background:var(--surface);color:var(--text);font:inherit}.controls :global(.custom-date){width:130px}.secondary,.edit-button,.pagination button{min-height:34px;padding:6px 12px;border:1px solid var(--border);border-radius:4px;background:var(--surface);color:var(--action-primary);font:inherit;cursor:pointer}.secondary:hover,.edit-button:hover,.pagination button:hover{background:var(--surface-secondary)}button:disabled{opacity:.55;cursor:not-allowed}.table-wrap{overflow-x:auto}table{width:100%;border-collapse:collapse;white-space:nowrap}th,td{padding:12px 10px;border-bottom:1px solid var(--border);text-align:right;font-size:var(--font-size-body)}th:first-child,td:first-child{text-align:left;padding-left:20px}th:last-child,td:last-child{padding-right:20px}thead th{color:var(--text-secondary);font-weight:600;background:var(--surface-secondary)}tbody th{font-weight:600}tbody tr:last-child>*{border-bottom:0}.negative{color:#b43636}.editor-currency{display:flex;align-items:end;gap:14px;padding:16px 20px;border-bottom:1px solid var(--border)}.editor-currency :global(.form-select-field){width:140px}.editor-currency p{padding-bottom:8px;font-size:var(--font-size-support)}.month-table input{width:135px;height:36px;padding:0 12px;text-align:right;outline:none;transition:border-color 150ms,box-shadow 150ms}.month-table input:hover:not(:focus){border-color:var(--muted)}.month-table input:focus{border-color:#1abb9c;box-shadow:0 0 0 3px rgba(26,187,156,.14)}.month-table th,.month-table td{text-align:left}.pagination{display:flex;align-items:center;justify-content:flex-end;gap:12px;padding:12px 20px}@media(max-width:700px){.toolbar{align-items:stretch;flex-direction:column}.controls{justify-content:space-between}.editor-currency{align-items:stretch;flex-direction:column}.table-wrap{max-width:100%}}
	.amount-field{display:flex;align-items:center;gap:8px}
	.amount-field input{flex:0 0 135px}
	.amount-unit{color:var(--text-secondary);font-size:var(--font-size-support);white-space:nowrap}
	.muted{color:var(--text-secondary);font-size:var(--font-size-support)}
	.monthly-editor-body{grid-template-columns:minmax(0,1fr)}
	.monthly-editor-body .app-form-section{min-width:0}
	.monthly-editor-body .editor-currency{padding:0;border:0}
	.monthly-editor-body .table-wrap{min-width:0;max-width:100%}
	.monthly-editor-body .month-table{min-width:720px}
	.monthly-editor-body .month-table th:first-child,.monthly-editor-body .month-table td:first-child{padding-left:10px}
	.monthly-editor-body .month-table th:last-child,.monthly-editor-body .month-table td:last-child{padding-right:10px}
	.monthly-editor-dialog .app-modal-footer{justify-content:flex-end}
	@media(max-width:700px){.monthly-editor-body .editor-currency{gap:8px}.monthly-editor-dialog .app-modal-footer{flex-wrap:wrap}}
</style>
