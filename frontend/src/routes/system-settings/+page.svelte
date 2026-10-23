<script lang="ts">
 import WidgetEditor from '$lib/components/widgets/WidgetEditor.svelte';
 import WidgetSettingsSection from "$lib/components/widgets/WidgetSettingsSection.svelte";
	import { onMount, tick } from 'svelte';
	import { apiData } from '$lib/api';
	import AddButton from '$lib/components/AddButton.svelte';
	import AssetManagementShell from '$lib/components/AssetManagementShell.svelte';
	import DetailModal from '$lib/components/DetailModal.svelte';
	import DetailActionButtons from '$lib/components/DetailActionButtons.svelte';
	import MasterHistorySection from '$lib/components/MasterHistorySection.svelte';
	import DiscardChangesDialog from '$lib/components/DiscardChangesDialog.svelte';
	import FormSection from '$lib/components/FormSection.svelte';
	import MasterList from '$lib/components/MasterList.svelte';
	import MasterPageHeader from '$lib/components/MasterPageHeader.svelte';
	import PageTabs from '$lib/components/PageTabs.svelte';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
	import ModalBackdrop from '$lib/components/ModalBackdrop.svelte';
	import RoleManagementSection from '$lib/components/system-settings/RoleManagementSection.svelte';
	import FinancialPeriodSettingsSection from '$lib/components/system-settings/FinancialPeriodSettingsSection.svelte';
	import StatusNotice from '$lib/components/StatusNotice.svelte';
	import { loadExternalLinks, type ExternalLink } from '$lib/externalLinks';
	import { formatTimestamp, localization } from '$lib/localization';
	import { formSnapshot } from '$lib/modalForm';

	import { localeMessages, formatLocaleTemplate } from '$lib/locale-messages';
	import { systemSettingError, systemSettingReason } from '$lib/system-setting-errors';
	let text = $derived(localeMessages[$localization.displayLanguage].systemSettings);
	let common = $derived(localeMessages[$localization.displayLanguage].common);
	function t(key: Exclude<keyof typeof text, 'monitoring'>, ...values: (string | number)[]) { return formatLocaleTemplate(text[key], ...values); }

	type ModalMode = 'add' | 'edit' | 'detail' | null;
	type FormField = 'name' | 'url' | 'notes';
	type SystemSettingsSection = 'roles' | 'external-links' | 'financial-period';
	const systemSettingsSections: SystemSettingsSection[] = ['roles', 'external-links', 'financial-period'];
	const emptyForm = () => ({ name: '', url: '', sortOrder: '9999', notes: '' });

	let loading = $state(true);
	let accessDenied = $state(false);
	let loadError = $state('');
	let pageErrorDismissed = $state(false);
	let notices = $state<string[]>([]);
	let noticeIsError = $state(false);
	let activeSection = $state('roles');
	let editorOpened = $state(false);
	$effect(() => { if (activeSection === 'widget-development') editorOpened = true; });
	let list = $state<MasterList>();
	let mode = $state<ModalMode>(null);
	let selected = $state<ExternalLink | null>(null);
	let form = $state(emptyForm());
	let errors = $state<Partial<Record<FormField, string>>>({});
	let formError = $state('');
	let saving = $state(false);
	let removing = $state(false);
	let dialogElement = $state<HTMLDialogElement>();
	let addButton = $state<HTMLButtonElement>();
	let returnFocus = $state<HTMLElement | null>(null);
	let returnToDetail = $state(false);
	let initialSnapshot = $state('');
	let confirmingDiscard = $state(false);
	let hasDraftChanges = $derived(initialSnapshot !== '' && formSnapshot(form) !== initialSnapshot);
	let hasUnsavedChanges = $derived(mode === 'edit' && hasDraftChanges);

	let columns = $derived([
		{ key: 'name', label: text.name, width: 90, value: (item: ExternalLink) => item.name }
	]);

	async function initialize() {
		try {
			if (window.location.hash === '#system-information') { window.location.replace('/system-information'); return; }
			const response = await fetch('/v1/auth/session');
			if (response.status === 401) { window.location.assign('/'); return; }
			if (!response.ok) throw new Error();
			const user = (await apiData<{ user: { capabilities: { canManageSystemSettings: boolean } } }>(response)).user;
			accessDenied = !user.capabilities.canManageSystemSettings;
		} catch { loadError = text.loadFailed; }
		finally { loading = false; }
	}

	function openModal(next: Exclude<ModalMode, null>, item: ExternalLink | null = null, trigger: HTMLElement | null = null) {
		returnToDetail = next === 'edit' && mode === 'detail';
		returnFocus = trigger ?? (document.activeElement instanceof HTMLElement ? document.activeElement : addButton ?? null);
		selected = item; mode = next;
		form = item ? { name: item.name, url: item.url, sortOrder: String(item.sortOrder), notes: item.notes ?? '' } : emptyForm();
		errors = {}; formError = ''; initialSnapshot = formSnapshot(form); confirmingDiscard = false;
		if (next !== 'detail') void tick().then(() => dialogElement?.querySelector<HTMLInputElement>('[name="name"]')?.focus());
	}
	function closeDetail() { returnToDetail = false; mode = null; selected = null; }
	function closeModalImmediately() {
		if (saving || removing) return;
		if (returnToDetail && mode === 'edit') { confirmingDiscard = false; returnToDetail = false; mode = 'detail'; return; }
		returnToDetail = false;
		confirmingDiscard = false; mode = null; selected = null; initialSnapshot = '';
		void tick().then(() => returnFocus?.focus());
	}
	function requestCloseModal() {
		if (saving || removing) return;
		if (hasUnsavedChanges) { confirmingDiscard = true; return; }
		closeModalImmediately();
	}
	function updateField(field: FormField, value: string) {
		form[field] = value;
		if (errors[field]) { const next = { ...errors }; delete next[field]; errors = next; }
		if (!Object.keys(errors).length) formError = '';
	}
	function validate() {
		const next: Partial<Record<FormField, string>> = {};
		if (!form.name.trim()) next.name = text.nameRequired;
		else if (form.name.trim().length > 128) next.name = text.nameLength;
		if (!form.url.trim()) next.url = text.urlRequired;
		else {
			try {
				const url = new URL(form.url.trim());
				if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) next.url = text.urlInvalid;
				else if (url.username || url.password) next.url = text.urlCredentials;
			} catch { next.url = text.urlInvalid; }
		}
		errors = next;
		if (!Object.keys(next).length) return true;
		formError = text.correctFields;
		const field = Object.keys(next)[0];
		void tick().then(() => dialogElement?.querySelector<HTMLInputElement>(`[name="${field}"]`)?.focus());
		return false;
	}
	async function save() {
		if (!mode || mode === 'detail' || !validate()) return;
		saving = true; formError = '';
		try {
			const response = await fetch(`/v1/external-links${mode === 'edit' && selected ? `/${selected.id}` : ''}`, {
				method: mode === 'edit' ? 'PATCH' : 'POST', headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ name: form.name.trim(), url: form.url.trim(), sortOrder: Number(form.sortOrder), notes: form.notes })
			});
			if (!response.ok) {
				const payload = await response.json().catch(() => null) as { error?: { code?: string; details?: Array<{ field?: string; reason: string }> } } | null;
				errors = Object.fromEntries((payload?.error?.details ?? []).flatMap((detail) => detail.field && ['name', 'url'].includes(detail.field) ? [[detail.field, systemSettingReason(detail.reason, text, 'link')]] : []));
				formError = response.status === 403 ? text.linkSaveForbidden : systemSettingError(payload?.error?.code, response.status, text, 'link', text.linkSaveFailed);
				const field = Object.keys(errors)[0]; if (field) void tick().then(() => dialogElement?.querySelector<HTMLInputElement>(`[name="${field}"]`)?.focus());
				return;
			}
			mode = null; selected = null; returnToDetail = false; notices = [text.linkSaved]; noticeIsError = false;
			await Promise.all([list?.refresh(), loadExternalLinks(true)]);
			void tick().then(() => returnFocus?.focus());
		} catch { formError = text.linkSaveRetry; }
		finally { saving = false; }
	}
	async function remove(item: ExternalLink) {
		if (removing || !confirm(t('deleteConfirm', item.name))) return;
		removing = true; notices = []; noticeIsError = false;
		if (selected?.id === item.id) closeDetail();
		try {
			const response = await fetch(`/v1/external-links/${item.id}`, { method: 'DELETE' });
			if (!response.ok) { noticeIsError = true; notices = [response.status === 403 ? text.linkDeleteForbidden : text.linkDeleteFailed]; return; }
			notices = [text.linkDeleted];
			await Promise.all([list?.refresh(), loadExternalLinks(true)]);
		} catch { notices = [text.linkDeleteFailed]; noticeIsError = true; }
		finally { removing = false; }
	}
	function handleWindowKeydown(event: KeyboardEvent) {
		if (event.defaultPrevented || confirmingDiscard || !mode || mode === 'detail' || !dialogElement) return;
		if (event.key === 'Escape') { event.preventDefault(); if (mode === 'add' && hasDraftChanges && !saving) confirmingDiscard = true; else requestCloseModal(); return; }
		if (event.key !== 'Tab') return;
		const focusable = [...dialogElement.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), a[href]')].filter((item) => item.getClientRects().length);
		const first = focusable[0], last = focusable.at(-1); if (!first || !last) return;
		if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
		else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
	}

	onMount(() => {
		void initialize();
	});
</script>

{#snippet listActions()}<AddButton bind:element={addButton} label={text.addLink} onclick={() => openModal('add')} />{/snippet}

<svelte:window onkeydown={handleWindowKeydown} />

<AssetManagementShell title={text.title}>
	<div class="settings-page">
		<MasterPageHeader title={text.title} />
		{#if loading}<div class="page-state"><LoadingSpinner label={text.loading} /></div>
		{:else if accessDenied}{#if !pageErrorDismissed}<StatusNotice message={text.accessDenied} tone="error" onDismiss={() => pageErrorDismissed = true} />{/if}
		{:else if loadError}{#if !pageErrorDismissed}<StatusNotice message={loadError} tone="error" onDismiss={() => pageErrorDismissed = true} />{/if}
		{:else}
			{#each notices as message, index}<StatusNotice {message} tone={noticeIsError ? 'error' : 'success'} onDismiss={() => notices = notices.filter((_, noticeIndex) => noticeIndex !== index)} />{/each}
			<div class="settings-layout">
				<PageTabs bind:active={activeSection} label={text.sections} idPrefix="system-setting" panelPrefix="" storageKey="system-settings-tab" tabs={[{id:'widgets',label:$localization.displayLanguage==='ja'?'ウィジェット':'Widgets'},{id:'widget-development',label:$localization.displayLanguage==='ja'?'ウィジェット開発':'Widget development'},{id:'roles',label:text.roles},{id:'external-links',label:text.links},{id:'financial-period',label:localeMessages[$localization.displayLanguage].financial.periodSettings}]} />
				<div class="settings-content">
 <div id="widgets" class="settings-card" role="tabpanel" aria-labelledby="system-setting-widgets-tab" hidden={activeSection !== 'widgets'} tabindex="0"><WidgetSettingsSection /></div>
					<div id="widget-development" class="settings-card" role="tabpanel" aria-labelledby="system-setting-widget-development-tab" hidden={activeSection !== 'widget-development'} tabindex="0">{#if editorOpened}<WidgetEditor />{/if}</div>
					<div id="roles" class="settings-card" role="tabpanel" aria-labelledby="system-setting-roles-tab" hidden={activeSection !== 'roles'} tabindex="0"><RoleManagementSection onNotice={(messages) => { notices = messages; noticeIsError = false; }} /></div>
					<div id="external-links" class="settings-card" role="tabpanel" aria-labelledby="system-setting-external-links-tab" hidden={activeSection !== 'external-links'} tabindex="0">
						<MasterList bind:this={list} endpoint="/v1/external-links" title={text.links} listHeading={text.links} description={text.linksDescription} {columns} canManage canDetail headerActions={listActions} initialSortBy="sortOrder" unpaged hideColumnHeaders showNameIcon minTableWidth={0} reorderEndpoint="/v1/system-setting-orders/external-links" reorderHint={text.reorderHint} reorderSavingLabel={text.reorderSaving} onReorderError={(reason) => { noticeIsError = true; notices = [reason === 'conflict' ? text.reorderConflict : reason === 'forbidden' ? text.reorderForbidden : text.reorderFailed]; }} onReordered={() => { void loadExternalLinks(true); }} onDetail={(item, trigger) => openModal('detail', item as ExternalLink, trigger)} emptyLabel={text.noLinks} />
					</div>
					<div id="financial-period" class="settings-card" role="tabpanel" aria-labelledby="system-setting-financial-period-tab" hidden={activeSection !== 'financial-period'} tabindex="0"><FinancialPeriodSettingsSection /></div>
				</div>
			</div>
		{/if}
	</div>
</AssetManagementShell>

{#if mode === 'detail' && selected}
	<DetailModal title={text.linkDetails} titleId="external-link-detail-title" closeLabel={text.closeLinkDetails} {returnFocus} compact dialogClass="external-link-dialog" onClose={closeDetail}>
		{#snippet headerActions()}<DetailActionButtons editLabel={common.edit} deleteLabel={common.delete} disabled={removing} onEdit={() => openModal('edit', selected, returnFocus)} onDelete={() => void remove(selected!)} />{/snippet}
		<section class="app-detail-section"><h3>{text.linkInformation}</h3><dl class="app-detail-grid"><div><dt>{text.name}</dt><dd>{selected.name}</dd></div><div class="app-detail-wide"><dt>{text.url}</dt><dd><a class="detail-link" href={selected.url} target="_blank" rel="noopener noreferrer">{selected.url}</a></dd></div><div class="app-detail-wide"><dt>{text.notes}</dt><dd class="app-detail-notes">{selected.notes ?? ''}</dd></div><div><dt>{text.created}</dt><dd>{formatTimestamp(selected.createdAt, $localization)}</dd></div><div><dt>{text.updated}</dt><dd>{formatTimestamp(selected.updatedAt, $localization)}</dd></div></dl></section>
		<MasterHistorySection endpoint="/v1/external-links" itemId={selected.id} fieldLabels={{ name: text.name, url: text.url, notes: text.notes }} hiddenFields={['sortOrder']} />
	</DetailModal>
{:else if mode}
	<ModalBackdrop>
		<dialog bind:this={dialogElement} class="external-link-dialog app-modal app-modal--compact" open aria-modal="true" aria-labelledby="external-link-dialog-title">
			<header><h2 id="external-link-dialog-title">{mode === 'add' ? text.addLink : text.editLink}</h2><button class="app-modal-close" type="button" aria-label={text.closeLinkDialog} disabled={saving} onclick={requestCloseModal}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg></button></header>
			<form class="app-modal-form" novalidate onsubmit={(event) => { event.preventDefault(); void save(); }}>
				<div class="app-modal-form-body external-link-form-body">
					{#if formError}<StatusNotice title={text.linkSaveHeading} message={formError} tone="error" onDismiss={() => formError = ''} />{/if}
					<FormSection title={text.linkInformation} framed columns={2}>
						<label><span>{text.name} <span class="required" aria-hidden="true">*</span></span><input name="name" value={form.name} required maxlength="128" class:invalid={Boolean(errors.name)} aria-invalid={Boolean(errors.name)} aria-describedby={errors.name ? 'external-link-name-error' : undefined} oninput={(event) => updateField('name', event.currentTarget.value)} />{#if errors.name}<span class="field-error" id="external-link-name-error" role="alert">{errors.name}</span>{/if}</label>
						<label class="wide"><span>{text.url} <span class="required" aria-hidden="true">*</span></span><input name="url" type="url" inputmode="url" autocomplete="url" placeholder="https://" value={form.url} required maxlength="2048" class:invalid={Boolean(errors.url)} aria-invalid={Boolean(errors.url)} aria-describedby={errors.url ? 'external-link-url-error' : 'external-link-url-hint'} oninput={(event) => updateField('url', event.currentTarget.value)} />{#if errors.url}<span class="field-error" id="external-link-url-error" role="alert">{errors.url}</span>{:else}<small id="external-link-url-hint" class="field-hint">{text.urlHint}</small>{/if}</label>
						<label class="wide"><span>{text.notes}</span><textarea name="notes" value={form.notes} maxlength="5000" oninput={(event) => updateField('notes', event.currentTarget.value)}></textarea></label>
					</FormSection>
				</div>
				<footer class="app-modal-footer"><button class="secondary" type="button" disabled={saving} onclick={requestCloseModal}>{common.cancel}</button><button class="app-primary-action" type="submit" disabled={saving || (mode === 'edit' && !hasUnsavedChanges)}>{saving ? common.saving : mode === 'add' ? text.addLink : common.saveChanges}</button></footer>
			</form>
		</dialog>
	</ModalBackdrop>
	{#if confirmingDiscard}<DiscardChangesDialog onContinue={() => confirmingDiscard = false} onDiscard={closeModalImmediately} />{/if}
{/if}

<style>
	/* Let settings dialogs rise above the fixed shell while retaining table isolation at rest. */
	.settings-content:has(:global(.app-modal-backdrop)){isolation:auto}

	.settings-page{width:100%}.settings-layout{min-width:0}.settings-content{display:grid;min-width:0;grid-template-columns:minmax(0,1fr);gap:16px;isolation:isolate}.settings-card{position:relative;min-width:0;min-height:0;scroll-margin-top:72px}.settings-card :global(.master-list){max-height:none}.settings-card :global(.master-header){flex-wrap:wrap}.settings-card :global(th),.settings-card :global(td){padding-right:6px;padding-left:6px;overflow-wrap:anywhere}.settings-card :global(td:first-child){padding-left:10px}.settings-card :global(.actions-cell){padding-right:6px;padding-left:2px}.page-state{padding:24px;background:var(--surface);border:1px solid var(--border);border-radius:6px;color:var(--muted)}.detail-link{color:var(--action-primary);overflow-wrap:anywhere}.external-link-dialog{width:min(100%,720px)}.external-link-form-body{grid-template-columns:1fr}.wide{grid-column:1/-1}
	@media(max-width:900px){.settings-layout{min-width:0}}
	@media (max-width:700px), (min-width:701px) and (max-width:1024px) and (max-height:500px) and (any-pointer:coarse){.settings-layout{min-width:0}.wide{grid-column:auto}}
@media (max-width:700px), (min-width:701px) and (max-width:1024px) and (max-height:500px) and (any-pointer:coarse){.settings-layout{min-width:0}}
[role='tabpanel']:focus-visible{outline:2px solid var(--primary);outline-offset:-2px}
</style>
