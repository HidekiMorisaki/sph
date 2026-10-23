<script lang="ts">
 import { operationAccess } from '$lib/operation-access';
 const allowedOperation = operationAccess();
 import { initialSearch } from '$lib/search';
 import SearchPanel from '$lib/components/SearchPanel.svelte';
 import CsvExportButton from '$lib/components/CsvExportButton.svelte';
 import { searchCsv, downloadCsv, csvFilename } from '$lib/csv-export';
 let searchState=$state(initialSearch('employees'));
	import { localeMessages, formatLocaleTemplate } from '$lib/locale-messages';
	import { onMount, tick } from 'svelte';
	import { page } from '$app/state';
	import { workforceOptions, type WorkforceMaster } from '$lib/workforce';
	import { loadTeamOptions, type Team } from '$lib/teams';
	import { apiData } from '$lib/api';
	import type { SessionUser } from '$lib/auth';
	import AddButton from '$lib/components/AddButton.svelte';
	import AssetManagementShell from '$lib/components/AssetManagementShell.svelte';
	import EmailAddressActions from '$lib/components/EmailAddressActions.svelte';
	import EmployeeDetailModal from '$lib/components/EmployeeDetailModal.svelte';
	import EmployeeFormModal from '$lib/components/EmployeeFormModal.svelte';
	import MasterList from '$lib/components/MasterList.svelte';
	import ViewportListPage from '$lib/components/ViewportListPage.svelte';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
	import MasterPageHeader from '$lib/components/MasterPageHeader.svelte';
	import ModalBackdrop from '$lib/components/ModalBackdrop.svelte';
	import SearchMultiSelect from '$lib/components/SearchMultiSelect.svelte';
	import SearchSelect from '$lib/components/SearchSelect.svelte';
	import StatusNotice from '$lib/components/StatusNotice.svelte';
	import { allBranchesValue, nextBranchSelection, restoreBranchSelection } from '$lib/employee-branch-filter';
	import type { Employee, EmployeeMaster, EmployeeRole } from '$lib/employees';
	import { formatEmployeeName, formatLengthOfService, formatTimestamp, invitationEmailSubject, localization } from '$lib/localization';
	import { inferPersonNameLocale } from '$lib/person-name';

	let commonText = $derived(localeMessages[$localization.displayLanguage].common);
	let text = $derived(localeMessages[$localization.displayLanguage].employees);

	type InvitationPayload = { invitationUrl: string; invitationExpiresAt: string };

	const resources = ['departments', 'employee-groups', 'positions', 'employment-types'];

	let employeeList = $state<MasterList>();
	let editing = $state<Employee | null>(null);
	let formMode = $state<'create' | 'admin-edit'>('create');
	let formReturnFocus = $state<HTMLElement | null>(null);
	let detailEmployee = $state<Employee | null>(null);
	let detailBeforeEdit = $state<Employee | null>(null);
	let detailReturnFocus = $state<HTMLElement | null>(null);
	let invitationReturnToDetail = $state(false);
	let invitationReturnFocus = $state<HTMLElement | null>(null);
	let formOpen = $state(false);
	let detailOpen = $state(false);
	let invitation = $state<{ url: string; email: string; expiresAt: string } | null>(null);
	let invitationDialogElement = $state<HTMLDialogElement>();
	let invitationError = $state<'invitationRateLimited' | 'invitationFailed' | ''>('');
	let issuingInvitation = $state(false);
	let copyMessage = $state<'linkCopied' | 'linkCopyFailed' | ''>('');
	let invitationWarningDismissed = $state(false);
	let message = $state<'created' | 'updated' | 'removed' | 'deleteFailed' | 'exportFailed' | ''>('');
	let masters = $state<Record<string, EmployeeMaster[]>>({});
	let roles = $state<EmployeeRole[]>([]);
	let canManageAdministration = $state(false);
	let canManageSystemSettings = $state(false);
	let canInviteEmployees = $state(false);
	let canAssignEmployeeRoles = $state(false);
	let workforceText = $derived(localeMessages[$localization.displayLanguage].workforce);
	let skillOptions = $state<WorkforceMaster[]>([]);
	let canReadSkills = $state(false);
	let skillSelection = $state<string[]>([]);
	let skillMode = $state('all');
	let minProficiency = $state('1');
	let participationStatus = $state('');
	let endingWithinDays = $state('');
	let workforceQuery = $derived({...(skillSelection.length?{skillIds:skillSelection.join(','),skillMode,minProficiency}:{}),...(participationStatus?{participationStatus}:{}),...(endingWithinDays?{endingWithinDays}: {})});
	let teamOptions = $state<Team[]>([]);
	let teamSelection = $state<string[]>([]);
	let canManageTeamMemberships = $state(false);
	let teamsReady = $state(false);
	let currentUserId = $state<number | null>(null);
	let canManageEmployees = $derived(canManageAdministration);
	let exporting = $state(false);
	let includeRetired = $state(false);
	let includeDeleted = $state(false);
	let branchOptions = $state<EmployeeMaster[]>([]);
	let branchSelection = $state<string[]>([allBranchesValue]);
	let branchFilterReady = $state(false);
	let branchFilterError = $state(false);
	let employeeQueryParams = $derived({ ...workforceQuery, includeRetired, includeDeleted, includeAvatar: true, ...(teamSelection.length ? { teamIds: teamSelection.join(',') } : {}), ...(branchSelection.includes(allBranchesValue) ? {} : { branchIds: branchSelection.join(',') }) });

 function restoreSearchOptions(options:Record<string,string|boolean>){includeRetired=options.includeRetired===true;includeDeleted=options.includeDeleted===true;branchSelection=typeof options.branchIds==='string'?options.branchIds.split(','):[allBranchesValue];teamSelection=typeof options.teamIds==='string'?options.teamIds.split(','):[];skillSelection=typeof options.skillIds==='string'?options.skillIds.split(','):[];skillMode=String(options.skillMode??'all');minProficiency=String(options.minProficiency??'1');participationStatus=String(options.participationStatus??'');endingWithinDays=String(options.endingWithinDays??'');}
 let searchDraftOptions=$derived(Object.fromEntries(Object.entries(employeeQueryParams).filter(([key,value])=>key!=='includeAvatar'&&value!==false&&value!=='')) as Record<string,string|boolean>);

	const fullName = (employee: Employee) => formatEmployeeName(employee, $localization);
	const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
	function monogram(item: Employee): string {
		// CLDR short, formal monogram: Japanese uses given; other supported names use surname.
		const nameLocale = item.nameKana?.trim() ? 'ja' : inferPersonNameLocale(item);
		const name = nameLocale === 'ja' ? item.firstName : item.lastName;
		const first = graphemes.segment(name.trim())[Symbol.iterator]().next().value?.segment ?? '';
		const upper = first.toLocaleUpperCase(nameLocale === 'ja' ? 'ja' : 'en');
		return [...graphemes.segment(upper)].length === 1 ? upper : first;
	}
	async function loadMasters() {
		const responses = await Promise.all(resources.map((resource) => fetch(`/v1/${resource}?limit=500`)));
		masters = { ...masters, ...Object.fromEntries(await Promise.all(responses.map(async (response, index) => [resources[index], response.ok ? await apiData<EmployeeMaster[]>(response) : []]))) };
	}
	async function loadBranchOptions() {
		const collected: EmployeeMaster[] = [];
		let total = 0;
		do {
			const response = await fetch(`/v1/employees/branch-options?limit=500&offset=${collected.length}&sortBy=sortOrder&sortOrder=asc`);
			if (!response.ok) throw new Error('Unable to load branches.');
			const payload = await response.json() as { data: EmployeeMaster[]; meta: { total: number } };
			if (!payload.data.length && collected.length < payload.meta.total) throw new Error('Incomplete branch list.');
			collected.push(...payload.data);
			total = payload.meta.total;
		} while (collected.length < total);
		branchOptions = collected;
		masters = { ...masters, branches: collected };
	}
	async function loadRoleOptions() {
		const [roleResponse, sessionResponse] = await Promise.all([fetch('/v1/employees/assignable-roles'), fetch('/v1/auth/session')]);
		if (roleResponse.ok) roles = await apiData<EmployeeRole[]>(roleResponse);
		if (sessionResponse.ok) {
			const current = (await apiData<{ user: { id: number; capabilities: { canReadSkills: boolean; canManageEmployees: boolean; canManageSystemSettings: boolean; canAssignEmployeeRoles: boolean; canInviteEmployees: boolean; canReadTeams: boolean; canAddTeamMembers: boolean; canRemoveTeamMembers: boolean } } }>(sessionResponse)).user;
			canReadSkills = current.capabilities.canReadSkills;
			canManageAdministration = current.capabilities.canManageEmployees;
			canManageSystemSettings = current.capabilities.canManageSystemSettings;
			canInviteEmployees = current.capabilities.canInviteEmployees;
			canAssignEmployeeRoles = current.capabilities.canAssignEmployeeRoles;
			canManageTeamMemberships = current.capabilities.canAddTeamMembers && current.capabilities.canRemoveTeamMembers;
			if (current.capabilities.canReadTeams) { teamOptions = await loadTeamOptions(); teamsReady = true; }
			currentUserId = current.id;
		} else throw new Error('Unable to load current user.');
	}
	async function initialize() {
		branchFilterError = false;
		try {
			await Promise.all([loadMasters(), loadBranchOptions(), loadRoleOptions()]);
			if (currentUserId === null) throw new Error('Current user unavailable.');
			if (canReadSkills) skillOptions = await workforceOptions('skills');
			const storageKey = `employees-branch-filter:${currentUserId}`;
			let saved: string | null = null;
			try { saved = localStorage.getItem(storageKey); } catch { /* Browsing without storage uses all branches. */ }
			branchSelection = branchOptions.length === 1 ? [String(branchOptions[0].id)] : restoreBranchSelection(saved, branchOptions.map((branch) => String(branch.id)));
			if (page.state.employeeSearch) { searchState={...searchState,definition:structuredClone(page.state.employeeSearch)};restoreSearchOptions(searchState.definition.options); }
			branchFilterReady = true;
			try { localStorage.setItem(storageKey, JSON.stringify(branchSelection.filter((value) => value !== allBranchesValue))); } catch { /* The filter still works for this visit. */ }
		} catch { branchFilterError = true; }
	}
	function chooseBranches(values: string[]) {
		if (branchOptions.length === 1) return;
		branchSelection = nextBranchSelection(branchSelection, values);
		if (currentUserId !== null) {
			try { localStorage.setItem(`employees-branch-filter:${currentUserId}`, JSON.stringify(branchSelection.filter((value) => value !== allBranchesValue))); } catch { /* The filter still works for this visit. */ }
		}
	}
	function create(event: MouseEvent) { if (!canManageEmployees) return; detailBeforeEdit = null; editing = null; formMode = 'create'; formReturnFocus = event.currentTarget as HTMLElement; formOpen = true; }
	function edit(item: Employee, trigger: HTMLElement | null) {
		if (item.employmentStatus === 'deleted') return;
		if (!canManageEmployees && item.id !== currentUserId) return;
		if (!canManageEmployees) { window.location.assign('/personal-settings#profile'); return; }
		formReturnFocus = trigger;
		editing = item;
		formMode = 'admin-edit';
		formOpen = true;
	}
	async function formSaved(saved: Employee) {
		detailBeforeEdit = null;
		message = formMode === 'create' ? 'created' : 'updated';
		if (saved.id === currentUserId) {
			try {
				const response = await fetch('/v1/auth/session', { cache: 'no-store' });
				if (!response.ok) throw new Error('Session refresh failed.');
				const current = (await apiData<{ user: SessionUser }>(response)).user;
				canManageAdministration = current.capabilities.canManageEmployees;
				canManageSystemSettings = current.capabilities.canManageSystemSettings;
				canInviteEmployees = current.capabilities.canInviteEmployees;
				canAssignEmployeeRoles = current.capabilities.canAssignEmployeeRoles;
				currentUserId = current.id;
				window.dispatchEvent(new CustomEvent<SessionUser>('session-user-updated', { detail: current }));
			} catch {
				// The edit succeeded; reload to recover the current session without reporting a failed save.
				window.location.reload();
				return;
			}
		}
		if (formMode === 'create' && 'invitationUrl' in saved && typeof saved.invitationUrl === 'string' && 'invitationExpiresAt' in saved && typeof saved.invitationExpiresAt === 'string') {
			showInvitation({ invitationUrl: saved.invitationUrl, invitationExpiresAt: saved.invitationExpiresAt }, saved.email);
		}
		await employeeList?.refresh();
	}
	function showDetail(item: Employee, trigger: HTMLElement | null) { detailEmployee = item; detailReturnFocus = trigger; detailOpen = true; }
	function closeDetail() { detailOpen = false; detailEmployee = null; invitationError = ''; }
	function closeForm() { formOpen = false; if (detailBeforeEdit) { detailEmployee = detailBeforeEdit; detailOpen = true; detailBeforeEdit = null; } }
	function showInvitation(payload: InvitationPayload, email: string, trigger: HTMLElement | null = null) {
		const url = new URL(payload.invitationUrl, window.location.origin);
		if (url.origin !== window.location.origin || url.pathname !== '/account-setup') throw new Error('Invalid invitation URL.');
		invitation = { url: url.href, email, expiresAt: payload.invitationExpiresAt };
		copyMessage = '';
		invitationWarningDismissed = false;
		invitationReturnToDetail = detailOpen && detailEmployee !== null;
		invitationReturnFocus = trigger;
		void tick().then(() => invitationDialogElement?.querySelector<HTMLInputElement>('input')?.focus());
	}
	function closeInvitation() {
		invitation = null;
		const target = invitationReturnToDetail ? invitationReturnFocus : document.querySelector<HTMLButtonElement>('.master-header-actions .app-add-icon');
		invitationReturnToDetail = false; invitationReturnFocus = null;
		void tick().then(() => target?.focus({ preventScroll: true }));
	}
	async function issueInvitation(item: Employee) {
		const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
		issuingInvitation = true;
		invitationError = '';
		try {
			const response = await fetch(`/v1/employees/${item.id}/invitations`, { method: 'POST' });
			if (!response.ok) {
				invitationError = response.status === 429 ? 'invitationRateLimited' : 'invitationFailed';
				return;
			}
			showInvitation(await apiData<InvitationPayload>(response), item.email, trigger);
		} catch { invitationError = 'invitationFailed'; }
		finally { issuingInvitation = false; }
	}
	async function copyInvitation() {
		if (!invitation) return;
		try { await navigator.clipboard.writeText(invitation.url); copyMessage = 'linkCopied'; }
		catch { copyMessage = 'linkCopyFailed'; }
	}
	async function remove(item: Employee) {
		if (!canManageEmployees || item.employmentStatus === 'deleted') return;
		if (!confirm(formatLocaleTemplate(text.deleteConfirm, fullName(item)))) return;
		if (detailEmployee?.id === item.id) closeDetail();
		const response = await fetch(`/v1/employees/${item.id}`, { method: 'DELETE' });
		if (!response.ok) { message = 'deleteFailed'; return; }
		message = 'removed'; await employeeList?.refresh();
	}
	function windowKeydown(event: KeyboardEvent) {
		if (event.defaultPrevented) return;
		if (event.key !== 'Escape') return;
		if (invitation) { event.preventDefault(); closeInvitation(); }
	}
	async function exportCsv() {
		if (!canManageEmployees || exporting || !searchState.success || searchState.loading || searchState.error) return;
		exporting = true; message = '';
		try {
			const filename = csvFilename('employees');
			const content = await searchCsv<Employee>({ endpoint: '/v1/employee-searches', searchState, serverColumns: true });
			downloadCsv(content, filename);
		} catch { message = 'exportFailed'; } finally { exporting = false; }
	}
	onMount(() => {
		void initialize();
	});
</script>

<svelte:window onkeydown={windowKeydown} />
{#snippet employeeCell(item: Employee)}<div class="employee-cell"><span class="avatar" aria-hidden="true">{#if item.avatar}<img src={item.avatar} alt="" />{:else}{monogram(item)}{/if}</span><div><div class="employee-name"><strong>{fullName(item)}</strong>{#if item.employmentStatus === 'retired'}<span class="employee-status retired">{text.retired}</span>{:else if item.employmentStatus === 'deleted'}<span class="employee-status deleted">{text.deleted}</span>{/if}</div><small>{item.employeeCode}</small></div></div>{/snippet}
{#snippet mobileEmployee(item: Employee)}
 <div class="mobile-employee">{@render employeeCell(item)}<p>{[item.departments.map(department => department.name).join('・'), item.branch?.name].filter(Boolean).join(' / ')}</p></div>
{/snippet}
{#snippet rolesCell(item: Employee)}<div class="role-badges">{#each item.roles as role}<span>{role.name}</span>{/each}</div>{/snippet}
{#snippet positionsCell(item: Employee)}<div class="position-badges">{#each item.positions as position}<span class:primary={position.isPrimary}>{position.name}</span>{/each}</div>{/snippet}
{#snippet departmentsCell(item: Employee)}<div class="position-badges">{#each item.departments as department}<span class:primary={department.isPrimary}>{department.name}</span>{/each}</div>{/snippet}
{#snippet pageActions()}<AddButton label={text.add} disabled={!allowedOperation('employees.create')} onclick={create} />{/snippet}
{#snippet branchFilter()}<div class="employee-workforce-filters">
 {#if canReadSkills}<div class="employee-branch-filter"><span>{workforceText.skills}</span><SearchMultiSelect label={workforceText.skills} field="employeeSkillFilter" values={skillSelection} options={skillOptions.map(skill=>({value:String(skill.id),label:skill.name}))} placeholder={workforceText.allSkills} onChange={values=>skillSelection=values}/></div>{/if}
 {#if skillSelection.length}<div class="employee-branch-filter"><SearchSelect label={workforceText.skillMode} field="employeeSkillMode" value={skillMode} searchable={false} options={[{value:'all',label:workforceText.all},{value:'any',label:workforceText.any}]} onSelect={value=>skillMode=value}/></div><div class="employee-branch-filter"><SearchSelect label={workforceText.minProficiency} field="employeeProficiencyFilter" value={minProficiency} searchable={false} options={[{value:'1',label:workforceText.level1},{value:'2',label:workforceText.level2},{value:'3',label:workforceText.level3}]} onSelect={value=>minProficiency=value}/></div>{/if}
 <div class="employee-branch-filter"><SearchSelect label={workforceText.participationStatus} field="employeeParticipationStatus" value={participationStatus} searchable={false} options={[{value:'',label:workforceText.allStatuses},{value:'planned',label:workforceText.planned},{value:'active',label:workforceText.active},{value:'ended',label:workforceText.ended},{value:'none',label:workforceText.none}]} onSelect={value=>{participationStatus=value;if(value!=='active'&&value!=='')endingWithinDays='';}}/></div>
 <div class="employee-branch-filter"><SearchSelect label={workforceText.endingWithinDays} field="employeeEndingWithinDays" value={endingWithinDays} searchable={false} options={[{value:'',label:workforceText.anyEnd},{value:'30',label:workforceText.days30},{value:'60',label:workforceText.days60},{value:'90',label:workforceText.days90}]} onSelect={value=>{endingWithinDays=value;if(value)participationStatus='active';}}/></div>
<div class="employee-branch-filter"><span>{text.teamFilter}</span><SearchMultiSelect label={text.teamFilter} field="employeeTeamFilter" values={teamSelection} options={teamOptions.map(team => ({ value: String(team.id), label: team.name }))} placeholder={text.allTeams} onChange={values => teamSelection = values} /></div><div class="employee-branch-filter"><span>{text.branchFilter}</span>{#if branchOptions.length === 1}<SearchSelect label={text.branchFilter} field="employeeBranchFilter" value={String(branchOptions[0].id)} options={[{ value: String(branchOptions[0].id), label: branchOptions[0].name }]} searchable={false} onSelect={() => undefined} />{:else}<SearchMultiSelect label={text.branchFilter} field="employeeBranchFilter" values={branchSelection} placeholderValues={[allBranchesValue]} options={[{ value: allBranchesValue, label: text.allBranches }, ...branchOptions.map((branch) => ({ value: String(branch.id), label: branch.name }))]} onChange={chooseBranches} />{/if}</div><div class="employee-visibility" aria-label={text.visibility}><label><input type="checkbox" bind:checked={includeRetired} /><span>{text.showRetired}</span></label><label><input type="checkbox" bind:checked={includeDeleted} /><span>{text.showDeleted}</span></label></div></div>{/snippet}
{#snippet exportAction()}<div class="employee-list-actions"><CsvExportButton {exporting} disabled={!canManageEmployees || !searchState.success || searchState.loading || searchState.error} onExport={() => void exportCsv()} /></div>{/snippet}
{#snippet listActions()}{@render exportAction()}{@render pageActions()}{/snippet}
{#snippet invitationAction()}<div class="invite-footer">{#if invitationError}<StatusNotice message={text[invitationError]} tone="error" onDismiss={() => invitationError = ''} />{/if}<button class="app-primary-action" type="button" disabled={issuingInvitation} onclick={() => void issueInvitation(detailEmployee!)}>{issuingInvitation ? text.generating : text.generateInvitation}</button></div>{/snippet}

<AssetManagementShell title={text.title} active="Employees">
	<ViewportListPage>
	<MasterPageHeader title={text.title} />
	{#if message}<StatusNotice message={text[message]} tone={message === 'created' || message === 'updated' || message === 'removed' ? 'success' : 'error'} onDismiss={() => message = ''} />{/if}
		{#if branchFilterError}<StatusNotice message={text.branchFilterLoadFailed} tone="error" onDismiss={() => branchFilterError = false} /><button type="button" class="branch-retry" onclick={() => void initialize()}>{text.retryBranchFilter}</button>{/if}
		{#if branchFilterReady}<SearchPanel target="employees" userId={currentUserId} bind:searchState draftOptions={searchDraftOptions} onRestoreOptions={restoreSearchOptions} filters={branchFilter}/><MasterList mobileItem={mobileEmployee} bind:searchState bind:this={employeeList} endpoint="/v1/employee-searches" title={text.title} listHeading={text.title} description="" initialSortBy="employee" pageSizeStorageKey="employees-page-size" minTableWidth={1120} edgePagination canManage={canManageEmployees} canDetail={true} actionLabel={(item) => fullName(item as Employee)} headerActions={listActions} loadingLabel={text.loading} emptyLabel={commonText.noMatches} columns={[
		{ key: 'employee', label: text.employee, width: 18, cell: employeeCell, searchKeys: ['name', 'employeeCode', 'employmentStatus'] },
		{ key: 'teams', label: text.teams, width: 12, value: item => (item as Employee).teamNames, searchKeys: teamsReady ? ['teams'] : [], sortable: teamsReady },
		{ key: 'lengthOfService', label: text.lengthOfService, width: 12, value: (item) => formatLengthOfService((item as Employee).lengthOfService, $localization), searchKeys: ['lengthOfService'] },
		{ key: 'department', label: text.departments, width: 12, cell: departmentsCell, searchKeys: ['department'] },
		{ key: 'group', label: text.groupId, width: 9, value: (item) => (item as Employee).group?.name, searchKeys: ['group'] },
		{ key: 'position', label: text.positions, width: 12, cell: positionsCell, searchKeys: ['position'] },
		{ key: 'employmentType', label: text.employmentTypeId, width: 11, value: (item) => (item as Employee).employmentType?.name, searchKeys: ['employmentType'] },
		{ key: 'branch', label: text.branchId, width: 9, value: (item) => (item as Employee).branch?.name },
		{ key: 'roles', label: text.roles, width: 11, cell: rolesCell, searchKeys: ['roles'] }
		]} onDetail={(item, trigger) => showDetail(item as Employee, trigger)} />{:else if !branchFilterError}<div class="page-state"><LoadingSpinner label={text.loading} /></div>{/if}
	</ViewportListPage>

	{#if formOpen}<EmployeeFormModal mode={formMode} employee={editing} {masters} {roles} {canManageSystemSettings} {canAssignEmployeeRoles} {canManageTeamMemberships} {teamOptions} {teamsReady} returnFocus={formReturnFocus} onClose={closeForm} onSaved={formSaved} />{/if}

	{#if detailOpen && detailEmployee}<div hidden={Boolean(invitation)} inert={Boolean(invitation)}><EmployeeDetailModal employee={detailEmployee} onUpdated={updated => { detailEmployee = updated; void employeeList?.refresh(); }} returnFocus={detailReturnFocus} footer={(detailEmployee.allowedOperations?.invite ?? (allowedOperation('employees.invite', detailEmployee.branchId) && (canManageSystemSettings || !detailEmployee.roles.some(role => role.isSystemManagement)))) && canInviteEmployees && (canManageSystemSettings || detailEmployee.roles.some((role) => role.isGeneralUser)) && detailEmployee.canIssueInvitation ? invitationAction : undefined} onEdit={detailEmployee.employmentStatus !== 'deleted' && ((detailEmployee.allowedOperations?.update ?? (allowedOperation('employees.update', detailEmployee.branchId) && (canManageSystemSettings || !detailEmployee.roles.some(role => role.isSystemManagement)))) || detailEmployee.id === currentUserId) ? () => { const item = detailEmployee!; const row = detailReturnFocus; detailBeforeEdit = item; closeDetail(); edit(item, row); } : undefined} onDelete={(detailEmployee.allowedOperations?.delete ?? (allowedOperation('employees.delete', detailEmployee.branchId) && (canManageSystemSettings || !detailEmployee.roles.some(role => role.isSystemManagement)))) && detailEmployee.employmentStatus !== 'deleted' ? () => void remove(detailEmployee!) : undefined} onClose={closeDetail} /></div>{/if}
	{#if invitation}<ModalBackdrop><dialog bind:this={invitationDialogElement} class="employee-dialog invitation-dialog app-modal app-modal--invitation" open aria-modal="true" aria-labelledby="invitation-title"><header><h2 id="invitation-title">{text.invitationTitle}</h2><button class="modal-close app-modal-close" type="button" aria-label={text.closeInvitation} onclick={closeInvitation}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg></button></header><div class="invitation-body"><p>{formatLocaleTemplate(text.invitationDescription, formatTimestamp(invitation.expiresAt, $localization))}</p><EmailAddressActions email={invitation.email} subject={invitationEmailSubject($localization)} /><label>{text.invitationUrl}<input aria-label={text.invitationUrl} readonly value={invitation.url} onclick={(event) => event.currentTarget.select()} /></label>{#if !invitationWarningDismissed}<StatusNotice message={text.invitationWarning} tone="warning" onDismiss={() => invitationWarningDismissed = true} />{/if}{#if copyMessage}<StatusNotice message={text[copyMessage]} tone={copyMessage === 'linkCopyFailed' ? 'error' : 'success'} onDismiss={() => copyMessage = ''} />{/if}</div><footer class="employee-form-footer app-modal-footer"><button class="secondary" type="button" onclick={closeInvitation}>{commonText.close}</button><button class="app-primary-action" type="button" onclick={() => void copyInvitation()}>{text.copyLink}</button></footer></dialog></ModalBackdrop>{/if}
</AssetManagementShell>

<style>
 .employee-workforce-filters{display:flex;flex:1;flex-wrap:wrap;align-items:flex-start;gap:12px;min-width:0}
 :global(.master-toolbar-filters:has(.employee-workforce-filters)){flex:1;align-items:flex-start}
 .employee-workforce-filters .employee-branch-filter{display:grid;align-content:start;gap:6px;flex:0 1 200px;width:200px;max-width:100%;white-space:normal}
 .employee-workforce-filters .employee-branch-filter :global(.form-multi-select-field){width:100%}
 .employee-workforce-filters .employee-branch-filter :global(.form-select-field){width:100%;min-width:0}
 .employee-workforce-filters .employee-branch-filter :global(.form-select-trigger){height:32px}
 @media (max-width:700px), (min-width:701px) and (max-width:1024px) and (max-height:500px) and (any-pointer:coarse){.employee-workforce-filters{width:100%}}

	.employee-cell>div{min-width:0}
	.employee-branch-filter{display:flex;min-width:0;align-items:center;gap:8px;color:var(--text-secondary);font-size:var(--font-size-support);white-space:nowrap}.employee-branch-filter :global(.form-multi-select-field){width:220px}.employee-branch-filter :global(.form-multi-select-field>span){position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap}.employee-branch-filter :global(.form-multi-select-trigger){height:32px}.branch-retry{align-self:flex-start;border:1px solid var(--border);border-radius:4px;background:var(--surface);color:var(--text);padding:7px 12px}
	.employee-name{display:flex;min-width:0;align-items:center;gap:6px}.employee-status{display:inline-flex;flex:none;align-items:center;min-height:18px;padding:1px 6px;border:1px solid;border-radius:999px;font-size:var(--font-size-support);font-weight:700;line-height:1.2;text-transform:uppercase}.employee-status.retired{background:rgba(243,156,18,.12);color:#c87f0a;border-color:rgba(243,156,18,.3)}.employee-status.deleted{background:rgba(231,76,60,.12);color:#d13b2d;border-color:rgba(231,76,60,.3)}
	.role-badges{display:flex;flex-wrap:wrap;gap:4px}.role-badges>span{display:inline-flex;align-items:center;min-height:20px;padding:2px 7px;background:rgba(26,187,156,.12);color:#169f85;border:1px solid rgba(26,187,156,.28);border-radius:999px;font-size:var(--font-size-support);font-weight:600;line-height:1.2}
	.position-badges{display:flex;flex-wrap:wrap;gap:4px}.position-badges>span{display:inline-flex;align-items:center;min-height:20px;padding:2px 7px;background:var(--surface-secondary);color:var(--text-secondary);border:1px solid var(--border);border-radius:999px;font-size:var(--font-size-support);font-weight:500;line-height:1.2}.position-badges>span.primary{background:rgba(51,122,183,.12);color:#337ab7;border-color:rgba(51,122,183,.28)}
	.employee-list-actions{display:flex;align-items:center;justify-content:flex-end;gap:14px}.employee-visibility{flex:0 1 auto;align-self:flex-end;min-height:32px;display:flex;flex-wrap:wrap;align-items:center;justify-content:flex-start;gap:6px 12px;min-width:0;max-width:100%}.employee-visibility label{display:inline-flex;flex:0 1 auto;max-width:100%;min-width:0;align-items:center;gap:6px;color:var(--text-secondary);font-size:var(--font-size-support);white-space:normal;cursor:pointer}.employee-visibility input{flex:none;width:14px;height:14px;margin:0;accent-color:#1abb9c}.employee-visibility input:focus-visible{outline:2px solid #1abb9c;outline-offset:2px}.employee-cell{display:flex;align-items:center;gap:8px}.avatar{display:grid;flex:0 0 24px;height:24px;place-items:center;background:#1abb9c;color:#fff;border-radius:50%;font-size:var(--font-size-support);font-weight:600}.avatar img{width:100%;height:100%;border-radius:50%;object-fit:cover}.employee-cell strong{display:block;min-width:0;overflow:hidden;color:var(--text);font-weight:500;text-overflow:ellipsis;white-space:nowrap}.employee-cell small{display:block;color:var(--muted);font-size:var(--font-size-support)}@media(max-width:900px){.employee-list-actions{align-items:stretch;flex-direction:column;gap:8px}.employee-visibility{justify-content:flex-start}}@media (max-width:700px), (min-width:701px) and (max-width:1024px) and (max-height:500px) and (any-pointer:coarse){.employee-list-actions{width:100%}.employee-visibility{align-items:center;flex-direction:row}}
	/* Keep the actions visible while the fields scroll. */
	.invitation-body{display:grid;gap:14px;padding:24px;overflow-y:auto;font-size:var(--font-size-body)}.invitation-body p{margin:0;color:var(--text-secondary)}.invitation-body label{display:grid;gap:6px;font-weight:600}.invitation-body input{width:100%;min-width:0;padding:9px;border:1px solid var(--border);border-radius:4px;background:var(--bg);color:var(--text);font-size:var(--font-size-body)}.invite-footer{display:flex;align-items:center;justify-content:flex-end;gap:12px;width:100%}.invite-footer span{color:var(--danger);font-size:var(--font-size-support)}
	@media (max-width:700px), (min-width:701px) and (max-width:1024px) and (max-height:500px) and (any-pointer:coarse){.employee-branch-filter :global(.form-multi-select-field){width:100%}}

 @media (max-width:700px), (min-width:701px) and (max-width:1024px) and (max-height:500px) and (any-pointer:coarse){.mobile-employee p{margin:5px 0 0 32px;color:var(--muted);font-size:var(--font-size-support);overflow-wrap:anywhere}.mobile-employee :global(.employee-cell strong){white-space:normal;overflow-wrap:anywhere}.mobile-employee :global(.employee-cell>div){min-width:0}}

</style>
