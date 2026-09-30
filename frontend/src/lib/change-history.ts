import type { EmployeeNameParts } from '$lib/localization';

export type ChangeHistoryChange = {
	field: string;
	before: string | EmployeeNameParts | null;
	after: string | EmployeeNameParts | null;
};

export type ChangeHistoryEntry = {
	id: number;
	changedAt: string;
	actor: { firstName: string; middleName: string | null; lastName: string };
	action: string;
	changes: ChangeHistoryChange[];
};
