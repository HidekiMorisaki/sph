import type { FinancialCurrency } from '$lib/financial-currency';

export type FinancialTrend = {
	year: number;
	branchCount: number;
	unavailable: boolean;
	revenue: string | null;
	variableCost: string | null;
	fixedCost: string | null;
	netProfit: string | null;
};

export type FinancialTrendsResult = {
	totals: FinancialTrend[];
	branches: { branchId: number; branchName: string; data: FinancialTrend[] }[];
};

export type FinancialTrendsResponse = {
	data: FinancialTrendsResult;
	meta: { startYear: number; endYear: number; currency: FinancialCurrency; basis: 'calendar' | 'fiscal'; fiscalStartMonth: number };
};

export type FinancialTrendSegment = 'variableCost' | 'fixedCost' | 'profit' | 'loss';
export const financialTrendSeries: { key: FinancialTrendSegment; label: 'variableLegend' | 'fixedLegend' | 'profitLegend' | 'lossLegend'; color: string }[] = [
	{ key: 'variableCost', label: 'variableLegend', color: '#5f8cff' },
	{ key: 'fixedCost', label: 'fixedLegend', color: '#ffbd78' },
	{ key: 'profit', label: 'profitLegend', color: '#ed56c1' },
	{ key: 'loss', label: 'lossLegend', color: '#f5a4cf' }
];

export function financialTrendSegmentValue(point: FinancialTrend, key: FinancialTrendSegment): number {
	if (point.revenue === null || point.netProfit === null) return 0;
	if (key === 'profit') return Math.max(0, Number(point.netProfit));
	if (key === 'loss') return Math.max(0, -Number(point.netProfit));
	return Number(point[key] ?? 0);
}
