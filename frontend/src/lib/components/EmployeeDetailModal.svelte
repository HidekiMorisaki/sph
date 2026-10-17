<script lang="ts">
	import { localeMessages, formatLocaleTemplate } from '$lib/locale-messages';
	import type { Snippet } from 'svelte';
	import { apiData } from '$lib/api';
	import type { ChangeHistoryEntry } from '$lib/change-history';
	import ChangeHistorySection from '$lib/components/ChangeHistorySection.svelte';
	import DetailModal from '$lib/components/DetailModal.svelte';
	import DetailActionButtons from '$lib/components/DetailActionButtons.svelte';
	import EmailAddressActions from '$lib/components/EmailAddressActions.svelte';
	import SocialLinkIcon from '$lib/components/SocialLinkIcon.svelte';
	import EmployeeWorkforceSection from './EmployeeWorkforceSection.svelte';
	import WorkforceRecordModal from './WorkforceRecordModal.svelte';
	import type { RecordContext } from '$lib/workforce';
	import LinkedTeamModal from '$lib/components/LinkedTeamModal.svelte';
	import StatusNotice from '$lib/components/StatusNotice.svelte';
	import { socialLinkLabel, type Employee } from '$lib/employees';
	import { formatDate, formatEmployeeName, formatGender, formatLengthOfService, formatTimestamp, localization } from '$lib/localization';

	let commonText = $derived(localeMessages[$localization.displayLanguage].common);
	let text = $derived(localeMessages[$localization.displayLanguage].employees);

	let { employee, titleId = 'employee-detail-title', returnFocus = null, footer, onEdit, onDelete, onClose, onUpdated }: {
		employee: Employee;
		titleId?: string;
		returnFocus?: HTMLElement | null;
		footer?: Snippet;
		onEdit?: () => void;
		onDelete?: () => void;
		onClose: () => void;
		onUpdated?: (employee: Employee) => void;
	} = $props();
	const socialLabel = (platform: Employee['socialLinks'][number]['platform']) => socialLinkLabel(platform);
	const display = (value: string | number | null | undefined) => value === null || value === undefined || value === '' ? '' : String(value);
	let historyFields: Record<string, string> = $derived({
		employeeCode: text.employeeCode, firstName: text.firstName, middleName: text.middleName, lastName: text.lastName, nameKana: text.nameKana,
		birthDate: text.birthDate, gender: text.gender, bloodType: text.bloodType, countryCode: $localization.displayLanguage === 'ja' ? '国' : 'Country', postalCode: text.postalCode, prefecture: text.prefecture, city: text.city,
		streetAddress: text.streetAddress, buildingName: text.buildingName, mobilePhone: text.mobilePhone, email: text.email, hiredAt: text.hiredAt,
		teams: text.teams, departments: text.departments, primaryDepartmentId: text.primaryDepartmentId, groupId: text.groupId, positions: text.positions, primaryPositionId: text.primaryPositionId, employmentTypeId: text.employmentTypeId, branchId: text.branchId,
		retiredAt: text.retiredAt, notes: text.notes, roles: text.roles
	});
	let historyActions: Record<string, string> = $derived({ create: commonText.created, update: commonText.updated, delete: commonText.deleted });
	const historyValueFormatters = {
		gender: (value: string) => formatGender(value, $localization),
		// Existing snapshots store each team as "name (code)"; omit only the display suffix.
		teams: (value: string) => value.replace(/ \([A-Za-z0-9][A-Za-z0-9_-]{0,63}\)(?=, |$)/g, '')
	};
	let changeHistory = $state<ChangeHistoryEntry[]>([]);
	let historyLoading = $state(false);
	let historyError = $state(false);
	let historyRequestId = 0;
	let workforceSection = $state<EmployeeWorkforceSection>();
	let workforceContext = $state<RecordContext|null>(null);
	let linkedTeam = $state<{ id: number; trigger: HTMLElement } | null>(null);
	let teamRefreshFailed = $state(false);
	async function refreshEmployee() {
		try {
			const response = await fetch(`/v1/employees/${employee.id}`);
			if (!response.ok) throw new Error('Unable to refresh employee.');
			employee = await apiData<Employee>(response);
			onUpdated?.(employee);
			teamRefreshFailed = false;
		} catch { teamRefreshFailed = true; }
	}

	async function loadChangeHistory(employeeId: number, requestId: number) {
		try {
			const history: ChangeHistoryEntry[] = [];
			for (let offset = 0; ; offset += 500) {
				const response = await fetch(`/v1/employees/${employeeId}/history?limit=500&offset=${offset}&sortOrder=desc`);
				if (!response.ok) throw new Error('Unable to load employee change history.');
				const items = await apiData<ChangeHistoryEntry[]>(response);
				history.push(...items);
				if (items.length < 500) break;
			}
			if (requestId === historyRequestId && employee.id === employeeId) changeHistory = history;
		} catch { if (requestId === historyRequestId && employee.id === employeeId) historyError = true; }
		finally { if (requestId === historyRequestId) historyLoading = false; }
	}

	$effect(() => {
		const employeeId = employee.id;
		const requestId = ++historyRequestId;
		changeHistory = [];
		historyLoading = true;
		historyError = false;
		void loadChangeHistory(employeeId, requestId);
		return () => { if (requestId === historyRequestId) historyRequestId++; };
	});

</script>

<div hidden={Boolean(linkedTeam || workforceContext)} inert={Boolean(linkedTeam || workforceContext)}>
<DetailModal title={text.detail} {titleId} closeLabel={text.closeDetail} {returnFocus} actions={footer} {onClose}>
	{#if teamRefreshFailed}<StatusNotice message={localeMessages[$localization.displayLanguage].teams.failed} tone="error" onDismiss={() => teamRefreshFailed = false} />{/if}
	{#snippet headerActions()}{#if onEdit || onDelete}<DetailActionButtons editLabel={commonText.edit} deleteLabel={commonText.delete} onEdit={onEdit ? () => onEdit() : undefined} onDelete={onDelete ? () => onDelete() : undefined} />{/if}{/snippet}
	<section class="app-detail-section"><h3>{text.basic}</h3><dl class="app-detail-grid"><div><dt>{text.employeeCode}</dt><dd>{employee.employeeCode}</dd></div><div><dt>{text.employee}</dt><dd>{formatEmployeeName(employee, $localization)}</dd></div><div><dt>{text.nameKana}</dt><dd>{display(employee.nameKana)}</dd></div><div><dt>{text.birthDate}</dt><dd>{formatDate(employee.birthDate, $localization)}</dd></div><div><dt>{text.age}</dt><dd>{employee.age}</dd></div><div><dt>{text.gender}</dt><dd>{formatGender(employee.gender, $localization)}</dd></div><div><dt>{text.bloodType}</dt><dd>{display(employee.bloodType)}</dd></div><div><dt>{text.lengthOfService}</dt><dd>{formatLengthOfService(employee.lengthOfService, $localization)}</dd></div></dl></section>
	<section class="app-detail-section"><h3>{text.contact}</h3><dl class="app-detail-grid"><div><dt>{$localization.displayLanguage==='ja'?'国':'Country'}</dt><dd>{employee.countryCode==='US'?($localization.displayLanguage==='ja'?'米国':'United States'):($localization.displayLanguage==='ja'?'日本':'Japan')}</dd></div><div><dt>{employee.countryCode==='US'?'ZIP Code':text.postalCode}</dt><dd>{display(employee.postalCode)}</dd></div><div><dt>{employee.countryCode==='US'?($localization.displayLanguage==='ja'?'州':'State'):text.prefecture}</dt><dd>{display(employee.prefecture)}</dd></div><div><dt>{text.city}</dt><dd>{display(employee.city)}</dd></div><div><dt>{text.streetAddress}</dt><dd>{display(employee.streetAddress)}</dd></div><div><dt>{text.buildingName}</dt><dd>{display(employee.buildingName)}</dd></div><div><dt>{text.mobilePhone}</dt><dd>{display(employee.mobilePhone)}</dd></div><div class="app-detail-wide"><dt>{text.email}</dt><dd><EmailAddressActions email={employee.email} /></dd></div>{#if employee.socialLinks.length}<div class="app-detail-wide"><dt>{text.socialLinks}</dt><dd class="social-links">{#each employee.socialLinks as link}<a href={link.url} target="_blank" rel="noopener noreferrer" aria-label={formatLocaleTemplate(commonText.openExternal, socialLabel(link.platform))} title={socialLabel(link.platform)}><SocialLinkIcon platform={link.platform} /></a>{/each}</dd></div>{/if}</dl></section>
	<section class="app-detail-section"><h3>{text.employment}</h3><dl class="app-detail-grid"><div><dt>{text.hiredAt}</dt><dd>{formatDate(employee.hiredAt, $localization)}</dd></div><div><dt>{text.retiredAt}</dt><dd>{formatDate(employee.retiredAt, $localization)}</dd></div><div><dt>{text.departments}</dt><dd><span class="assignment-badges">{#each employee.departments as department}<span class:primary={department.isPrimary}>{department.name}</span>{/each}</span></dd></div><div class="app-detail-wide"><dt>{text.teams}</dt><dd><span class="team-links">{#each employee.teams ?? [] as team}<button type="button" data-team-id={team.id} onclick={event => linkedTeam = { id: team.id, trigger: event.currentTarget }}>{team.name}</button>{:else}-{/each}</span></dd></div><div><dt>{text.groupId}</dt><dd>{display(employee.group?.name)}</dd></div><div><dt>{text.positions}</dt><dd><span class="assignment-badges">{#each employee.positions as position}<span class:primary={position.isPrimary}>{position.name}</span>{/each}</span></dd></div><div><dt>{text.employmentTypeId}</dt><dd>{display(employee.employmentType?.name)}</dd></div><div><dt>{text.branchId}</dt><dd>{display(employee.branch?.name)}</dd></div><div class="app-detail-wide"><dt>{text.notes}</dt><dd class="app-detail-notes">{display(employee.notes)}</dd></div></dl></section>
	{#if !employee.deletedAt}<EmployeeWorkforceSection bind:this={workforceSection} employeeId={employee.id} onEdit={context=>workforceContext=context}/>{/if}
	<section class="app-detail-section"><h3>{text.system}</h3><dl class="app-detail-grid"><div><dt>{text.roles}</dt><dd><span class="role-badges">{#each employee.roles as role}<span>{role.name}</span>{/each}</span></dd></div><div><dt>{text.createdAt}</dt><dd>{formatTimestamp(employee.createdAt, $localization)}</dd></div><div><dt>{text.updatedAt}</dt><dd>{formatTimestamp(employee.updatedAt, $localization)}</dd></div><div><dt>{text.deletedAt}</dt><dd>{formatTimestamp(employee.deletedAt, $localization)}</dd></div></dl></section>
	<ChangeHistorySection collapsible entries={changeHistory} loading={historyLoading} error={historyError} fieldLabels={historyFields} dateFields={['birthDate','hiredAt','retiredAt']} valueFormatters={historyValueFormatters} actionLabels={historyActions} />
</DetailModal>
</div>
{#if workforceContext}<WorkforceRecordModal employeeId={employee.id} context={workforceContext} onClose={()=>workforceContext=null} onSaved={async()=>{await workforceSection?.refresh();onUpdated?.(employee);}}/>{/if}
{#if linkedTeam}{@const context = linkedTeam}<LinkedTeamModal teamId={context.id} returnFocus={context.trigger} onClose={() => linkedTeam = null} onChanged={() => void refreshEmployee()} />{/if}

<style>
	.team-links{display:flex;flex-wrap:wrap;gap:6px 12px}.team-links button{padding:0;border:0;background:transparent;color:var(--action-primary);font:inherit;cursor:pointer;text-align:left}.team-links button:hover{text-decoration:underline}.team-links button:focus-visible{outline:2px solid #1abb9c;outline-offset:2px}
	.role-badges{display:flex;flex-wrap:wrap;gap:4px}.role-badges>span{display:inline-flex;align-items:center;min-height:20px;padding:2px 7px;background:rgba(26,187,156,.12);color:#169f85;border:1px solid rgba(26,187,156,.28);border-radius:999px;font-size:var(--font-size-support);font-weight:600;line-height:1.2}
	.assignment-badges{display:flex;flex-wrap:wrap;gap:4px}.assignment-badges>span{display:inline-flex;align-items:center;min-height:20px;padding:2px 7px;background:var(--surface-secondary);color:var(--text-secondary);border:1px solid var(--border);border-radius:999px;font-size:var(--font-size-support);font-weight:500;line-height:1.2}.assignment-badges>span.primary{background:rgba(51,122,183,.12);color:#337ab7;border-color:rgba(51,122,183,.28)}
	.social-links{display:flex;flex-wrap:wrap;gap:8px}.social-links a{display:grid;place-items:center;width:34px;height:34px;color:var(--text-secondary);background:var(--surface-secondary);border:1px solid var(--border);border-radius:6px;text-decoration:none;transition:color 120ms,border-color 120ms,background 120ms}.social-links a:hover,.social-links a:focus-visible{color:var(--action-primary);border-color:var(--action-primary);background:color-mix(in srgb,var(--action-primary) 8%,var(--surface))}.social-links a:hover{color:var(--action-primary);border-color:var(--action-primary);background:var(--surface-hover,color-mix(in srgb,var(--action-primary) 8%,var(--surface)))}.social-links a:focus-visible{outline:2px solid #1abb9c;outline-offset:2px}
</style>
