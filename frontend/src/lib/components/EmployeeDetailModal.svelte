<script lang="ts">
	import type { Snippet } from 'svelte';
	import { apiData } from '$lib/api';
	import type { ChangeHistoryEntry } from '$lib/change-history';
	import ChangeHistorySection from '$lib/components/ChangeHistorySection.svelte';
	import DetailModal from '$lib/components/DetailModal.svelte';
	import type { Employee } from '$lib/employees';
	import { en as messages } from '$lib/ui/messages';

	let { employee, returnFocus = null, footer, onClose }: {
		employee: Employee;
		returnFocus?: HTMLElement | null;
		footer?: Snippet;
		onClose: () => void;
	} = $props();
	const dateIso = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
	const display = (value: string | number | null | undefined) => value === null || value === undefined || value === '' ? '' : String(value);
	const formatDate = (value: string | null) => value ? value.slice(0, 10) : '';
	const formatTimestampDate = (value: string | null) => value ? dateIso(new Date(value)) : '';
	const formatLengthOfService = (value: Employee['lengthOfService']) => `${value.years} ${value.years === 1 ? messages.employee.year : messages.employee.years} ${value.months} ${value.months === 1 ? messages.employee.month : messages.employee.months}`;
	const historyFields: Record<string, string> = {
		employeeCode: 'Employee code', firstName: 'First name', middleName: 'Middle name', lastName: 'Last name', nameKana: 'Name (Kana)',
		birthDate: 'Birth date', gender: 'Gender', bloodType: 'Blood type', postalCode: 'Postal code', prefecture: 'Prefecture', city: 'City',
		streetAddress: 'Street address', buildingName: 'Building', mobilePhone: 'Mobile phone', email: 'Email', hiredAt: 'Hire date',
		departmentId: 'Department', groupId: 'Group', positionId: 'Position', employmentTypeId: 'Employment type', branchId: 'Branch',
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
	<section class="app-detail-section"><h3>Basic information</h3><dl class="app-detail-grid"><div><dt>Employee code</dt><dd>{employee.employeeCode}</dd></div><div><dt>First name</dt><dd>{employee.firstName}</dd></div><div><dt>Middle name</dt><dd>{display(employee.middleName)}</dd></div><div><dt>Last name</dt><dd>{employee.lastName}</dd></div><div><dt>Name (Kana)</dt><dd>{display(employee.nameKana)}</dd></div><div><dt>Birth date</dt><dd>{formatDate(employee.birthDate)}</dd></div><div><dt>{messages.employee.age}</dt><dd>{employee.age}</dd></div><div><dt>{messages.employee.lengthOfService}</dt><dd>{formatLengthOfService(employee.lengthOfService)}</dd></div><div><dt>Gender</dt><dd>{display(employee.gender)}</dd></div><div><dt>Blood type</dt><dd>{display(employee.bloodType)}</dd></div></dl></section>
	<section class="app-detail-section"><h3>Contact information</h3><dl class="app-detail-grid"><div><dt>Postal code</dt><dd>{display(employee.postalCode)}</dd></div><div><dt>Prefecture</dt><dd>{display(employee.prefecture)}</dd></div><div><dt>City</dt><dd>{display(employee.city)}</dd></div><div><dt>Street address</dt><dd>{display(employee.streetAddress)}</dd></div><div><dt>Building</dt><dd>{display(employee.buildingName)}</dd></div><div><dt>Mobile phone</dt><dd>{display(employee.mobilePhone)}</dd></div><div><dt>Email</dt><dd>{display(employee.email)}</dd></div></dl></section>
	<section class="app-detail-section"><h3>Employment</h3><dl class="app-detail-grid"><div><dt>Hire date</dt><dd>{formatDate(employee.hiredAt)}</dd></div><div><dt>Retirement date</dt><dd>{formatDate(employee.retiredAt)}</dd></div><div><dt>Department</dt><dd>{display(employee.departmentRef?.name)}</dd></div><div><dt>Group</dt><dd>{display(employee.group?.name)}</dd></div><div><dt>Position</dt><dd>{display(employee.position?.name)}</dd></div><div><dt>Employment type</dt><dd>{display(employee.employmentType?.name)}</dd></div><div><dt>Branch</dt><dd>{display(employee.branch?.name)}</dd></div><div class="app-detail-wide"><dt>Notes</dt><dd class="app-detail-notes">{display(employee.notes)}</dd></div></dl></section>
	<section class="app-detail-section"><h3>System information</h3><dl class="app-detail-grid"><div><dt>Roles</dt><dd><span class="role-badges">{#each employee.roles as role}<span>{role.name}</span>{/each}</span></dd></div><div><dt>Created at</dt><dd>{formatTimestampDate(employee.createdAt)}</dd></div><div><dt>Updated at</dt><dd>{formatTimestampDate(employee.updatedAt)}</dd></div><div><dt>Deleted at</dt><dd>{formatTimestampDate(employee.deletedAt)}</dd></div></dl></section>
	<ChangeHistorySection entries={changeHistory} loading={historyLoading} error={historyError} fieldLabels={historyFields} actionLabels={historyActions} />
</DetailModal>

<style>
	.role-badges{display:flex;flex-wrap:wrap;gap:4px}.role-badges>span{display:inline-flex;align-items:center;min-height:20px;padding:2px 7px;background:rgba(26,187,156,.12);color:#169f85;border:1px solid rgba(26,187,156,.28);border-radius:999px;font-size:10px;font-weight:600;line-height:1.2}
</style>
