<script lang="ts">
	import type { Snippet } from 'svelte';
	import { apiData } from '$lib/api';
	import type { ChangeHistoryEntry } from '$lib/change-history';
	import ChangeHistorySection from '$lib/components/ChangeHistorySection.svelte';
	import DetailModal from '$lib/components/DetailModal.svelte';
	import SocialLinkIcon from '$lib/components/SocialLinkIcon.svelte';
	import { socialLinkLabel, type Employee } from '$lib/employees';
	import { formatDate, formatTimestamp, localization } from '$lib/localization';
	import { en as messages } from '$lib/ui/messages';

	let { employee, returnFocus = null, footer, onClose }: {
		employee: Employee;
		returnFocus?: HTMLElement | null;
		footer?: Snippet;
		onClose: () => void;
	} = $props();
	const display = (value: string | number | null | undefined) => value === null || value === undefined || value === '' ? '' : String(value);
	const formatLengthOfService = (value: Employee['lengthOfService']) => `${value.years} ${value.years === 1 ? messages.employee.year : messages.employee.years} ${value.months} ${value.months === 1 ? messages.employee.month : messages.employee.months}`;
	const historyFields: Record<string, string> = {
		employeeCode: 'Employee code', firstName: 'First name', middleName: 'Middle name', lastName: 'Last name', nameKana: 'Name (Kana)',
		birthDate: 'Birth date', gender: 'Gender', bloodType: 'Blood type', postalCode: 'Postal code', prefecture: 'Prefecture', city: 'City',
		streetAddress: 'Street address', buildingName: 'Building', mobilePhone: 'Mobile phone', email: 'Email', hiredAt: 'Hire date',
		departments: 'Departments', primaryDepartmentId: 'Primary department', groupId: 'Group', positions: 'Positions', primaryPositionId: 'Primary position', employmentTypeId: 'Employment type', branchId: 'Branch',
		retiredAt: 'Retirement date', notes: 'Notes', roles: 'Roles'
	};
	const historyActions: Record<string, string> = { create: 'Created', update: 'Updated', delete: 'Deleted' };
	let changeHistory = $state<ChangeHistoryEntry[]>([]);
	let historyLoading = $state(false);
	let historyError = $state(false);
	let historyRequestId = 0;

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

<DetailModal title="Employee detail" titleId="employee-detail-title" closeLabel="Close employee detail" {returnFocus} actions={footer} {onClose}>
	<section class="app-detail-section"><h3>Basic information</h3><dl class="app-detail-grid"><div><dt>Employee code</dt><dd>{employee.employeeCode}</dd></div><div><dt>First name</dt><dd>{employee.firstName}</dd></div><div><dt>Middle name</dt><dd>{display(employee.middleName)}</dd></div><div><dt>Last name</dt><dd>{employee.lastName}</dd></div><div><dt>Name (Kana)</dt><dd>{display(employee.nameKana)}</dd></div><div><dt>Birth date</dt><dd>{formatDate(employee.birthDate, $localization)}</dd></div><div><dt>{messages.employee.age}</dt><dd>{employee.age}</dd></div><div><dt>{messages.employee.lengthOfService}</dt><dd>{formatLengthOfService(employee.lengthOfService)}</dd></div><div><dt>Gender</dt><dd>{display(employee.gender)}</dd></div><div><dt>Blood type</dt><dd>{display(employee.bloodType)}</dd></div></dl></section>
	<section class="app-detail-section"><h3>Contact information</h3><dl class="app-detail-grid"><div><dt>Postal code</dt><dd>{display(employee.postalCode)}</dd></div><div><dt>Prefecture</dt><dd>{display(employee.prefecture)}</dd></div><div><dt>City</dt><dd>{display(employee.city)}</dd></div><div><dt>Street address</dt><dd>{display(employee.streetAddress)}</dd></div><div><dt>Building</dt><dd>{display(employee.buildingName)}</dd></div><div><dt>Mobile phone</dt><dd>{display(employee.mobilePhone)}</dd></div><div><dt>Email</dt><dd>{display(employee.email)}</dd></div>{#if employee.socialLinks.length}<div class="app-detail-wide"><dt>Social links</dt><dd class="social-links">{#each employee.socialLinks as link}<a href={link.url} target="_blank" rel="noopener noreferrer" aria-label={`Open ${socialLinkLabel(link.platform)} in a new window`} title={socialLinkLabel(link.platform)}><SocialLinkIcon platform={link.platform} /></a>{/each}</dd></div>{/if}</dl></section>
	<section class="app-detail-section"><h3>Employment</h3><dl class="app-detail-grid"><div><dt>Hire date</dt><dd>{formatDate(employee.hiredAt, $localization)}</dd></div><div><dt>Retirement date</dt><dd>{formatDate(employee.retiredAt, $localization)}</dd></div><div><dt>Departments</dt><dd><span class="assignment-badges">{#each employee.departments as department}<span class:primary={department.isPrimary}>{department.name}</span>{/each}</span></dd></div><div><dt>Group</dt><dd>{display(employee.group?.name)}</dd></div><div><dt>Positions</dt><dd><span class="assignment-badges">{#each employee.positions as position}<span class:primary={position.isPrimary}>{position.name}</span>{/each}</span></dd></div><div><dt>Employment type</dt><dd>{display(employee.employmentType?.name)}</dd></div><div><dt>Branch</dt><dd>{display(employee.branch?.name)}</dd></div><div class="app-detail-wide"><dt>Notes</dt><dd class="app-detail-notes">{display(employee.notes)}</dd></div></dl></section>
	<section class="app-detail-section"><h3>System information</h3><dl class="app-detail-grid"><div><dt>Roles</dt><dd><span class="role-badges">{#each employee.roles as role}<span>{role.name}</span>{/each}</span></dd></div><div><dt>Created at</dt><dd>{formatTimestamp(employee.createdAt, $localization)}</dd></div><div><dt>Updated at</dt><dd>{formatTimestamp(employee.updatedAt, $localization)}</dd></div><div><dt>Deleted at</dt><dd>{formatTimestamp(employee.deletedAt, $localization)}</dd></div></dl></section>
	<ChangeHistorySection entries={changeHistory} loading={historyLoading} error={historyError} fieldLabels={historyFields} dateFields={['birthDate','hiredAt','retiredAt']} actionLabels={historyActions} />
</DetailModal>

<style>
	.role-badges{display:flex;flex-wrap:wrap;gap:4px}.role-badges>span{display:inline-flex;align-items:center;min-height:20px;padding:2px 7px;background:rgba(26,187,156,.12);color:#169f85;border:1px solid rgba(26,187,156,.28);border-radius:999px;font-size:10px;font-weight:600;line-height:1.2}
	.assignment-badges{display:flex;flex-wrap:wrap;gap:4px}.assignment-badges>span{display:inline-flex;align-items:center;min-height:20px;padding:2px 7px;background:var(--surface-secondary);color:var(--text-secondary);border:1px solid var(--border);border-radius:999px;font-size:10px;font-weight:500;line-height:1.2}.assignment-badges>span.primary{background:rgba(51,122,183,.12);color:#337ab7;border-color:rgba(51,122,183,.28)}
	.social-links{display:flex;flex-wrap:wrap;gap:8px}.social-links a{display:grid;place-items:center;width:34px;height:34px;color:var(--text-secondary);background:var(--surface-secondary);border:1px solid var(--border);border-radius:6px;text-decoration:none;transition:color 120ms,border-color 120ms,background 120ms}.social-links a:hover,.social-links a:focus-visible{color:var(--action-primary);border-color:var(--action-primary);background:color-mix(in srgb,var(--action-primary) 8%,var(--surface))}.social-links a:focus-visible{outline:2px solid #1abb9c;outline-offset:2px}
</style>
