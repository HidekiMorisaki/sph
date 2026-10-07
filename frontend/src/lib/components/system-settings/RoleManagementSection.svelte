<script lang="ts">
	import { tick } from 'svelte';
	import DiscardChangesDialog from '$lib/components/DiscardChangesDialog.svelte';
	import FormSection from '$lib/components/FormSection.svelte';
	import MasterList from '$lib/components/MasterList.svelte';
	import MasterRecordDetailModal from '$lib/components/MasterRecordDetailModal.svelte';
	import ModalBackdrop from '$lib/components/ModalBackdrop.svelte';
	import StatusNotice from '$lib/components/StatusNotice.svelte';
	import { formSnapshot } from '$lib/modalForm';

	import { localeMessages } from '$lib/locale-messages';
	import { systemSettingError, systemSettingReason } from '$lib/system-setting-errors';
	import { localization } from '$lib/localization';
	let text = $derived(localeMessages[$localization.displayLanguage].systemSettings);
	let common = $derived(localeMessages[$localization.displayLanguage].common);

	type Role = { id: number; name: string; notes: string | null; createdAt: string; updatedAt: string; permissionCodes: string[]; defaultPermissionCodes?: string[] | null; isSystemManagement: boolean };
	type Permission = { code: string; category: string; systemAdministratorOnly: boolean };
	type RoleField = 'name';

	let { onNotice = (_messages: string[]) => undefined }: { onNotice?: (messages: string[]) => void } = $props();
	let list = $state<MasterList>();
	let selected = $state<Role | null>(null);
	let detailRole = $state<Role | null>(null);
	let name = $state('');
	let notes = $state('');
	let errors = $state<Partial<Record<RoleField, string>>>({});
	let formError = $state('');
	let saving = $state(false);
	let dialogElement = $state<HTMLDialogElement>();
	let returnFocus = $state<HTMLElement | null>(null);
	let initialSnapshot = $state('');
	let confirmingDiscard = $state(false);
	let reorderError = $state('');
	let permissions = $state<Permission[]>([]);
	let visiblePermissions = $derived(permissions.filter((permission) => permission.code !== 'roles.read'));
	let selectedCodes = $state<string[]>([]);
	let permissionError = $state('');
	let hasUnsavedChanges = $derived(Boolean(selected) && initialSnapshot !== '' && formSnapshot({ name, notes }) !== initialSnapshot);
	let permissionsChanged = $derived(Boolean(selected) && JSON.stringify([...selectedCodes].sort()) !== JSON.stringify((selected?.permissionCodes ?? []).filter((code) => code !== 'system.manage').sort()));
	let atDefaultPermissions = $derived(JSON.stringify([...selectedCodes].sort()) === JSON.stringify((selected?.defaultPermissionCodes ?? []).filter((code) => code !== 'system.manage').sort()));
	let permissionLabels = $derived<Record<string, string>>({
		'employees.read': text.permissionEmployeeRead, 'employees.manage': text.permissionEmployeeManage,
		'masters.read': text.permissionMasterRead, 'masters.manage': text.permissionMasterManage,
		'branches.manage': text.permissionBranchManage,
		'calendars.read': text.permissionCalendarRead, 'calendars.assign': text.permissionCalendarAssign,
		'assets.read': text.permissionAssetRead, 'assets.manage': text.permissionAssetManage,
		'assets.credentials.read': text.permissionCredentialRead, 'assets.credentials.write': text.permissionCredentialWrite
	});
	let categoryLabels = $derived<Record<string, string>>({ employees: text.permissionEmployees, masters: text.permissionMasters, calendars: text.permissionCalendars, assets: text.permissionAssets });
	let permissionDescriptions = $derived<Record<string, string>>({
		'employees.read': text.permissionEmployeeReadHelp, 'employees.manage': text.permissionEmployeeManageHelp,
		'masters.read': text.permissionMasterReadHelp, 'masters.manage': text.permissionMasterManageHelp,
		'branches.manage': text.permissionBranchManageHelp,
		'calendars.read': text.permissionCalendarReadHelp, 'calendars.assign': text.permissionCalendarAssignHelp,
		'assets.read': text.permissionAssetReadHelp, 'assets.manage': text.permissionAssetManageHelp,
		'assets.credentials.read': text.permissionCredentialReadHelp, 'assets.credentials.write': text.permissionCredentialWriteHelp
	});

	async function loadPermissions() {
		try {
			const response = await fetch('/v1/permissions');
			if (!response.ok) throw new Error();
			const body = await response.json() as { data?: { permissions?: Permission[] } };
			permissions = body.data?.permissions ?? [];
		} catch { permissionError = text.permissionLoadFailed; }
	}

	let columns = $derived([
		{ key: 'name', label: text.name, width: 90, value: (item: Role) => item.name }
	]);

	function openEdit(item: Role, trigger: HTMLButtonElement | null) {
		if (item.isSystemManagement) return;
		returnFocus = trigger ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
		selected = item;
		selectedCodes = item.permissionCodes.filter((code) => code !== 'system.manage');
		permissionError = '';
		if (!permissions.length) void loadPermissions();
		name = item.name;
		notes = item.notes ?? '';
		errors = {};
		formError = '';
		confirmingDiscard = false;
		initialSnapshot = formSnapshot({ name, notes });
		void tick().then(() => dialogElement?.querySelector<HTMLInputElement>('[name="name"]')?.focus());
	}

	function closeImmediately() {
		if (saving) return;
		confirmingDiscard = false;
		selected = null;
		initialSnapshot = '';
		void tick().then(() => returnFocus?.focus());
	}

	function requestClose() {
		if (saving) return;
		if (hasUnsavedChanges || permissionsChanged) { confirmingDiscard = true; return; }
		closeImmediately();
	}

	function updateName(value: string) {
		name = value;
		if (errors.name) errors = {};
		if (!Object.keys(errors).length) formError = '';
	}

	function validate() {
		const next: Partial<Record<RoleField, string>> = {};
		if (!name.trim()) next.name = text.nameRequired;
		else if (name.trim().length > 128) next.name = text.nameLength;
		errors = next;
		if (!Object.keys(next).length) return true;
		formError = text.correctFields;
		void tick().then(() => dialogElement?.querySelector<HTMLInputElement>('[name="name"]')?.focus());
		return false;
	}

	async function save() {
		if (!selected || selected.isSystemManagement || (!hasUnsavedChanges && !permissionsChanged) || !validate()) return;
		saving = true;
		formError = '';
		try {
			const updatingRoleInfo = hasUnsavedChanges;
			const updatingPermissions = permissionsChanged;
			const response = await fetch(updatingPermissions ? `/v1/roles/${selected.id}/permissions` : `/v1/roles/${selected.id}`, {
				method: updatingPermissions ? 'PUT' : 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(updatingPermissions
					? { permissionCodes: selectedCodes, expectedUpdatedAt: selected.updatedAt, ...(updatingRoleInfo ? { name: name.trim(), notes } : {}) }
					: { name: name.trim(), notes })
			});
			if (!response.ok) {
				const payload = await response.json().catch(() => null) as { error?: { code?: string; details?: Array<{ field?: string; reason: string }> } } | null;
				errors = Object.fromEntries((payload?.error?.details ?? []).flatMap((detail) => detail.field === 'name' ? [['name', systemSettingReason(detail.reason, text, 'role')]] : []));
				formError = response.status === 403 ? text.roleForbidden
					: payload?.error?.code === 'STALE_ROLE' ? text.permissionConflict
					: systemSettingError(payload?.error?.code, response.status, text, 'role', updatingPermissions ? text.permissionSaveFailed : text.roleSaveFailed);
				if (errors.name) void tick().then(() => dialogElement?.querySelector<HTMLInputElement>('[name="name"]')?.focus());
				return;
			}
			selected = null;
			initialSnapshot = '';
			onNotice([
				...(updatingRoleInfo ? [text.roleInfoSaved] : []),
				...(updatingPermissions ? [text.rolePermissionsSaved] : [])
			]);
			await list?.refresh();
			void tick().then(() => returnFocus?.focus());
		} catch {
			formError = text.roleSaveRetry;
		} finally {
			saving = false;
		}
	}

	function togglePermission(code: string) {
		const prerequisites: Record<string, string[]> = {
			'employees.manage': ['employees.read', 'roles.read'],
			'masters.manage': ['masters.read'], 'branches.manage': ['masters.read'],
			'calendars.assign': ['calendars.read'],
			'assets.manage': ['assets.read'],
			'assets.credentials.read': ['assets.read'], 'assets.credentials.write': ['assets.read']
		};
		if (selectedCodes.includes(code)) {
			selectedCodes = selectedCodes.filter((item) => item !== code && !(code === 'employees.manage' && item === 'roles.read') && !(prerequisites[item] ?? []).includes(code));
		} else {
			selectedCodes = [...new Set([...selectedCodes, code, ...(prerequisites[code] ?? [])])];
		}
		permissionError = '';
	}

	function resetPermissionsToDefault() {
		if (!selected?.defaultPermissionCodes || saving) return;
		selectedCodes = selected.defaultPermissionCodes.filter((code) => code !== 'system.manage');
		permissionError = '';
	}

	function handleWindowKeydown(event: KeyboardEvent) {
		if (event.defaultPrevented || confirmingDiscard || !selected || !dialogElement) return;
		if (event.key === 'Escape') { event.preventDefault(); requestClose(); return; }
		if (event.key !== 'Tab') return;
		const focusable = [...dialogElement.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), textarea:not([disabled])')].filter((item) => item.getClientRects().length);
		const first = focusable[0], last = focusable.at(-1);
		if (!first || !last) return;
		if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
		else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
	}
</script>

<svelte:window onkeydown={handleWindowKeydown} />

{#if reorderError}<StatusNotice message={reorderError} tone="error" onDismiss={() => reorderError = ''} />{/if}
<MasterList bind:this={list} endpoint="/v1/roles" title={text.roles} listHeading={text.roles} description={text.rolesDescription} {columns} canManage canDetail canEdit={(item) => !(item as Role).isSystemManagement} initialSortBy="sortOrder" unpaged hideColumnHeaders showNameIcon minTableWidth={0} actionWidth={14} reorderEndpoint="/v1/system-setting-orders/roles" reorderHint={text.reorderHint} reorderSavingLabel={text.reorderSaving} onReorderError={(reason) => reorderError = reason === 'conflict' ? text.reorderConflict : reason === 'forbidden' ? text.reorderForbidden : text.reorderFailed} onDetail={(item, trigger) => { detailRole = item as Role; returnFocus = trigger; }} onEdit={(item, trigger) => openEdit(item as Role, trigger)} emptyLabel={text.noRoles} />

{#if detailRole}<MasterRecordDetailModal title={`${text.roles} ${common.detail}`} titleId="role-detail-title" sectionTitle={common.basicInformation} closeLabel={common.close} {returnFocus} endpoint="/v1/roles" itemId={detailRole.id} fields={[{ key: 'name', label: text.name, value: detailRole.name }, { key: 'notes', label: text.notes, value: detailRole.notes }]} hiddenHistoryFields={['sortOrder']} onClose={() => detailRole = null} />{/if}

{#if selected}
	<ModalBackdrop>
		<dialog bind:this={dialogElement} class="role-dialog app-modal app-modal--compact" open aria-modal="true" aria-labelledby="role-dialog-title">
			<header><h2 id="role-dialog-title">{text.editRole}</h2><button class="app-modal-close" type="button" aria-label={text.closeRoleDialog} disabled={saving} onclick={requestClose}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg></button></header>
			<form class="app-modal-form" novalidate onsubmit={(event) => { event.preventDefault(); void save(); }}>
				<div class="app-modal-form-body role-form-body">
					{#if formError}<StatusNotice title={text.roleSaveHeading} message={formError} tone="error" onDismiss={() => formError = ''} />{/if}
					<FormSection title={text.roleInformation} framed columns={2}>
						<label><span>{text.name} <span class="required" aria-hidden="true">*</span></span><input name="name" value={name} required maxlength="128" class:invalid={Boolean(errors.name)} aria-invalid={Boolean(errors.name)} aria-describedby={errors.name ? 'role-name-error' : undefined} oninput={(event) => updateName(event.currentTarget.value)} />{#if errors.name}<span class="field-error" id="role-name-error" role="alert">{errors.name}</span>{/if}</label>
						<label class="wide"><span>{text.notes}</span><textarea name="notes" bind:value={notes} maxlength="5000"></textarea></label>
					</FormSection>
					<FormSection title={text.permissionHeading} framed columns={2}>
						{#snippet action()}
							{#if selected?.defaultPermissionCodes}<button class="permission-reset-button" type="button" disabled={saving || atDefaultPermissions} onclick={resetPermissionsToDefault}>{text.resetPermissionsToDefault}</button>{/if}
						{/snippet}
						<div class="permission-section wide">
		{#each ['employees', 'masters', 'calendars', 'assets'] as category}
							{#if visiblePermissions.some((permission) => permission.category === category)}
								<fieldset><legend>{categoryLabels[category]}</legend><div class="permission-options">
									{#each visiblePermissions.filter((permission) => permission.category === category) as permission}
										<label><input type="checkbox" checked={selectedCodes.includes(permission.code)} disabled={saving || (permission.systemAdministratorOnly && !selected.isSystemManagement)} onchange={() => togglePermission(permission.code)} /><span>{permissionLabels[permission.code]}<small>{permissionDescriptions[permission.code]}</small></span></label>
									{/each}
								</div></fieldset>
							{/if}
						{/each}
						{#if permissionError}<StatusNotice message={permissionError} tone="error" onDismiss={() => permissionError = ''} />{/if}
						</div>
					</FormSection>
				</div>
				<footer class="app-modal-footer"><button class="secondary" type="button" disabled={saving} onclick={requestClose}>{common.cancel}</button><button class="app-primary-action" type="submit" disabled={saving || (!hasUnsavedChanges && !permissionsChanged)}>{saving ? common.saving : common.saveChanges}</button></footer>
			</form>
		</dialog>
	</ModalBackdrop>
	{#if confirmingDiscard}<DiscardChangesDialog onContinue={() => confirmingDiscard = false} onDiscard={closeImmediately} />{/if}
{/if}

<style>
	.permission-reset-button{height:32px;min-height:32px;padding:0 12px;background:var(--surface)!important;color:var(--text-secondary)!important;border:1px solid var(--border);border-radius:4px;font-size:var(--font-size-support);font-weight:500;line-height:1;white-space:nowrap}
	.permission-reset-button:hover:not(:disabled){background:var(--surface-secondary)!important;color:var(--text)!important}
	.permission-reset-button:focus-visible{outline:2px solid var(--action-primary);outline-offset:2px}
	.permission-reset-button:disabled{cursor:not-allowed;opacity:.6}
	.role-dialog{width:min(100%,860px)}.role-form-body{grid-template-columns:1fr}.permission-section{display:grid;gap:12px}.permission-section fieldset{border:1px solid var(--border-light);border-radius:5px;padding:10px}.permission-section legend{font-weight:600;padding:0 4px}.permission-options{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.permission-options label{display:flex;align-items:flex-start;gap:8px}.permission-options input{margin-top:3px}.permission-options small{display:block;color:var(--muted);font-size:var(--font-size-support);line-height:1.4}
	@media(max-width:820px){.permission-options{grid-template-columns:1fr}}
</style>
