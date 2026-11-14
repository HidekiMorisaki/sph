<script lang="ts">
 import ActionButton from '#lib/components/ActionButton.svelte';
	import { stickyTabBackdrop } from '#lib/sticky-tab-backdrop.js';
	import { localeMessages, formatLocaleTemplate } from '#lib/locale-messages.js';
	import type { Snippet } from 'svelte';
	import { apiData } from '#lib/api.js';
	import type { ChangeHistoryEntry } from '#lib/change-history.js';
	import { modalTabs } from '#lib/modal-tabs.js';
	import ChangeHistorySection from '#lib/components/ChangeHistorySection.svelte';
	import DetailModal from '#lib/components/DetailModal.svelte';
	import DetailActionButtons from '#lib/components/DetailActionButtons.svelte';
	import PageTabs from '#lib/components/PageTabs.svelte';
	import { employeeDetailSize } from '#lib/employee-detail-size.js';
	import EmailAddressActions from '#lib/components/EmailAddressActions.svelte';
	import SocialLinkIcon from '#lib/components/SocialLinkIcon.svelte';
	import EmployeeWorkforceSection from './EmployeeWorkforceSection.svelte';
	import WorkforceRecordModal from './WorkforceRecordModal.svelte';
	import type { RecordContext } from '#lib/workforce.js';
	import LinkedTeamModal from '#lib/components/LinkedTeamModal.svelte';
	import StatusNotice from '#lib/components/StatusNotice.svelte';
	import { socialLinkLabel, type Employee } from '#lib/employees.js';
	import { formatDate, formatEmployeeName, formatGender, formatLengthOfService, formatTimestamp, localization } from '#lib/localization.js';

	let commonText = $derived(localeMessages[$localization.displayLanguage].common);
	let text = $derived(localeMessages[$localization.displayLanguage].employees);

	let { employee, activeTab = $bindable('basic'), activeHistoryTab = $bindable('employee'), titleId = 'employee-detail-title', returnFocus = null, footer, onEdit, onDelete, onClose, onUpdated }: {
		employee: Employee;
		activeTab?: string;
		activeHistoryTab?: string;
		titleId?: string;
		returnFocus?: HTMLElement | null;
		footer?: Snippet;
		onEdit?: () => void;
		onDelete?: () => void;
		onClose: () => void;
		onUpdated?: (employee: Employee) => void;
	} = $props();
	const instanceId = $props.id();
	const tabPrefix = `employee-detail-${instanceId}`;
	const historyPrefix = `${tabPrefix}-changes`;
	let tabs = $derived([...modalTabs('employee', $localization.displayLanguage).filter(tab => !employee.deletedAt || !['participations','skills'].includes(tab.id)), {id:'history',label:text.historyTab}]);
	$effect(() => { if (!tabs.some(tab => tab.id === activeTab)) activeTab = 'basic'; });
	$effect(() => { if (employee.deletedAt) activeHistoryTab = 'employee'; });
	const socialLabel = (platform: Employee['socialLinks'][number]['platform']) => socialLinkLabel(platform);
	const display = (value: string | number | null | undefined) => value === null || value === undefined || value === '' ? '' : String(value);
	let historyFields: Record<string, string> = $derived({
		employeeCode: text.employeeCode, firstName: text.firstName, middleName: text.middleName, lastName: text.lastName, nameKana: text.nameKana,
		birthDate: text.birthDate, gender: text.gender, bloodType: text.bloodType, countryCode: $localization.displayLanguage === 'ja' ? '国' : 'Country', postalCode: text.postalCode, prefecture: text.prefecture, city: text.city,
		streetAddress: text.streetAddress, buildingName: text.buildingName, mobilePhone: text.mobilePhone, email: text.email, hiredAt: text.hiredAt,
		teams: text.teams, departments: text.departments, primaryDepartmentId: text.primaryDepartmentId, groupId: text.groupId, positions: text.positions, primaryPositionId: text.primaryPositionId, employmentTypeId: text.employmentTypeId, branchId: text.branchId,
		deletionScheduledOn: text.departure.scheduled, retiredAt: text.retiredAt, notes: text.notes, roles: text.roles
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

{#snippet employeeHistory()}
 <ChangeHistorySection collapsible={false} title={text.informationHistory} entries={changeHistory} loading={historyLoading} error={historyError} fieldLabels={historyFields} dateFields={['birthDate','hiredAt','retiredAt','deletionScheduledOn']} valueFormatters={historyValueFormatters} actionLabels={historyActions} />
{/snippet}
{#snippet historyPanel(workforceHistory?: Snippet)}
 <div class="employee-history-card">
 <div class="employee-history-panels">
  <div data-history-panel role="tabpanel" id={`${historyPrefix}-employee`} aria-labelledby={`${historyPrefix}-employee-tab`} hidden={activeHistoryTab!=='employee'}>{@render employeeHistory()}</div>
  {#if workforceHistory}<div data-history-panel role="tabpanel" id={`${historyPrefix}-workforce`} aria-labelledby={`${historyPrefix}-workforce-tab`} hidden={activeHistoryTab!=='workforce'}>{@render workforceHistory()}</div>{/if}
 </div>
 </div>
{/snippet}
<div use:employeeDetailSize aria-busy={historyLoading} hidden={Boolean(linkedTeam || workforceContext)} inert={Boolean(linkedTeam || workforceContext)}>
<DetailModal title={text.detail} {titleId} dialogClass="employee-detail-modal" closeLabel={text.closeDetail} {returnFocus} actions={footer} {onClose}>
	{#if teamRefreshFailed}<StatusNotice message={localeMessages[$localization.displayLanguage].teams.failed} tone="error" onDismiss={() => teamRefreshFailed = false} />{/if}
	{#snippet headerActions()}{#if onEdit || onDelete}<DetailActionButtons editing={false} editLabel={commonText.edit} deleteLabel={commonText.delete} onEdit={onEdit ? () => onEdit() : undefined} onDelete={onDelete ? () => onDelete() : undefined} />{/if}{/snippet}
 <div class="employee-detail-card" use:stickyTabBackdrop>
 <div class="employee-detail-tabs"><PageTabs {tabs} bind:active={activeTab} label={text.detail} idPrefix={tabPrefix} /></div>
 <div class="employee-history-tabs" hidden={activeTab!=='history'}><PageTabs tabs={[{id:'employee',label:text.employeeInformationTab},...(!employee.deletedAt?[{id:'workforce',label:text.workforceHistoryTab}]:[])]} bind:active={activeHistoryTab} label={text.historyTab} idPrefix={historyPrefix} /></div>
 </div>
 <div class="employee-detail-panels">
 <div data-employee-panel class="employee-detail-panel" role="tabpanel" id={`${tabPrefix}-basic`} aria-labelledby={`${tabPrefix}-basic-tab`} hidden={activeTab!=='basic'}>
	<section class="app-detail-section"><h3>{text.basic}</h3><dl class="app-detail-grid"><div><dt>{text.employeeCode}</dt><dd>{employee.employeeCode}</dd></div><div><dt>{text.employee}</dt><dd>{formatEmployeeName(employee, $localization)}</dd></div><div><dt>{text.nameKana}</dt><dd>{display(employee.nameKana)}</dd></div><div><dt>{text.birthDate}</dt><dd>{formatDate(employee.birthDate, $localization)}</dd></div><div><dt>{text.age}</dt><dd>{employee.age}</dd></div><div><dt>{text.gender}</dt><dd>{formatGender(employee.gender, $localization)}</dd></div><div><dt>{text.bloodType}</dt><dd>{display(employee.bloodType)}</dd></div><div><dt>{text.lengthOfService}</dt><dd>{formatLengthOfService(employee.lengthOfService, $localization)}</dd></div></dl></section>
	<section class="app-detail-section"><h3>{text.contact}</h3><dl class="app-detail-grid"><div><dt>{$localization.displayLanguage==='ja'?'国':'Country'}</dt><dd>{employee.countryCode==='US'?($localization.displayLanguage==='ja'?'米国':'United States'):($localization.displayLanguage==='ja'?'日本':'Japan')}</dd></div><div><dt>{employee.countryCode==='US'?'ZIP Code':text.postalCode}</dt><dd>{display(employee.postalCode)}</dd></div><div><dt>{employee.countryCode==='US'?($localization.displayLanguage==='ja'?'州':'State'):text.prefecture}</dt><dd>{display(employee.prefecture)}</dd></div><div><dt>{text.city}</dt><dd>{display(employee.city)}</dd></div><div><dt>{text.streetAddress}</dt><dd>{display(employee.streetAddress)}</dd></div><div><dt>{text.buildingName}</dt><dd>{display(employee.buildingName)}</dd></div><div><dt>{text.mobilePhone}</dt><dd>{display(employee.mobilePhone)}</dd></div><div class="app-detail-wide"><dt>{text.email}</dt><dd><EmailAddressActions email={employee.email} /></dd></div>{#if employee.socialLinks.length}<div class="app-detail-wide"><dt>{text.socialLinks}</dt><dd class="social-links">{#each employee.socialLinks as link}<a href={link.url} target="_blank" rel="noopener noreferrer" aria-label={formatLocaleTemplate(commonText.openExternal, socialLabel(link.platform))} title={socialLabel(link.platform)}><SocialLinkIcon platform={link.platform} /></a>{/each}</dd></div>{/if}</dl></section>
 </div>
 <div data-employee-panel class="employee-detail-panel" role="tabpanel" id={`${tabPrefix}-employment`} aria-labelledby={`${tabPrefix}-employment-tab`} hidden={activeTab!=='employment'}>
	<section class="app-detail-section"><h3>{text.employment}</h3><dl class="app-detail-grid"><div><dt>{text.hiredAt}</dt><dd>{formatDate(employee.hiredAt, $localization)}</dd></div><div><dt>{text.retiredAt}</dt><dd>{formatDate(employee.retiredAt, $localization)}</dd></div><div><dt>{text.departure.scheduled}</dt><dd>{formatDate(employee.deletionScheduledOn??null,$localization)}</dd></div><div><dt>{text.departments}</dt><dd><span class="assignment-badges">{#each employee.departments as department}<span class:primary={department.isPrimary}>{department.name}</span>{/each}</span></dd></div><div class="app-detail-wide"><dt>{text.teams}</dt><dd><span class="team-links">{#each employee.teams ?? [] as team}<ActionButton type="button" data-team-id={team.id} onclick={event => linkedTeam = { id: team.id, trigger: event.currentTarget }} variant="secondary" data-button-scope="button-ad8ef01c65">{team.name}</ActionButton>{:else}-{/each}</span></dd></div><div><dt>{text.groupId}</dt><dd>{display(employee.group?.name)}</dd></div><div><dt>{text.positions}</dt><dd><span class="assignment-badges">{#each employee.positions as position}<span class:primary={position.isPrimary}>{position.name}</span>{/each}</span></dd></div><div><dt>{text.employmentTypeId}</dt><dd>{display(employee.employmentType?.name)}</dd></div><div><dt>{text.branchId}</dt><dd>{display(employee.branch?.name)}</dd></div><div class="app-detail-wide"><dt>{text.notes}</dt><dd class="app-detail-notes">{display(employee.notes)}</dd></div></dl></section>
 </div>
 {#if !employee.deletedAt}<EmployeeWorkforceSection bind:this={workforceSection} employeeId={employee.id} {activeTab} panelPrefix={tabPrefix} historyContent={historyPanel} onEdit={context=>workforceContext=context}/>{:else}<div data-employee-panel class="employee-detail-panel" role="tabpanel" id={`${tabPrefix}-history`} aria-labelledby={`${tabPrefix}-history-tab`} hidden={activeTab!=='history'}>{@render historyPanel()}</div>{/if}
 <div data-employee-panel class="employee-detail-panel" role="tabpanel" id={`${tabPrefix}-system`} aria-labelledby={`${tabPrefix}-system-tab`} hidden={activeTab!=='system'}>
	<section class="app-detail-section"><h3>{text.system}</h3><dl class="app-detail-grid"><div><dt>{text.roles}</dt><dd><span class="role-badges">{#each employee.roles as role}<span>{role.name}</span>{/each}</span></dd></div><div><dt>{text.createdAt}</dt><dd>{formatTimestamp(employee.createdAt, $localization)}</dd></div><div><dt>{text.updatedAt}</dt><dd>{formatTimestamp(employee.updatedAt, $localization)}</dd></div><div><dt>{text.deletedAt}</dt><dd>{formatTimestamp(employee.deletedAt, $localization)}</dd></div></dl></section>
 </div>
 </div>
</DetailModal>
</div>
{#if workforceContext}<WorkforceRecordModal employeeId={employee.id} context={workforceContext} onClose={()=>workforceContext=null} onSaved={async()=>{await workforceSection?.refresh();onUpdated?.(employee);}}/>{/if}
{#if linkedTeam}{@const context = linkedTeam}<LinkedTeamModal teamId={context.id} returnFocus={context.trigger} onClose={() => linkedTeam = null} onChanged={() => void refreshEmployee()} />{/if}

<style>
 .employee-detail-panels,.employee-history-panels{position:relative;min-width:0}
 .employee-detail-card{position:sticky;top:0;z-index:3;min-width:0;border:1px solid var(--border);border-radius:var(--sph-radius-6px);background:var(--surface)}
 .employee-detail-card::before{content:"";position:absolute;top:calc(-1px - var(--sticky-tab-backdrop-height,24px));left:-25px;right:-25px;height:var(--sticky-tab-backdrop-height,24px);background:var(--bg);pointer-events:none}
 .employee-history-card{position:relative;min-width:0;border:1px solid var(--border);border-radius:var(--sph-radius-6px);background:var(--surface)}
 .employee-history-tabs{background:var(--surface);border-top:1px solid var(--border);border-radius:0 0 var(--sph-radius-6px) var(--sph-radius-6px)}
 .employee-history-tabs :global(.page-tabs){margin:0;padding:var(--sph-space-12px) var(--sph-space-16px) 0;border:0;border-radius:0;background:transparent;gap:var(--sph-space-8px)}
 .employee-history-tabs :global(.page-tabs button){padding:var(--sph-space-10px) var(--sph-space-12px)}
 .employee-history-tabs :global(.page-tabs button[aria-selected=true]){color:var(--text);border-bottom-color:var(--action-primary);font-weight:var(--sph-weight-600)}
 .employee-history-panels :global(.app-detail-section){padding:var(--sph-space-16px);border:0;border-radius:0;background:transparent}
 :global(.employee-detail-modal > .app-detail-body){scrollbar-gutter:stable}
 :global(.employee-detail-modal[data-employee-sizing] [data-employee-panel]),:global(.employee-detail-modal[data-employee-sizing] [data-history-panel]){display:grid!important;position:absolute!important;inset:0 0 auto;visibility:hidden!important}
 :global(.employee-detail-modal[data-employee-sizing] .employee-history-tabs){display:block!important}
 .employee-detail-panel{display:grid;gap:var(--sph-space-16px);min-width:0}.employee-detail-panel[hidden]{display:none}.employee-detail-tabs{min-width:0;border-radius:var(--sph-radius-6px) var(--sph-radius-6px) 0 0}.employee-detail-tabs :global(.page-tabs){margin:0;border:0;border-radius:var(--sph-radius-6px);background:var(--surface)}
	.team-links{display:flex;flex-wrap:wrap;gap:var(--sph-space-6px) var(--sph-space-12px)}.team-links :global(button[data-button-scope="button-ad8ef01c65"]){padding:0;border:0;background:transparent;color:var(--action-primary);font:inherit;cursor:pointer;text-align:left}.team-links :global(button:hover[data-button-scope="button-ad8ef01c65"]){text-decoration:underline}.team-links :global(button:focus-visible[data-button-scope="button-ad8ef01c65"]){outline:2px solid var(--sph-color-accent);outline-offset:2px}
	.role-badges{display:flex;flex-wrap:wrap;gap:var(--sph-space-4px)}.role-badges>span{display:inline-flex;align-items:center;min-height:20px;padding:var(--sph-space-2px) var(--sph-space-7px);background:var(--sph-color-accent-overlay-12);color:var(--sph-color-accent-hover);border:1px solid var(--sph-color-accent-overlay-28);border-radius:var(--sph-radius-999px);font-size:var(--font-size-support);font-weight:var(--sph-weight-600);line-height:var(--sph-leading-1-2)}
	.assignment-badges{display:flex;flex-wrap:wrap;gap:var(--sph-space-4px)}.assignment-badges>span{display:inline-flex;align-items:center;min-height:20px;padding:var(--sph-space-2px) var(--sph-space-7px);background:var(--surface-secondary);color:var(--text-secondary);border:1px solid var(--border);border-radius:var(--sph-radius-999px);font-size:var(--font-size-support);font-weight:var(--sph-weight-500);line-height:var(--sph-leading-1-2)}.assignment-badges>span.primary{background:var(--sph-color-action-overlay-12);color:var(--sph-color-action);border-color:var(--sph-color-action-overlay-28)}
	.social-links{display:flex;flex-wrap:wrap;gap:var(--sph-space-8px)}.social-links a{display:grid;place-items:center;width:34px;height:34px;color:var(--text-secondary);background:var(--surface-secondary);border:1px solid var(--border);border-radius:var(--sph-radius-6px);text-decoration:none;transition:color 120ms,border-color 120ms,background 120ms}.social-links a:hover,.social-links a:focus-visible{color:var(--action-primary);border-color:var(--action-primary);background:color-mix(in srgb,var(--action-primary) 8%,var(--surface))}.social-links a:hover{color:var(--action-primary);border-color:var(--action-primary);background:var(--surface-hover,color-mix(in srgb,var(--action-primary) 8%,var(--surface)))}.social-links a:focus-visible{outline:2px solid var(--sph-color-accent);outline-offset:2px}
@media (max-width:700px), (min-width:701px) and (max-width:1024px) and (max-height:500px) and (any-pointer:coarse){.employee-detail-card::before{left:-17px;right:-17px}}
</style>
