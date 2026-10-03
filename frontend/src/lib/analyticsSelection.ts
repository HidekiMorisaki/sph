export const analyticsChartKeys = ['age', 'gender', 'trend', 'turnover'] as const;
export type ChartKey = typeof analyticsChartKeys[number];
export type AnalyticsSelection = { referenceDate: string; charts: Record<ChartKey, { fromMonth: string; toMonth: string }> };
export type SaveStatus = 'saving' | 'saved' | 'saveFailed';
const outstanding = new Set<Promise<void>>();

export async function readAnalyticsSelection(): Promise<{ employeeId: number; today: string; selection: AnalyticsSelection | null }> {
	while (outstanding.size) await Promise.all([...outstanding]);
	const response = await fetch('/v1/settings/employee-analysis', { cache: 'no-store' });
	if (!response.ok) throw new Error('Unable to restore employee analysis selection');
	return (await response.json()).data;
}

export function analyticsSelectionSaver(employeeId: number, onStatus: (status: SaveStatus) => void) {
	let pending: AnalyticsSelection | null = null;
	let running: Promise<void> | null = null;
	let version = 0;
	async function drain() {
		while (pending) {
			const selection = pending;
			const current = version;
			pending = null;
			try {
				const response = await fetch('/v1/settings/employee-analysis', {
					method: 'PATCH', headers: { 'content-type': 'application/json', 'x-settings-owner': String(employeeId) },
					body: JSON.stringify(selection), keepalive: true
				});
				if (!response.ok) throw new Error('Unable to save employee analysis selection');
				if (current === version) onStatus('saved');
			} catch { if (current === version) onStatus('saveFailed'); }
		}
	}
	function start(): Promise<void> {
		if (running) return running;
		const flight = drain().finally(() => {
			outstanding.delete(flight);
			running = null;
			if (pending) start();
		});
		running = flight;
		outstanding.add(flight);
		return flight;
	}
	return {
		enqueue(selection: AnalyticsSelection) {
			pending = structuredClone(selection);
			version++;
			onStatus('saving');
			return start();
		}
	};
}
