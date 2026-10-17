type ReturnState = { scrollTop: number; scrollLeft: number; selector: string };

// Scope snapshots to the actual originating row/control, rather than a global
// title ID. Detached/replaced rows do not retain state for another record.
const pending = new WeakMap<HTMLElement, Map<string, ReturnState>>();

export function rememberDetailReturn(origin: HTMLElement | null, id: string, dialog: HTMLDialogElement, selector: string): void {
	if (!origin) return;
	const body = dialog.querySelector<HTMLElement>('.app-detail-body');
	if (!body) return;
	const states = pending.get(origin) ?? new Map<string, ReturnState>();
	states.set(id, { scrollTop: body.scrollTop, scrollLeft: body.scrollLeft, selector });
	pending.set(origin, states);
}

export function takeDetailReturn(origin: HTMLElement | null, id: string): ReturnState | undefined {
	if (!origin?.isConnected) return;
	const state = pending.get(origin)?.get(id);
	pending.get(origin)?.delete(id);
	return state;
}

export function forgetDetailReturn(origin: HTMLElement | null, id: string): void {
	if (origin) pending.get(origin)?.delete(id);
}
