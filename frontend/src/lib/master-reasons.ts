// Map existing REST validation reasons to stable frontend message IDs.
const reasons: Record<string, string> = {
	DUPLICATE_VALUE: 'valueDuplicate',
	'Select an existing employee.': 'employeeInvalid',
	'Select an active department.': 'activeDepartment'
};

export function masterReason(reason: string | undefined): string {
	return reason && Object.hasOwn(reasons, reason) ? reasons[reason] : 'invalidValue';
}
