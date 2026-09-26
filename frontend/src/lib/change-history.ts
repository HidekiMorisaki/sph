export type ChangeHistoryChange = {
	field: string;
	before: string | null;
	after: string | null;
};

export type ChangeHistoryEntry = {
	id: number;
	changedAt: string;
	actorName: string;
	action: string;
	changes: ChangeHistoryChange[];
};
