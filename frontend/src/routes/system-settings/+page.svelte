<script lang="ts">
 import IconActionButton from '$lib/components/IconActionButton.svelte';
 import WorkflowSettings from "$lib/components/workflow/WorkflowSettings.svelte";
 import FormTabs from '$lib/components/FormTabs.svelte';
 import DetailTabs from '$lib/components/DetailTabs.svelte';
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
	import FinancialManagementSection from '$lib/components/system-settings/FinancialManagementSection.svelte';
	import MasterManagementSection from '$lib/components/system-settings/MasterManagementSection.svelte';
	import StatusNotice from '$lib/components/StatusNotice.svelte';
	import RoomBookingSettings from '$lib/components/RoomBookingSettings.svelte';
	import ModalActionButton from '$lib/components/ModalActionButton.svelte';
	import {canOperate,type SessionUser} from '$lib/auth';
	import {scheduleText} from '$lib/schedule-text';
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
	const emptyForm = () => ({ name: '', url: '', sortOrder: '9999', notes: '' });

	let loading = $state(true);
	let sessionUser=$state<SessionUser|null>(null),bookingOpen=$state(false),bookingTrigger=$state<HTMLElement|null>(null);
	let bookingText=$derived(scheduleText[$localization.displayLanguage]);
	let accessDenied = $state(false);
	let loadError = $state('');
	let pageErrorDismissed = $state(false);
	let notices = $state<string[]>([]);
	let noticeIsError = $state(false);
	let activeSection = $state('roles');
	let masterOpened=$state(false),financialOpened=$state(false),workflowsOpened=$state(false);
 $effect(()=>{if(activeSection==='workflows')workflowsOpened=true;});
	$effect(()=>{if(activeSection==='master-management')masterOpened=true;if(activeSection==='financial')financialOpened=true;});
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
			const user = (await apiData<{ user: SessionUser }>(response)).user;
			sessionUser=user;
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
		try {
			const response = await fetch(`/v1/external-links/${item.id}`, { method: 'DELETE' });
			if (!response.ok) { noticeIsError = true; notices = [response.status === 403 ? text.linkDeleteForbidden : text.linkDeleteFailed]; return; }
			mode = null; selected = null; returnToDetail = false; notices = [text.linkDeleted];
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
				<PageTabs embedded bind:active={activeSection} label={text.sections} idPrefix="system-setting" panelPrefix="" storageKey="system-settings-tab" tabs={[{id:'workflows',label:$localization.displayLanguage==='ja'?'ワークフロー':'Workflows'},{id:'widgets',label:$localization.displayLanguage==='ja'?'ウィジェット':'Widgets'},{id:'roles',label:text.roles},{id:'external-links',label:text.links},{id:'master-management',label:text.masterManagementTab},{id:'financial',label:text.financialTab},...(canOperate(sessionUser,'rooms.update')?[{id:'room-booking',label:bookingText.bookingSettings}]:[])]} />
				<div class="settings-content">
 <div id="workflows" class="settings-card" role="tabpanel" aria-labelledby="system-setting-workflows-tab" hidden={activeSection!=='workflows'} tabindex="0">{#if workflowsOpened}<WorkflowSettings/>{/if}</div>
 {#if canOperate(sessionUser,'rooms.update')}<div id="room-booking" class="settings-card" role="tabpanel" aria-labelledby="system-setting-room-booking-tab" hidden={activeSection!=='room-booking'} tabindex="0"><section class="app-detail-section"><h3>{bookingText.bookingSettings}</h3><ModalActionButton label={bookingText.bookingSettings} variant="secondary" onclick={event=>{bookingTrigger=event.currentTarget instanceof HTMLElement?event.currentTarget:null;bookingOpen=true;}}/></section></div>{/if}
 <div id="widgets" class="settings-card" role="tabpanel" aria-labelledby="system-setting-widgets-tab" hidden={activeSection !== 'widgets'} tabindex="0"><WidgetSettingsSection /></div>
					<div id="roles" class="settings-card" role="tabpanel" aria-labelledby="system-setting-roles-tab" hidden={activeSection !== 'roles'} tabindex="0"><RoleManagementSection onNotice={(messages) => { notices = messages; noticeIsError = false; }} /></div>
					<div id="external-links" class="settings-card" role="tabpanel" aria-labelledby="system-setting-external-links-tab" hidden={activeSection !== 'external-links'} tabindex="0">
						<MasterList bind:this={list} endpoint="/v1/external-links" title={text.links} listHeading={text.links} description={text.linksDescription} {columns} canManage canDetail headerActions={listActions} initialSortBy="sortOrder" unpaged hideColumnHeaders showNameIcon minTableWidth={0} reorderEndpoint="/v1/system-setting-orders/external-links" reorderHint={text.reorderHint} reorderSavingLabel={text.reorderSaving} onReorderError={(reason) => { noticeIsError = true; notices = [reason === 'conflict' ? text.reorderConflict : reason === 'forbidden' ? text.reorderForbidden : text.reorderFailed]; }} onReordered={() => { void loadExternalLinks(true); }} onDetail={(item, trigger) => openModal('detail', item as ExternalLink, trigger)} emptyLabel={text.noLinks} />
					</div>
					<div id="master-management" class="settings-card" role="tabpanel" aria-labelledby="system-setting-master-management-tab" hidden={activeSection!=='master-management'} tabindex="0">{#if masterOpened&&sessionUser}<MasterManagementSection user={sessionUser}/>{/if}</div>
 <div id="financial" class="settings-card" role="tabpanel" aria-labelledby="system-setting-financial-tab" hidden={activeSection!=='financial'} tabindex="0">{#if financialOpened}<FinancialManagementSection/>{/if}</div>
				</div>
			</div>
		{/if}
	</div>
</AssetManagementShell>

{#if bookingOpen&&sessionUser&&!accessDenied&&canOperate(sessionUser,'rooms.update')}<RoomBookingSettings user={sessionUser} returnFocus={bookingTrigger} onClose={()=>bookingOpen=false}/>{/if}

{#if mode === 'detail' && selected}
	<DetailModal title={text.linkDetails} titleId="external-link-detail-title" closeLabel={text.closeLinkDetails} {returnFocus} compact dialogClass="external-link-dialog" onClose={closeDetail}>
		{#snippet headerActions()}<DetailActionButtons editing={false} editLabel={common.edit} deleteLabel={common.delete} disabled={removing} onEdit={() => openModal('edit', selected, returnFocus)} onDelete={() => void remove(selected!)} />{/snippet}
{#if selected}{#snippet tabInformation()}{#if selected}		<section class="app-detail-section"><h3>{text.linkInformation}</h3><dl class="app-detail-grid"><div><dt>{text.name}</dt><dd>{selected.name}</dd></div><div class="app-detail-wide"><dt>{text.url}</dt><dd><a class="detail-link" href={selected.url} target="_blank" rel="noopener noreferrer">{selected.url}</a></dd></div><div class="app-detail-wide"><dt>{text.notes}</dt><dd class="app-detail-notes">{selected.notes ?? ''}</dd></div><div><dt>{text.created}</dt><dd>{formatTimestamp(selected.createdAt, $localization)}</dd></div><div><dt>{text.updated}</dt><dd>{formatTimestamp(selected.updatedAt, $localization)}</dd></div></dl></section>
		{/if}{/snippet}
{#snippet tabHistory()}{#if selected}<MasterHistorySection collapsible={false} endpoint="/v1/external-links" itemId={selected.id} fieldLabels={{ name: text.name, url: text.url, notes: text.notes }} hiddenFields={['sortOrder']} />{/if}{/snippet}
<DetailTabs label={common.basicInformation} tabs={[{id:"basic",label:common.basicInformation,content:tabInformation},{id:"history",label:common.history,content:tabHistory}]} />{/if}
	</DetailModal>
{:else if mode}
	<ModalBackdrop>
		<dialog bind:this={dialogElement} class="external-link-dialog app-modal app-modal--compact" open aria-modal="true" aria-labelledby="external-link-dialog-title">
			<header><h2 id="external-link-dialog-title">{mode === 'add' ? text.addLink : text.editLink}</h2><IconActionButton class="app-modal-close" type="button" aria-label={text.closeLinkDialog} disabled={saving} onclick={requestCloseModal} data-button-scope="button-850062537b"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg></IconActionButton></header>
			<form class="app-modal-form" novalidate onsubmit={(event) => { event.preventDefault(); void save(); }}>
				<div class="app-modal-form-body external-link-form-body">{#if noticeIsError && notices.length}<StatusNotice message={notices.join(' \n')} tone="error" onDismiss={()=>notices=[]} />{/if}<FormTabs label={text.linkInformation}><div data-form-panel="basic">

					{#if formError}<StatusNotice title={text.linkSaveHeading} message={formError} tone="error" onDismiss={() => formError = ''} />{/if}
					<FormSection title={text.linkInformation} framed columns={2}>
						<label><span>{text.name} <span class="required" aria-hidden="true">*</span></span><input name="name" value={form.name} required maxlength="128" class:invalid={Boolean(errors.name)} aria-invalid={Boolean(errors.name)} aria-describedby={errors.name ? 'external-link-name-error' : undefined} oninput={(event) => updateField('name', event.currentTarget.value)} />{#if errors.name}<span class="field-error" id="external-link-name-error" role="alert">{errors.name}</span>{/if}</label>
						<label class="wide"><span>{text.url} <span class="required" aria-hidden="true">*</span></span><input name="url" type="url" inputmode="url" autocomplete="url" placeholder="https://" value={form.url} required maxlength="2048" class:invalid={Boolean(errors.url)} aria-invalid={Boolean(errors.url)} aria-describedby={errors.url ? 'external-link-url-error' : 'external-link-url-hint'} oninput={(event) => updateField('url', event.currentTarget.value)} />{#if errors.url}<span class="field-error" id="external-link-url-error" role="alert">{errors.url}</span>{:else}<small id="external-link-url-hint" class="field-hint">{text.urlHint}</small>{/if}</label>
</FormSection><FormSection title={text.notes} framed>						<label class="wide"><span>{text.notes}</span><textarea name="notes" value={form.notes} maxlength="5000" oninput={(event) => updateField('notes', event.currentTarget.value)}></textarea></label>
					</FormSection>

</div></FormTabs></div>
				<footer class="app-modal-footer">{#if mode==='edit' && selected}<ModalActionButton class="app-danger-action editor-delete" type="button" disabled={saving} onclick={()=>void remove(selected!)} variant="danger" data-button-scope="button-850062537b">{common.delete}</ModalActionButton>{/if}<ModalActionButton class="secondary" type="button" disabled={saving} onclick={requestCloseModal} variant="secondary" data-button-scope="button-850062537b">{common.cancel}</ModalActionButton><ModalActionButton class="app-primary-action" type="submit" disabled={saving || (mode === 'edit' && !hasUnsavedChanges)} variant="primary" data-button-scope="button-850062537b">{saving ? common.saving : mode === 'add' ? text.addLink : common.saveChanges}</ModalActionButton></footer>
			</form>
		</dialog>
	</ModalBackdrop>
	{#if confirmingDiscard}<DiscardChangesDialog onContinue={() => confirmingDiscard = false} onDiscard={closeModalImmediately} />{/if}
{/if}

<style>
	/* Let settings dialogs rise above the fixed shell while retaining table isolation at rest. */
	.settings-layout{--page-tabs-font-size:var(--font-size-support);--page-tabs-min-height:32px;--page-tabs-padding:10px 12px;--page-tabs-mobile-min-height:44px;--page-tabs-mobile-padding:8px}
	.settings-content:has(:global(.app-modal-backdrop)){isolation:auto}
	.settings-layout{background:var(--surface);border:1px solid var(--border);border-radius:6px;box-shadow:var(--shadow)}
	.settings-card :global(.master-list),.settings-card :global(.financial-settings){border:0;border-radius:0 0 6px 6px;box-shadow:none}
	.settings-card :global(.widget-settings > .panel),.settings-card :global(.finance-page > .panel){margin-bottom:0;border:0;border-radius:0 0 6px 6px;box-shadow:none}

	.settings-page{width:100%}.settings-layout{min-width:0}.settings-content{display:grid;min-width:0;grid-template-columns:minmax(0,1fr);gap:0;isolation:isolate}.settings-card{position:relative;min-width:0;min-height:0;scroll-margin-top:72px}.settings-card :global(.master-list){max-height:none}.settings-card :global(.master-header){flex-wrap:wrap}.settings-card :global(th),.settings-card :global(td){padding-right:6px;padding-left:6px;overflow-wrap:anywhere}.settings-card :global(td:first-child){padding-left:10px}.settings-card :global(.actions-cell){padding-right:6px;padding-left:2px}.page-state{padding:24px;background:var(--surface);border:1px solid var(--border);border-radius:6px;color:var(--muted)}.detail-link{color:var(--action-primary);overflow-wrap:anywhere}.external-link-dialog{width:min(100%,720px)}.external-link-form-body{grid-template-columns:1fr}.wide{grid-column:1/-1}
	@media(max-width:900px){.settings-layout{min-width:0}}
	@media (max-width:700px), (min-width:701px) and (max-width:1024px) and (max-height:500px) and (any-pointer:coarse){.settings-layout{min-width:0}.wide{grid-column:auto}}
@media (max-width:700px), (min-width:701px) and (max-width:1024px) and (max-height:500px) and (any-pointer:coarse){.settings-layout{min-width:0}}
[role='tabpanel']:focus-visible{outline:2px solid var(--primary);outline-offset:-2px}
</style>
