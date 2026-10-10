<script lang="ts">
	import { tick } from 'svelte';
	import AddButton from '$lib/components/AddButton.svelte';
	import DiscardChangesDialog from '$lib/components/DiscardChangesDialog.svelte';
	import FormSection from '$lib/components/FormSection.svelte';
	import MasterList from '$lib/components/MasterList.svelte';
	import MasterRecordDetailModal from '$lib/components/MasterRecordDetailModal.svelte';
	import ModalBackdrop from '$lib/components/ModalBackdrop.svelte';
	import StatusNotice from '$lib/components/StatusNotice.svelte';
	import { formSnapshot } from '$lib/modalForm';
	import { granularPermissionLabel } from '$lib/granular-permission-labels';

	import { localeMessages, formatLocaleTemplate } from '$lib/locale-messages';
	import { systemSettingError, systemSettingReason } from '$lib/system-setting-errors';
	import { localization } from '$lib/localization';
	let text = $derived(localeMessages[$localization.displayLanguage].systemSettings);
	let common = $derived(localeMessages[$localization.displayLanguage].common);

	type PermissionScope = { code: string; scopeType: 'global' | 'own_branch' };
	type Role = { id: number; name: string; notes: string | null; createdAt: string; updatedAt: string; usageCount: number; permissionCodes: string[]; permissionScopes: PermissionScope[]; editablePermissionScopes: PermissionScope[]; defaultPermissionCodes?: string[] | null; isSystemManagement: boolean; isBranchAdministrator: boolean };
	type Permission = { code: string; category: string; systemAdministratorOnly: boolean; allowOwnBranch: boolean };
	type RoleField = 'name';

	let { onNotice = (_messages: string[]) => undefined }: { onNotice?: (messages: string[]) => void } = $props();
	let list = $state<MasterList>();
	let selected = $state<Role | null>(null);
	let isAdding = $state(false);
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
	let selectedCodes = $state<string[]>([]);
	let scopeByCode = $state<Record<string, 'global' | 'own_branch'>>({});
	let selectedScopes = $derived(selectedCodes.map((code) => ({ code, scopeType: scopeByCode[code] ?? 'global' })).sort((a, b) => a.code.localeCompare(b.code)));
	let permissionError = $state('');
	let deleteError = $state('');
	let removing = $state(false);
	let hasUnsavedChanges = $derived((Boolean(selected) || isAdding) && initialSnapshot !== '' && formSnapshot({ name, notes }) !== initialSnapshot);
	let permissionsChanged = $derived((Boolean(selected) || isAdding) && JSON.stringify(selectedScopes) !== JSON.stringify([...(selected?.editablePermissionScopes ?? [])].sort((a, b) => a.code.localeCompare(b.code))));
	let atDefaultPermissions = $derived(JSON.stringify(selectedScopes) === JSON.stringify((selected?.defaultPermissionCodes ?? []).filter((code) => permissions.some((permission) => permission.code === code)).map((code) => ({ code, scopeType: 'global' })).sort((a, b) => a.code.localeCompare(b.code))));
	let permissionLabels = $derived<Record<string, string>>({
		'system.manage': text.permissionSystemManage,
		'employees.read': text.permissionEmployeeRead, 'employees.manage': text.permissionEmployeeManage,
		'masters.read': text.permissionMasterRead, 'masters.manage': text.permissionMasterManage,
		'branches.manage': text.permissionBranchManage,
		'calendars.read': text.permissionCalendarRead, 'calendars.assign': text.permissionCalendarAssign,
		'assets.read': text.permissionAssetRead, 'assets.manage': text.permissionAssetManage,
		'assets.credentials.read': text.permissionCredentialRead, 'assets.credentials.write': text.permissionCredentialWrite,
		'roles.read': text.permissionRoleRead
	});
	let categoryLabels = $derived<Record<string, string>>({ employees: text.permissionEmployees, masters: text.permissionMasters, calendars: text.permissionCalendars, assets: text.permissionAssets, system: text.permissionSystem, other: text.permissionOther });
	let permissionDescriptions = $derived<Record<string, string>>({
		'system.manage': text.permissionSystemManageHelp,
		'employees.read': text.permissionEmployeeReadHelp, 'employees.manage': text.permissionEmployeeManageHelp,
		'masters.read': text.permissionMasterReadHelp, 'masters.manage': text.permissionMasterManageHelp,
		'branches.manage': text.permissionBranchManageHelp,
		'calendars.read': text.permissionCalendarReadHelp, 'calendars.assign': text.permissionCalendarAssignHelp,
		'assets.read': text.permissionAssetReadHelp, 'assets.manage': text.permissionAssetManageHelp,
		'assets.credentials.read': text.permissionCredentialReadHelp, 'assets.credentials.write': text.permissionCredentialWriteHelp,
		'roles.read': text.permissionRoleReadHelp
	});
	const permissionCategoryByCode: Record<string, string> = {
		'employees.read': 'employees', 'employees.manage': 'employees',
		'masters.read': 'masters', 'masters.manage': 'masters', 'branches.manage': 'masters',
		'calendars.read': 'calendars', 'calendars.assign': 'calendars',
		'assets.read': 'assets', 'assets.manage': 'assets', 'assets.credentials.read': 'assets', 'assets.credentials.write': 'assets',
		'roles.read': 'system', 'system.manage': 'system'
	};
	const detailCategories = ['employees', 'masters', 'calendars', 'assets', 'system', 'other'];
	const knownPermissionCodes = Object.keys(permissionCategoryByCode);
	function permissionCategory(code: string): string {
		const fromCatalog = permissions.find((permission) => permission.code === code)?.category;
		if (fromCatalog) return fromCatalog;
		if (permissionCategoryByCode[code]) return permissionCategoryByCode[code];
		if (/^(branches|rooms|storage)\./.test(code)) return 'masters';
		if (/^(financial|roles|system)\./.test(code)) return 'system';
		return detailCategories.includes(code.split('.')[0]) ? code.split('.')[0] : 'other';
	}
	function availableScopes(code: string): Array<'global' | 'own_branch'> {
		return permissions.find((permission) => permission.code === code)?.allowOwnBranch || detailRole?.permissionScopes.some((entry) => entry.code === code && entry.scopeType === 'own_branch')
			? ['global', 'own_branch'] : ['global'];
	}
	let detailPermissionGroups = $derived(detailCategories.map((category) => ({
		category,
		codes: [...new Set([...knownPermissionCodes, ...permissions.map((permission) => permission.code), ...(detailRole?.permissionCodes ?? [])])]
			.filter((code) => permissionCategory(code) === category)
	})).filter((group) => group.codes.length > 0));

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
		if (item.isSystemManagement || item.isBranchAdministrator) return;
		returnFocus = trigger ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
		selected = item;
		isAdding = false;
		selectedCodes = item.editablePermissionScopes.map(({ code }) => code);
		scopeByCode = Object.fromEntries(item.editablePermissionScopes.map(({ code, scopeType }) => [code, scopeType]));
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

	function openAdd() {
		returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
		selected = null;
		isAdding = true;
		name = '';
		notes = '';
		selectedCodes = [];
		scopeByCode = {};
		errors = {};
		formError = '';
		permissionError = '';
		confirmingDiscard = false;
		initialSnapshot = formSnapshot({ name, notes });
		void loadPermissions();
		void tick().then(() => dialogElement?.querySelector<HTMLInputElement>('[name="name"]')?.focus());
	}

	function closeImmediately() {
		if (saving) return;
		confirmingDiscard = false;
		selected = null;
		isAdding = false;
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
		if ((!selected && !isAdding) || selected?.isSystemManagement || selected?.isBranchAdministrator || (!isAdding && !hasUnsavedChanges && !permissionsChanged) || !validate()) return;
		saving = true;
		formError = '';
		const creating = isAdding;
		try {
			const updatingRoleInfo = hasUnsavedChanges;
			const updatingPermissions = permissionsChanged;
			const response = await fetch(isAdding ? '/v1/roles' : updatingPermissions ? `/v1/roles/${selected?.id}/permissions` : `/v1/roles/${selected?.id}`, {
				method: isAdding ? 'POST' : updatingPermissions ? 'PUT' : 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(isAdding ? { name: name.trim(), notes, permissionScopes: selectedScopes } : updatingPermissions
					? { permissionScopes: selectedScopes, expectedUpdatedAt: selected?.updatedAt, ...(updatingRoleInfo ? { name: name.trim(), notes } : {}) }
					: { name: name.trim(), notes })
			});
			if (!response.ok) {
				const payload = await response.json().catch(() => null) as { error?: { code?: string; details?: Array<{ field?: string; reason: string }> } } | null;
				errors = Object.fromEntries((payload?.error?.details ?? []).flatMap((detail) => detail.field === 'name' ? [['name', systemSettingReason(detail.reason, text, 'role')]] : []));
				formError = response.status === 403 ? text.roleForbidden
					: payload?.error?.code === 'STALE_ROLE' ? text.permissionConflict
					: payload?.error?.code === 'PERMISSION_DEPENDENCY' ? text.permissionDependency
					: systemSettingError(payload?.error?.code, response.status, text, 'role', isAdding ? text.roleCreateFailed : updatingPermissions ? text.permissionSaveFailed : text.roleSaveFailed);
				if (errors.name) void tick().then(() => dialogElement?.querySelector<HTMLInputElement>('[name="name"]')?.focus());
				return;
			}
			selected = null;
			isAdding = false;
			initialSnapshot = '';
			onNotice([
				...(creating ? [text.roleCreated] : updatingRoleInfo ? [text.roleInfoSaved] : []),
				...(!creating && updatingPermissions ? [text.rolePermissionsSaved] : [])
			]);
			await list?.refresh();
			void tick().then(() => returnFocus?.focus());
		} catch {
			formError = isAdding ? text.roleCreateRetry : text.roleSaveRetry;
		} finally {
			saving = false;
		}
	}

	async function remove(item: Role) {
		if (removing || item.isSystemManagement || item.isBranchAdministrator || !confirm(formatLocaleTemplate(text.deleteConfirm, item.name))) return;
		removing = true;
		deleteError = '';
		try {
			const response = await fetch(`/v1/roles/${item.id}`, { method: 'DELETE' });
			if (!response.ok) {
				const payload = await response.json().catch(() => null) as { error?: { code?: string } } | null;
				deleteError = payload?.error?.code === 'RESOURCE_IN_USE' ? text.roleInUse
					: response.status === 403 ? text.roleForbidden
					: systemSettingError(payload?.error?.code, response.status, text, 'role', text.roleDeleteFailed);
				return;
			}
			onNotice([text.roleDeleted]);
			await list?.refresh();
		} catch { deleteError = text.roleDeleteFailed; }
		finally { removing = false; }
	}

	function togglePermission(code: string, scopeType: 'global' | 'own_branch', checked: boolean) {
		const prerequisites: Record<string, string[]> = {
			'employees.read': [], 'roles.read': [], 'masters.read': [], 'assets.read': [], 'calendars.read': []
		};
		for (const permission of permissions) {
			if (permission.code.startsWith('employees.') && permission.code !== 'employees.read') prerequisites[permission.code] = ['employees.read'];
			else if (scopeType === 'own_branch' && /^(rooms|storage|financial)\./.test(permission.code)) prerequisites[permission.code] = ['branches.manage', 'masters.read'];
			else if (/^(masters|branches|rooms|storage|financial)\./.test(permission.code) && permission.code !== 'masters.read') prerequisites[permission.code] = ['masters.read'];
			else if (permission.code.startsWith('assets.') && permission.code !== 'assets.read') prerequisites[permission.code] = ['assets.read'];
			else if (permission.code.startsWith('calendars.') && permission.code !== 'calendars.read') prerequisites[permission.code] = ['calendars.read'];
		}
		if (!checked && (scopeType === 'own_branch' || !permissions.find((permission) => permission.code === code)?.allowOwnBranch)) {
			selectedCodes = selectedCodes.filter((item) => item !== code && !(prerequisites[item] ?? []).includes(code));
		} else {
			selectedCodes = [...new Set([...selectedCodes, code, ...(prerequisites[code] ?? [])])];
			const nextScopes = { ...scopeByCode, [code]: checked ? scopeType : 'own_branch', ...Object.fromEntries((prerequisites[code] ?? []).map((prerequisite) => [prerequisite, checked && scopeType === 'global' ? 'global' : scopeByCode[prerequisite] ?? 'own_branch'])) };
			if (!checked && scopeType === 'global') {
				for (const dependent of selectedCodes.filter((item) => (prerequisites[item] ?? []).includes(code) && nextScopes[item] === 'global')) {
					if (permissions.find((permission) => permission.code === dependent)?.allowOwnBranch) nextScopes[dependent] = 'own_branch';
					else selectedCodes = selectedCodes.filter((item) => item !== dependent);
				}
			}
			scopeByCode = nextScopes;
		}
		permissionError = '';
	}

	function resetPermissionsToDefault() {
		if (!selected?.defaultPermissionCodes || saving) return;
		selectedCodes = selected.defaultPermissionCodes.filter((code) => permissions.some((permission) => permission.code === code));
		scopeByCode = Object.fromEntries(selectedCodes.map((code) => [code, 'global']));
		permissionError = '';
	}

	function handleWindowKeydown(event: KeyboardEvent) {
		if (event.defaultPrevented || confirmingDiscard || (!selected && !isAdding) || !dialogElement) return;
		if (event.key === 'Escape') { event.preventDefault(); requestClose(); return; }
		if (event.key !== 'Tab') return;
		const focusable = [...dialogElement.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), textarea:not([disabled])')].filter((item) => item.getClientRects().length);
		const first = focusable[0], last = focusable.at(-1);
		if (!first || !last) return;
		if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
		else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
	}
</script>

{#snippet listActions()}<AddButton label={text.addRole} onclick={openAdd} />{/snippet}

<svelte:window onkeydown={handleWindowKeydown} />

{#if reorderError}<StatusNotice message={reorderError} tone="error" onDismiss={() => reorderError = ''} />{/if}
{#if deleteError}<StatusNotice message={deleteError} tone="error" onDismiss={() => deleteError = ''} />{/if}
<MasterList bind:this={list} endpoint="/v1/roles" title={text.roles} listHeading={text.roles} description={text.rolesDescription} {columns} canManage canDetail canEdit={(item) => !(item as Role).isSystemManagement && !(item as Role).isBranchAdministrator} canDelete={(item) => !(item as Role).isSystemManagement && !(item as Role).isBranchAdministrator} headerActions={listActions} initialSortBy="sortOrder" unpaged hideColumnHeaders showNameIcon usageLabel={(count) => formatLocaleTemplate(text.roleAssignments, count)} minTableWidth={0} actionWidth={14} reorderEndpoint="/v1/system-setting-orders/roles" reorderHint={text.reorderHint} reorderSavingLabel={text.reorderSaving} onReorderError={(reason) => reorderError = reason === 'conflict' ? text.reorderConflict : reason === 'forbidden' ? text.reorderForbidden : text.reorderFailed} onDetail={(item, trigger) => { detailRole = item as Role; returnFocus = trigger; if (!permissions.length) void loadPermissions(); }} onEdit={(item, trigger) => openEdit(item as Role, trigger)} onDelete={(item) => remove(item as Role)} emptyLabel={text.noRoles} />

{#if detailRole}<MasterRecordDetailModal title={`${text.roles} ${common.detail}`} titleId="role-detail-title" sectionTitle={common.basicInformation} closeLabel={common.close} {returnFocus} endpoint="/v1/roles" itemId={detailRole.id} fields={[{ key: 'name', label: text.name, value: detailRole.name }, { key: 'notes', label: text.notes, value: detailRole.notes }]} hiddenHistoryFields={['sortOrder']} onClose={() => detailRole = null}>
	{#snippet details()}
		<section class="app-detail-section"><h3>{text.permissionHeading}</h3><p class="role-permission-description">{text.permissionAssignedDescription}</p>
			<div class="role-permission-table-wrap"><table class="role-permission-table role-permission-table--scoped"><thead><tr><th scope="col">{text.permissionColumn}</th><th scope="col">{text.permissionGlobalColumn}</th><th scope="col">{text.permissionOwnBranchColumn}</th></tr></thead>
				{#each detailPermissionGroups as group}
					<tbody><tr class="role-permission-category"><th scope="rowgroup" colspan="3">{categoryLabels[group.category]}</th></tr>
						{#each group.codes as code}
							{@const globalAllowed = detailRole?.permissionScopes.some((item) => item.code === code && item.scopeType === 'global') ?? false}
							{@const ownApplicable = availableScopes(code).includes('own_branch')}
							{@const ownAllowed = ownApplicable && (detailRole?.permissionScopes.some((item) => item.code === code) ?? false)}
							<tr><th scope="row">{permissionLabels[code] ?? granularPermissionLabel(code, $localization.displayLanguage)}{#if permissionDescriptions[code]}<small>{permissionDescriptions[code]}</small>{/if}</th><td><span class:allowed={globalAllowed} class="role-permission-state">{globalAllowed ? text.permissionAllowed : text.permissionNotAllowed}</span></td><td><span class:allowed={ownAllowed} class:unavailable={!ownApplicable} class="role-permission-state">{ownApplicable ? ownAllowed ? text.permissionAllowed : text.permissionNotAllowed : text.permissionNotApplicable}</span></td></tr>
						{/each}
					</tbody>
				{/each}
			</table></div>
		</section>
	{/snippet}
</MasterRecordDetailModal>{/if}

{#if selected || isAdding}
	<ModalBackdrop>
		<dialog bind:this={dialogElement} class="role-dialog app-modal app-modal--compact" open aria-modal="true" aria-labelledby="role-dialog-title">
			<header><h2 id="role-dialog-title">{isAdding ? text.addRole : text.editRole}</h2><button class="app-modal-close" type="button" aria-label={text.closeRoleDialog} disabled={saving} onclick={requestClose}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg></button></header>
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
		{#each ['employees', 'masters', 'calendars', 'assets', 'system'] as category}
							{#if permissions.some((permission) => permission.category === category)}
								<fieldset><legend>{categoryLabels[category]}</legend><div class="role-permission-table-wrap"><table class="role-permission-table role-permission-table--scoped"><thead><tr><th scope="col">{text.permissionColumn}</th><th scope="col">{text.permissionGlobalColumn}</th><th scope="col">{text.permissionOwnBranchColumn}</th></tr></thead><tbody>
									{#each permissions.filter((permission) => permission.category === category) as permission}
										{@const globalEnabled = scopeByCode[permission.code] === 'global' && selectedCodes.includes(permission.code)}
										{@const ownEnabled = selectedCodes.includes(permission.code)}
										<tr><th scope="row">{permissionLabels[permission.code] ?? granularPermissionLabel(permission.code, $localization.displayLanguage)}{#if permissionDescriptions[permission.code]}<small>{permissionDescriptions[permission.code]}</small>{/if}</th><td><button class="app-status-switch" class:is-on={globalEnabled} type="button" role="switch" aria-checked={globalEnabled} aria-label={`${permissionLabels[permission.code] ?? granularPermissionLabel(permission.code, $localization.displayLanguage)}: ${text.permissionGlobalColumn}`} disabled={saving || permission.systemAdministratorOnly} onclick={() => togglePermission(permission.code, 'global', !globalEnabled)}><span class="app-status-switch__text">{globalEnabled ? text.permissionSwitchOn : text.permissionSwitchOff}</span><span class="app-status-switch__knob"></span></button></td><td>{#if permission.allowOwnBranch}<button class="app-status-switch" class:is-on={ownEnabled} type="button" role="switch" aria-checked={ownEnabled} aria-label={`${permissionLabels[permission.code] ?? granularPermissionLabel(permission.code, $localization.displayLanguage)}: ${text.permissionOwnBranchColumn}`} disabled={saving || permission.systemAdministratorOnly || globalEnabled} onclick={() => togglePermission(permission.code, 'own_branch', !ownEnabled)}><span class="app-status-switch__text">{ownEnabled ? text.permissionSwitchOn : text.permissionSwitchOff}</span><span class="app-status-switch__knob"></span></button>{:else}<span class="role-permission-state unavailable">{text.permissionNotApplicable}</span>{/if}</td></tr>
									{/each}
								</tbody></table></div></fieldset>
							{/if}
						{/each}
						{#if permissionError}<StatusNotice message={permissionError} tone="error" onDismiss={() => permissionError = ''} />{/if}
						</div>
					</FormSection>
				</div>
				<footer class="app-modal-footer"><button class="secondary" type="button" disabled={saving} onclick={requestClose}>{common.cancel}</button><button class="app-primary-action" type="submit" disabled={saving || (!isAdding && !hasUnsavedChanges && !permissionsChanged)}>{saving ? common.saving : isAdding ? text.createRole : common.saveChanges}</button></footer>
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
	.role-dialog,:global(dialog[aria-labelledby="role-detail-title"]){width:min(100%,650px)}.role-form-body{grid-template-columns:1fr}.permission-section{display:grid;gap:12px}.permission-section fieldset{border:1px solid var(--border-light);border-radius:5px;padding:10px}.permission-section legend{font-weight:600;padding:0 4px}
	.role-permission-description{margin:0 0 16px;color:var(--text-secondary)}.role-permission-table-wrap{max-width:100%;overflow-x:auto}.role-permission-table{width:100%;border-collapse:collapse;table-layout:fixed;color:var(--text-secondary)}.role-permission-table th,.role-permission-table td{padding:10px 8px;border-bottom:1px solid var(--border-light);text-align:left;vertical-align:top;overflow-wrap:anywhere}.role-permission-table thead th{background:var(--surface-secondary);color:var(--muted);font-size:var(--font-size-support);font-weight:700}.role-permission-table thead th:last-child,.role-permission-table td{width:104px;text-align:center}.role-permission-table tbody th[scope="row"]{font-weight:500}.role-permission-table tbody small{display:block;margin-top:3px;color:var(--muted);font-size:var(--font-size-support);font-weight:400;line-height:1.4}.role-permission-table .role-permission-category th{background:var(--surface-secondary);color:var(--text);font-weight:700}
	.role-permission-state{display:inline-flex;justify-content:center;align-items:center;max-width:100%;padding:2px 6px;border:1px solid var(--border-light);border-radius:4px;background:var(--surface-secondary);color:var(--text-secondary);font-size:var(--font-size-support);font-weight:600;line-height:1.3}.role-permission-state.allowed{border-color:color-mix(in srgb,var(--action-primary) 25%,var(--border));background:color-mix(in srgb,var(--action-primary) 10%,var(--surface));color:var(--action-primary)}.role-permission-state.unavailable{border-color:transparent;background:transparent;color:var(--muted);font-weight:400}
	.role-permission-table :global(button.app-status-switch){--app-status-switch-width:88px}
	.role-permission-table--scoped thead th:nth-child(n+2){width:104px;text-align:center}
	@media(max-width:700px){.role-permission-table{min-width:380px}.role-permission-table thead th:last-child,.role-permission-table td{width:100px}.role-permission-table th,.role-permission-table td{padding:9px 6px}.role-permission-table--scoped thead th:nth-child(n+2){width:100px}}
</style>
