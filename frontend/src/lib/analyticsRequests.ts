import { apiData } from '$lib/api';
import type { AnalyticsData } from '$lib/analytics';

export type AnalyticsFailure = 'error' | 'forbidden' | 'invalidReferenceDate' | 'referenceDateMismatch' | 'invalidMonth' | 'reversedPeriod' | 'futureMonth';
export class AnalyticsRequestError extends Error {
	constructor(public reason: AnalyticsFailure) {
		super(reason);
	}
}

export async function requestAnalytics(
	options: { referenceDate?: string; fromMonth?: string; toMonth?: string },
	fetcher: typeof fetch = fetch
): Promise<AnalyticsData> {
	const query = new URLSearchParams();
	for (const [key, value] of Object.entries(options)) if (value !== undefined && value !== '') query.set(key, value);
	const response = await fetcher(`/v1/employee-analytics${query.size ? `?${query}` : ''}`, { cache: 'no-store' });
	if (!response.ok) {
		if (response.status === 403) throw new AnalyticsRequestError('forbidden');
		if (response.status === 422) {
			const payload = await response.json() as { error?: { code?: string; details?: { reason?: string }[] } };
			if (payload.error?.code === 'INVALID_ANALYTICS_REFERENCE_DATE') throw new AnalyticsRequestError('invalidReferenceDate');
			const reason = payload.error?.details?.[0]?.reason;
			throw new AnalyticsRequestError(reason === 'FUTURE_MONTH' ? 'futureMonth' : reason === 'REVERSED_PERIOD' ? 'reversedPeriod' : 'invalidMonth');
		}
		throw new AnalyticsRequestError('error');
	}
	const result = await apiData<AnalyticsData>(response);
	if (options.referenceDate && result.referenceDate !== options.referenceDate) throw new AnalyticsRequestError('referenceDateMismatch');
	return result;
}

// A shared gate for page and chart requests. Responses from an earlier date cannot be applied.
export function analyticsRequestGate() {
	let generation = 0;
	return {
		advance: () => ++generation,
		current: () => generation,
		isCurrent: (request: number) => request === generation
	};
}
