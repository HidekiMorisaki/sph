<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { apiData } from '$lib/api';
	import AddButton from '$lib/components/AddButton.svelte';
	import AssetManagementShell from '$lib/components/AssetManagementShell.svelte';
	import DetailModal from '$lib/components/DetailModal.svelte';
	import DiscardChangesDialog from '$lib/components/DiscardChangesDialog.svelte';
	import FormSection from '$lib/components/FormSection.svelte';
	import MasterList from '$lib/components/MasterList.svelte';
	import MasterPageHeader from '$lib/components/MasterPageHeader.svelte';
	import ModalBackdrop from '$lib/components/ModalBackdrop.svelte';
	import RoleManagementSection from '$lib/components/system-settings/RoleManagementSection.svelte';
	import SystemInformationSection from '$lib/components/system-settings/SystemInformationSection.svelte';
	import { loadExternalLinks, type ExternalLink } from '$lib/externalLinks';
	import { formatTimestamp, localization } from '$lib/localization';
	import { formSnapshot } from '$lib/modalForm';
	import { productName } from '$lib/brand';

	type ModalMode = 'add' | 'edit' | 'detail' | null;
	type FormField = 'name' | 'url' | 'sortOrder';
	type SystemSettingsSection = 'roles' | 'external-links' | 'system-information';
	const systemSettingsSections: SystemSettingsSection[] = ['roles', 'external-links', 'system-information'];
	const emptyForm = () => ({ name: '', url: '', sortOrder: '9999' });

	let loading = $state(true);
	let accessDenied = $state(false);
	let loadError = $state('');
	let notice = $state('');
	let activeSection = $state<SystemSettingsSection>('roles');
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
	let initialSnapshot = $state('');
	let confirmingDiscard = $state(false);
	let scrollFrame: number | null = null;
	let navigationLockUntil = 0;
	let hasUnsavedChanges = $derived(mode === 'edit' && initialSnapshot !== '' && formSnapshot(form) !== initialSnapshot);

	const columns = [
		{ key: 'name', label: 'Name', width: 65, cell: nameCell },
		{ key: 'sortOrder', label: 'Sort order', width: 25, value: (item: ExternalLink) => item.sortOrder }
	];

	function updateActiveSection() {
		scrollFrame = null;
		if (window.performance.now() < navigationLockUntil) return;
		const marker = 104;
		let next: SystemSettingsSection = systemSettingsSections[0];
		for (const section of systemSettingsSections) {
			const element = document.getElementById(section);
			if (element && element.getBoundingClientRect().top <= marker) next = section;
		}
		activeSection = next;
	}
	function scheduleActiveSectionUpdate() { if (scrollFrame === null) scrollFrame = window.requestAnimationFrame(updateActiveSection); }
	function selectSection(event: MouseEvent, section: SystemSettingsSection) {
		event.preventDefault(); activeSection = section; navigationLockUntil = window.performance.now() + 1200;
		document.getElementById(section)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	}
	async function initializeSectionNavigation() {
		await tick();
		const hashSection = window.location.hash.slice(1);
		if (systemSettingsSections.includes(hashSection as SystemSettingsSection)) {
			activeSection = hashSection as SystemSettingsSection;
			document.getElementById(activeSection)?.scrollIntoView({ block: 'start' });
			window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
		} else updateActiveSection();
	}
	async function initialize() {
		try {
			const response = await fetch('/v1/auth/session');
			if (response.status === 401) { window.location.assign('/'); return; }
			if (!response.ok) throw new Error();
			const user = (await apiData<{ user: { capabilities: { canManageSystemSettings: boolean } } }>(response)).user;
			accessDenied = !user.capabilities.canManageSystemSettings;
		} catch { loadError = 'Unable to load system settings. Refresh the page and try again.'; }
		finally { loading = false; if (!accessDenied && !loadError) await initializeSectionNavigation(); }
	}

	function openModal(next: Exclude<ModalMode, null>, item: ExternalLink | null = null, trigger: HTMLElement | null = null) {
		returnFocus = trigger ?? (document.activeElement instanceof HTMLElement ? document.activeElement : addButton ?? null);
		selected = item; mode = next;
		form = item ? { name: item.name, url: item.url, sortOrder: String(item.sortOrder) } : emptyForm();
		errors = {}; formError = ''; initialSnapshot = formSnapshot(form); confirmingDiscard = false;
		if (next !== 'detail') void tick().then(() => dialogElement?.querySelector<HTMLInputElement>('[name="name"]')?.focus());
	}
	function closeDetail() { mode = null; selected = null; }
	function closeModalImmediately() {
		if (saving || removing) return;
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
		if (!form.name.trim()) next.name = 'Name is required.';
		else if (form.name.trim().length > 128) next.name = 'Enter 128 characters or fewer.';
		if (!form.url.trim()) next.url = 'URL is required.';
		else {
			try {
				const url = new URL(form.url.trim());
				if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) next.url = 'Enter a valid HTTP or HTTPS URL.';
				else if (url.username || url.password) next.url = 'Do not include a username or password in the URL.';
			} catch { next.url = 'Enter a valid HTTP or HTTPS URL.'; }
		}
		if (!/^\d+$/.test(form.sortOrder) || !Number.isSafeInteger(Number(form.sortOrder)) || Number(form.sortOrder) > 2_147_483_647) next.sortOrder = 'Enter a whole number from 0 to 2147483647.';
		errors = next;
		if (!Object.keys(next).length) return true;
		formError = 'Correct the highlighted fields.';
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
				body: JSON.stringify({ name: form.name.trim(), url: form.url.trim(), sortOrder: Number(form.sortOrder) })
			});
			if (!response.ok) {
				const payload = await response.json().catch(() => null) as { error?: { message?: string; details?: Array<{ field?: string; reason: string }> } } | null;
				errors = Object.fromEntries((payload?.error?.details ?? []).flatMap((detail) => detail.field && ['name', 'url', 'sortOrder'].includes(detail.field) ? [[detail.field, detail.reason]] : []));
				formError = response.status === 403 ? 'Only a System Administrator can save external links.' : payload?.error?.message ?? 'Unable to save the external link.';
				const field = Object.keys(errors)[0]; if (field) void tick().then(() => dialogElement?.querySelector<HTMLInputElement>(`[name="${field}"]`)?.focus());
				return;
			}
			mode = null; selected = null; notice = 'External link saved.';
			await Promise.all([list?.refresh(), loadExternalLinks(true)]);
			void tick().then(() => returnFocus?.focus());
		} catch { formError = 'Unable to save the external link. Check your connection and try again.'; }
		finally { saving = false; }
	}
	async function remove(item: ExternalLink) {
		if (removing || !confirm(`Delete ${item.name}?`)) return;
		removing = true; notice = '';
		try {
			const response = await fetch(`/v1/external-links/${item.id}`, { method: 'DELETE' });
			if (!response.ok) { notice = response.status === 403 ? 'Only a System Administrator can delete external links.' : 'Unable to delete the external link.'; return; }
			notice = 'External link deleted.';
			await Promise.all([list?.refresh(), loadExternalLinks(true)]);
		} catch { notice = 'Unable to delete the external link.'; }
		finally { removing = false; }
	}
	function handleWindowKeydown(event: KeyboardEvent) {
		if (event.defaultPrevented || confirmingDiscard || !mode || mode === 'detail' || !dialogElement) return;
		if (event.key === 'Escape') { event.preventDefault(); requestCloseModal(); return; }
		if (event.key !== 'Tab') return;
		const focusable = [...dialogElement.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), a[href]')].filter((item) => item.getClientRects().length);
		const first = focusable[0], last = focusable.at(-1); if (!first || !last) return;
		if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
		else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
	}

	onMount(() => {
		window.addEventListener('scroll', scheduleActiveSectionUpdate, { passive: true });
		window.addEventListener('resize', scheduleActiveSectionUpdate);
		void initialize();
		return () => { window.removeEventListener('scroll', scheduleActiveSectionUpdate); window.removeEventListener('resize', scheduleActiveSectionUpdate); if (scrollFrame !== null) window.cancelAnimationFrame(scrollFrame); };
	});
</script>

{#snippet nameCell(item: ExternalLink)}<a class="external-link-name" href={item.url} target="_blank" rel="noopener noreferrer" aria-label={`Open ${item.name} in a new window`} onclick={(event) => event.stopPropagation()}>{item.name}</a>{/snippet}
{#snippet listActions()}<AddButton bind:element={addButton} label="Add external link" onclick={() => openModal('add')} />{/snippet}

<svelte:window onkeydown={handleWindowKeydown} />
<svelte:head><title>System settings · {productName}</title></svelte:head>

<AssetManagementShell title="System settings">
	<div class="settings-page">
		<MasterPageHeader title="System settings" description="Manage system-wide configuration available to your organization." />
		{#if loading}<div class="page-state">Loading system settings…</div>
		{:else if accessDenied}<div class="page-state error" role="alert">System Administrator access is required.</div>
		{:else if loadError}<div class="page-state error" role="alert">{loadError}</div>
		{:else}
			{#if notice}<p class="notice" class:error={notice.startsWith('Unable') || notice.startsWith('Only')} role={notice.startsWith('Unable') || notice.startsWith('Only') ? 'alert' : 'status'}>{notice}</p>{/if}
			<div class="settings-layout">
				<nav class="settings-nav" aria-label="System settings sections"><a class:active={activeSection === 'roles'} href="#roles" aria-current={activeSection === 'roles' ? 'location' : undefined} onclick={(event) => selectSection(event, 'roles')}>Roles</a><a class:active={activeSection === 'external-links'} href="#external-links" aria-current={activeSection === 'external-links' ? 'location' : undefined} onclick={(event) => selectSection(event, 'external-links')}>External links</a><a class:active={activeSection === 'system-information'} href="#system-information" aria-current={activeSection === 'system-information' ? 'location' : undefined} onclick={(event) => selectSection(event, 'system-information')}>System information</a></nav>
				<div class="settings-content">
					<section id="roles" class="settings-card" aria-label="Role settings"><RoleManagementSection onNotice={(message) => notice = message} /></section>
					<section id="external-links" class="settings-card" aria-label="External links settings">
						<MasterList bind:this={list} endpoint="/v1/external-links" searchParam="q" title="External links" listHeading="External links" description="Manage the other systems shown in every user's sidebar." {columns} canManage canDetail canEdit canDelete headerActions={listActions} initialSortBy="sortOrder" sortStorageKey="system-settings-sort:/v1/external-links" pageSizeStorageKey="external-links-page-size" minTableWidth={0} actionWidth={10} onDetail={(item, trigger) => openModal('detail', item as ExternalLink, trigger)} onEdit={(item, trigger) => openModal('edit', item as ExternalLink, trigger)} onDelete={(item) => remove(item as ExternalLink)} emptyLabel="No external links found." />
					</section>
					<section id="system-information" class="settings-card" aria-label="System information"><SystemInformationSection /></section>
				</div>
			</div>
		{/if}
	</div>
</AssetManagementShell>

{#if mode === 'detail' && selected}
	<DetailModal title="External link details" titleId="external-link-detail-title" closeLabel="Close external link details" {returnFocus} compact dialogClass="external-link-dialog" onClose={closeDetail}>
		<section class="app-detail-section"><h3>Link information</h3><dl class="app-detail-grid"><div><dt>Name</dt><dd>{selected.name}</dd></div><div><dt>Sort order</dt><dd>{selected.sortOrder}</dd></div><div class="app-detail-wide"><dt>URL</dt><dd><a class="detail-link" href={selected.url} target="_blank" rel="noopener noreferrer">{selected.url}</a></dd></div><div><dt>Created</dt><dd>{formatTimestamp(selected.createdAt, $localization)}</dd></div><div><dt>Updated</dt><dd>{formatTimestamp(selected.updatedAt, $localization)}</dd></div></dl></section>
	</DetailModal>
{:else if mode}
	<ModalBackdrop onDismiss={requestCloseModal} disabled={saving || removing}>
		<dialog bind:this={dialogElement} class="external-link-dialog app-modal app-modal--compact" open aria-modal="true" aria-labelledby="external-link-dialog-title">
			<header><h2 id="external-link-dialog-title">{mode === 'add' ? 'Add external link' : 'Edit external link'}</h2><button class="app-modal-close" type="button" aria-label="Close external link dialog" disabled={saving} onclick={requestCloseModal}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg></button></header>
			<form class="app-modal-form" novalidate onsubmit={(event) => { event.preventDefault(); void save(); }}>
				<div class="app-modal-form-body external-link-form-body">
					{#if formError}<div class="app-modal-error-summary" role="alert"><strong>Unable to save external link</strong><span>{formError}</span></div>{/if}
					<FormSection title="Link information" framed columns={2}>
						<label><span>Name <span class="required" aria-hidden="true">*</span></span><input name="name" value={form.name} required maxlength="128" class:invalid={Boolean(errors.name)} aria-invalid={Boolean(errors.name)} aria-describedby={errors.name ? 'external-link-name-error' : undefined} oninput={(event) => updateField('name', event.currentTarget.value)} />{#if errors.name}<span class="field-error" id="external-link-name-error" role="alert">{errors.name}</span>{/if}</label>
						<label><span>Sort order <span class="required" aria-hidden="true">*</span></span><input name="sortOrder" type="number" min="0" max="2147483647" step="1" value={form.sortOrder} required class:invalid={Boolean(errors.sortOrder)} aria-invalid={Boolean(errors.sortOrder)} aria-describedby={errors.sortOrder ? 'external-link-sort-error' : undefined} oninput={(event) => updateField('sortOrder', event.currentTarget.value)} />{#if errors.sortOrder}<span class="field-error" id="external-link-sort-error" role="alert">{errors.sortOrder}</span>{/if}</label>
						<label class="wide"><span>URL <span class="required" aria-hidden="true">*</span></span><input name="url" type="url" inputmode="url" autocomplete="url" placeholder="https://" value={form.url} required maxlength="2048" class:invalid={Boolean(errors.url)} aria-invalid={Boolean(errors.url)} aria-describedby={errors.url ? 'external-link-url-error' : 'external-link-url-hint'} oninput={(event) => updateField('url', event.currentTarget.value)} />{#if errors.url}<span class="field-error" id="external-link-url-error" role="alert">{errors.url}</span>{:else}<small id="external-link-url-hint" class="field-hint">Use an HTTP or HTTPS URL without embedded credentials.</small>{/if}</label>
					</FormSection>
				</div>
				<footer class="app-modal-footer"><button class="secondary" type="button" disabled={saving} onclick={requestCloseModal}>Cancel</button><button class="app-primary-action" type="submit" disabled={saving}>{saving ? 'Saving…' : mode === 'add' ? 'Add external link' : 'Save changes'}</button></footer>
			</form>
		</dialog>
	</ModalBackdrop>
	{#if confirmingDiscard}<DiscardChangesDialog onContinue={() => confirmingDiscard = false} onDiscard={closeModalImmediately} />{/if}
{/if}

<style>
	.settings-page{width:100%}.settings-layout{display:grid;grid-template-columns:220px minmax(0,1fr);gap:20px;align-items:start}.settings-nav{position:sticky;top:72px;z-index:2;display:flex;align-self:start;flex-direction:column;gap:1px;padding:6px;background:var(--surface);border:1px solid var(--border);border-radius:6px;box-shadow:var(--shadow);isolation:isolate}.settings-nav a{display:flex;align-items:center;min-height:32px;padding:7px 10px;color:var(--text-secondary);border-radius:4px;font-size:13px;font-weight:500;text-decoration:none;transition:background 120ms,color 120ms}.settings-nav a:hover,.settings-nav a:focus-visible{background:var(--surface-secondary);color:var(--text)}.settings-nav a:focus-visible{outline:2px solid #1abb9c;outline-offset:1px}.settings-nav a.active{background:rgba(51,122,183,.14);color:var(--action-primary)}.settings-content{display:flex;min-width:0;flex-direction:column;gap:20px;isolation:isolate}.settings-card{position:relative;min-width:0;scroll-margin-top:72px}.page-state{padding:24px;background:var(--surface);border:1px solid var(--border);border-radius:6px;color:var(--muted)}.page-state.error{color:var(--danger)}.notice{margin:0 0 16px;padding:10px 12px;background:rgba(26,187,156,.08);color:#168b76;border:1px solid rgba(26,187,156,.28);border-radius:5px;font-size:12px}.notice.error{background:color-mix(in srgb,var(--danger) 9%,transparent);color:var(--danger);border-color:color-mix(in srgb,var(--danger) 28%,transparent)}.external-link-name,.detail-link{color:var(--action-primary);overflow-wrap:anywhere}.external-link-dialog{width:min(100%,720px)}.external-link-form-body{grid-template-columns:1fr}.wide{grid-column:1/-1}
	@media(max-width:900px){.settings-layout{grid-template-columns:1fr}.settings-nav{position:static;display:grid;grid-template-columns:repeat(3,minmax(0,1fr))}.settings-nav a{justify-content:center;text-align:center}}
	@media(max-width:700px){.settings-layout{gap:16px}.settings-nav{grid-template-columns:1fr}.settings-nav a{justify-content:flex-start;text-align:left}.wide{grid-column:auto}}
</style>
