import { createFinancialTrendsPdf } from '$lib/financialTrendsPdf';
import type { FinancialCurrency } from '$lib/financial-currency';
import type { FinancialTrendsResponse } from '$lib/financialTrendsData';
import type { LocalizationSettings } from '$lib/localization';
import { loadPdfFont } from '$lib/pdfFont';

export type FinancialTrendsPdfSelection = { startYear: number; endYear: number; currency: FinancialCurrency };

export async function prepareFinancialTrendsPdfDownload(selection: FinancialTrendsPdfSelection, settings: LocalizationSettings, fetcher: typeof fetch = fetch) {
	const font = await loadPdfFont(fetcher);
	// A fresh REST request verifies access and uses the latest published values.
	const query = new URLSearchParams({ startYear: String(selection.startYear), endYear: String(selection.endYear), currency: selection.currency });
	const response = await fetcher(`/v1/financial-trends?${query}`);
	if (!response.ok) throw new Error(`Financial trends PDF request failed (${response.status})`);
	const result = await response.json() as FinancialTrendsResponse;
	if (result.meta?.startYear !== selection.startYear || result.meta?.endYear !== selection.endYear || result.meta?.currency !== selection.currency
		|| !Array.isArray(result.data?.totals) || !Array.isArray(result.data?.branches)
		|| result.data.totals.length !== selection.endYear - selection.startYear + 1
		|| result.data.totals.some((point, index) => point.year !== selection.startYear + index))
		throw new Error('Financial trends PDF selection mismatch');
	return createFinancialTrendsPdf(result, settings, font);
}
