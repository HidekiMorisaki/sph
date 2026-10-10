import { requestAnalytics } from '$lib/analyticsRequests';
import { createAnalyticsPdf } from '$lib/analyticsPdf';
import type { LocalizationSettings } from '$lib/localization';
import { loadPdfFont } from '$lib/pdfFont';

export type AnalyticsPdfSelection = { referenceDate: string; fromMonth: string; toMonth: string };
export async function prepareAnalyticsPdfDownload(selection: AnalyticsPdfSelection, settings: LocalizationSettings, fetcher: typeof fetch = fetch) {
	const font = await loadPdfFont(fetcher);
	// Use the exact same server-side access check as the page, on every download.
	// A cached screen or font must never substitute for a fresh authorized API response.
	const data = await requestAnalytics(selection, fetcher);
	if (data.period?.fromMonth !== selection.fromMonth || data.period?.toMonth !== selection.toMonth) throw new Error('PDF period mismatch');
	return { ...createAnalyticsPdf(data, settings, font), data };
}
