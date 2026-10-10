import { jsPDF } from 'jspdf';
import { productName } from '$lib/brand';
import { niceAxis } from '$lib/chartAxis';
import { financialTrendSegmentValue, financialTrendSeries, type FinancialTrend, type FinancialTrendsResponse } from '$lib/financialTrendsData';
import { DISPLAY_LANGUAGES, type LocalizationSettings } from '$lib/localization';
import { localeMessages } from '$lib/locale-messages';

const fontName = 'NotoSansJP';
const ink = '#243449', muted = '#607086', border = '#dce4ec', green = '#168b75', white = '#ffffff';
const clean = (value: string) => value.replace(/[\u2010-\u2015\u2212]/g, '-');
const pageHeight = 595.28;
const margin = 36;
const repositoryUrl = 'https://github.com/HidekiMorisaki/sph';

/** Draw complete, vector-based charts from the same REST data as the screen. */
export function createFinancialTrendsPdf(result: FinancialTrendsResponse, settings: LocalizationSettings, fontBase64: string) {
	const { data, meta } = result;
	const text = localeMessages[settings.displayLanguage].financialTrends;
	const title = localeMessages[settings.displayLanguage].navigation.items.financialTrends;
	const locale = DISPLAY_LANGUAGES.find((item) => item.value === settings.displayLanguage)!.locale;
	const compact = new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 });
	const pageWidth = Math.max(841.89, 170 + data.totals.length * 70);
	const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: [pageWidth, pageHeight], compress: true, putOnlyUsedFonts: true });
	doc.addFileToVFS('NotoSansJP-Regular.ttf', fontBase64);
	doc.addFont('NotoSansJP-Regular.ttf', fontName, 'normal');
	doc.setFont(fontName, 'normal');
	doc.setLanguage(settings.displayLanguage);
	doc.setProperties({ title, subject: `${meta.startYear}-${meta.endYear} ${meta.currency}`, creator: productName });
	const measure = (value: string, size: number) => { doc.setFontSize(size); return doc.getTextWidth(clean(value)); };
	function label(value: string, x: number, y: number, size = 10, color = ink, align: 'left' | 'center' | 'right' = 'left') {
		doc.setFontSize(size).setTextColor(color).text(clean(value), x, y, { align });
	}
	function line(x1: number, y1: number, x2: number, y2: number, color = border, thickness = 0.7) {
		doc.setDrawColor(color).setLineWidth(thickness).line(x1, y1, x2, y2);
	}
	function rectangle(x: number, y: number, width: number, height: number, fill: string) {
		doc.setFillColor(fill).rect(x, y, width, height, 'F');
	}
	function fitTitle(value: string) {
		let fitted = clean(value);
		while (measure(fitted, 18) > pageWidth - 2 * margin && fitted.length > 4) fitted = `${fitted.slice(0, -4)}...`;
		return fitted;
	}
	const totalPages = 1 + data.branches.length;
	const charts = [
		{ name: text.allBranchesTotal, points: data.totals },
		...data.branches.map((branch) => {
			const byYear = new Map(branch.data.map((point) => [point.year, point]));
			return { name: branch.branchName, points: data.totals.map((total): FinancialTrend => byYear.get(total.year) ?? {
				year: total.year, branchCount: 0, unavailable: false, revenue: null, variableCost: null, fixedCost: null, netProfit: null
			}) };
		})
	];
	for (const [pageIndex, chart] of charts.entries()) {
		if (pageIndex) doc.addPage([pageWidth, pageHeight], 'landscape');
		rectangle(0, 0, pageWidth, 6, green);
		label(productName, margin, 30, 10, muted);
		doc.link(margin, 19, measure(productName, 10), 13, { url: repositoryUrl });
		label(fitTitle(chart.name), margin, 60, 18, green);
		label(`${meta.startYear}-${meta.endYear}  |  ${meta.basis === 'calendar' ? text.calendarYear : text.fiscalYear}  |  ${text.currency}: ${meta.currency}`, margin, 82, 10, muted);
		let legendX = margin;
		for (const series of financialTrendSeries) {
			doc.setFillColor(series.color).circle(legendX + 5, 115, 5, 'F');
			label(text[series.label], legendX + 17, 119, 10);
			legendX += 35 + measure(text[series.label], 10);
		}
		const left = 92, right = 42, top = 166, plotHeight = 300;
		const plotWidth = pageWidth - left - right;
		const slotWidth = plotWidth / Math.max(1, chart.points.length);
		const barWidth = Math.min(44, slotWidth * 0.6);
		const totals = chart.points.map((point) => financialTrendSeries.reduce((sum, series) => sum + financialTrendSegmentValue(point, series.key), 0));
		const axis = niceAxis(totals, meta.currency === 'JPY' ? 1 : 0.01);
		const y = (value: number) => top + plotHeight - value / axis.maximum * plotHeight;
		label(`${text.amountAxis} (${meta.currency})`, left, 150, 10, muted);
		for (const tick of axis.ticks) {
			line(left, y(tick), pageWidth - right, y(tick));
			label(compact.format(tick), left - 10, y(tick) + 3, 9, muted, 'right');
		}
		for (const [index, point] of chart.points.entries()) {
			const x = left + slotWidth * (index + 0.5);
			let bottom = 0;
			for (const series of financialTrendSeries) {
				const value = financialTrendSegmentValue(point, series.key);
				if (value <= 0) continue;
				const height = value / axis.maximum * plotHeight;
				const segmentTop = y(bottom + value);
				rectangle(x - barWidth / 2, segmentTop, barWidth, height, series.color);
				const valueLabel = compact.format(value);
				if (height >= 22 && barWidth >= 37 && measure(valueLabel, 8) < barWidth - 3)
					label(valueLabel, x, segmentTop + height / 2 + 3, 8, series.key === 'variableCost' ? white : ink, 'center');
				bottom += value;
			}
			if (point.netProfit !== null) {
				const netProfit = Number(point.netProfit);
				if (Number.isFinite(netProfit)) label(`${netProfit > 0 ? '+' : ''}${compact.format(netProfit)}`, x, Math.max(top + 12, y(bottom) - 8), 9, netProfit < 0 ? '#b43636' : green, 'center');
			}
			if (point.revenue === null) label('-', x, y(0) - 8, 12, muted, 'center');
			label(String(point.year), x, 488, 9, muted, 'center');
		}
		label(text.yearAxis, left + plotWidth / 2, 509, 10, muted, 'center');
		label(text.pdfMissing, margin, 542, 9, muted);
		line(margin, 557, pageWidth - margin, 557);
		label(title, margin, 577, 9, muted);
		label(`${text.pdfPage} ${pageIndex + 1} / ${totalPages}`, pageWidth - margin, 577, 9, muted, 'right');
	}
	return { document: doc, fileName: `financial-trends_${meta.startYear}-${meta.endYear}_${meta.currency}.pdf` };
}
