import { parseAnalyticsPeriod, parseAnalyticsReferenceDate } from './employee-analytics';
import { throwApiError } from './response';

export const analyticsChartKeys = ['age', 'gender', 'trend', 'turnover'] as const;
export type AnalyticsSelection = {
	referenceDate: string;
	charts: Record<(typeof analyticsChartKeys)[number], { fromMonth: string; toMonth: string }>;
};

function object(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function parseAnalyticsSelection(value: unknown, today: string): AnalyticsSelection {
	const invalid = (): never => throwApiError(422, 'INVALID_ANALYTICS_SELECTION', 'Select a valid reference date and a period for each chart.');
	if (!object(value) || Object.keys(value).some((key) => key !== 'referenceDate' && key !== 'charts') ||
		typeof value.referenceDate !== 'string' || !object(value.charts) ||
		Object.keys(value.charts).length !== analyticsChartKeys.length) invalid();
	const input = value as Record<string, unknown> & { referenceDate: string; charts: Record<string, unknown> };
	const referenceUrl = new URL('http://analytics.invalid');
	referenceUrl.searchParams.set('referenceDate', input.referenceDate);
	const referenceDate = parseAnalyticsReferenceDate(referenceUrl, today);
	const charts = {} as AnalyticsSelection['charts'];
	for (const key of analyticsChartKeys) {
		const period = input.charts[key];
		if (!object(period) || Object.keys(period).length !== 2 || typeof period.fromMonth !== 'string' || typeof period.toMonth !== 'string') invalid();
		const months = period as { fromMonth: string; toMonth: string };
		const url = new URL('http://analytics.invalid');
		url.searchParams.set('fromMonth', months.fromMonth);
		url.searchParams.set('toMonth', months.toMonth);
		const parsed = parseAnalyticsPeriod(url, referenceDate)!;
		charts[key] = { fromMonth: parsed.fromMonth, toMonth: parsed.toMonth };
	}
	return { referenceDate, charts };
}
