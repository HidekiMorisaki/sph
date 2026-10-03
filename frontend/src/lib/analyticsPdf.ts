import { jsPDF } from 'jspdf';
import { analyticsPeriodError, analyticsText, type AnalyticsData } from '$lib/analytics';
import { productName } from '$lib/brand';
import { DISPLAY_LANGUAGES, formatDate, formatMonthYear, type LocalizationSettings } from '$lib/localization';

const fontName = 'NotoSansJP';
const colors = { ink: '#243449', muted: '#607086', border: '#dce4ec', blue: '#337ab7', green: '#168b75', orange: '#b85b16', pale: '#f4f7fa', white: '#ffffff' };
const clean = (value: string) => value.replace(/[\u2010-\u2015\u2212]/g, '-');
const pageHeight = 595.28;
const overviewWidth = 841.89;
const margin = 36;

/** Render from the complete API data, independently of screen widths or scroll positions. */
export function createAnalyticsPdf(data: AnalyticsData, settings: LocalizationSettings, fontBase64: string) {
	const period = data.period;
	if (!period || analyticsPeriodError(period.fromMonth, period.toMonth, data.referenceDate.slice(0, 7))) throw new Error('Invalid PDF period');
	const text = analyticsText(settings.displayLanguage);
	const locale = DISPLAY_LANGUAGES.find((item) => item.value === settings.displayLanguage)!.locale;
	const numbers = new Intl.NumberFormat(locale);
	const percentages = new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 1 });
	const count = (value: number) => numbers.format(value);
	const rate = (value: number | null) => value === null ? text.unavailable : percentages.format(value / 100);
	const month = (value: string) => formatMonthYear(Number(value.slice(0, 4)), Number(value.slice(5)) - 1, settings);
	const countLabels = data.annual.flatMap((item) => [count(item.headcount), count(item.hires), count(item.departures)]);
	// Reserve a readable amount of space for each year, including two count labels and a rate.
	const slotWidth = Math.max(92, ...countLabels.map((label) => label.length * 12 + 28), ...data.annual.map((item) => rate(item.turnoverRate).length * 6 + 24));
	const annualWidth = Math.max(overviewWidth, 200 + data.annual.length * slotWidth);
	// PDF UserUnit keeps very wide periods within the PDF coordinate limit without reducing physical font sizes.
	const unit = Math.max(1, Math.ceil(annualWidth / 14000));
	const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: [annualWidth / unit, pageHeight / unit], userUnit: unit, compress: true, putOnlyUsedFonts: true });
	doc.addFileToVFS('NotoSansJP-Regular.ttf', fontBase64);
	doc.addFont('NotoSansJP-Regular.ttf', fontName, 'normal');
	doc.setFont(fontName, 'normal');
	doc.setLanguage(settings.displayLanguage);
	doc.setProperties({ title: text.title, subject: `${period.fromMonth} - ${period.toMonth}`, creator: productName });
	const pageWidth = annualWidth;
	const measure = (value: string, size: number) => { doc.setFontSize(size / unit); return doc.getTextWidth(clean(value)) * unit; };
	function label(value: string, x: number, y: number, size = 10, color = colors.ink, align: 'left' | 'center' | 'right' = 'left') {
		doc.setFontSize(size / unit).setTextColor(color).text(clean(value), x / unit, y / unit, { align });
	}
	function paragraph(value: string, x: number, y: number, width: number, size = 9, color = colors.muted) {
		doc.setFontSize(size / unit);
		const lines = doc.splitTextToSize(clean(value), width / unit) as string[];
		for (const [index, line] of lines.entries()) label(line, x, y + index * size * 1.4, size, color);
		return lines.length * size * 1.4;
	}
	function line(x1: number, y1: number, x2: number, y2: number, color = colors.border, thickness = 0.7) {
		doc.setDrawColor(color).setLineWidth(thickness / unit).line(x1 / unit, y1 / unit, x2 / unit, y2 / unit);
	}
	function rectangle(x: number, y: number, width: number, height: number, fill: string, border?: string) {
		doc.setFillColor(fill);
		if (border) doc.setDrawColor(border).setLineWidth(0.7 / unit);
		doc.rect(x / unit, y / unit, width / unit, height / unit, border ? 'FD' : 'F');
	}
	function circle(x: number, y: number, radius: number, fill: string) {
		doc.setFillColor(fill).circle(x / unit, y / unit, radius / unit, 'F');
	}
	function header(section: string, page: number) {
		rectangle(0, 0, pageWidth, 6, colors.green);
		label(productName, margin, 34, 10, colors.muted);
		label(text.title, margin, 65, 24);
		label(section, margin, 87, 12, colors.green);
		label(`${text.asOf}: ${formatDate(data.referenceDate, settings)}`, pageWidth - margin, 34, 10, colors.muted, 'right');
		label(`${text.appliedPeriod}: ${month(period!.fromMonth)} - ${month(period!.toMonth)}`, pageWidth - margin, 54, 10, colors.muted, 'right');
		line(margin, 557, pageWidth - margin, 557);
		label(text.title, margin, 575, 9, colors.muted);
		label(`${text.pdfPage} ${page} / 3`, pageWidth - margin, 575, 9, colors.muted, 'right');
	}
	function nextPage(section: string, page: number) {
		doc.addPage([pageWidth / unit, pageHeight / unit], 'landscape');
		header(section, page);
	}
	function ticks(left: number, top: number, width: number, height: number, maximum: number, formatter: (value: number) => string, right = false) {
		for (let tick = 0; tick <= 4; tick++) {
			const y = top + height - tick / 4 * height;
			if (!right) line(left, y, left + width, y);
			label(formatter(maximum * tick / 4), right ? left + width + 12 : left - 12, y + 3, 10, colors.muted, right ? 'left' : 'right');
		}
	}
	const ceiling = (values: number[]) => Math.max(4, Math.ceil(Math.max(0, ...values) / 4) * 4);
	header(text.pdfSummary, 1);
	const metrics = [
		{ name: text.headcount, value: count(data.summary.headcount), note: text.current },
		{ name: text.hires, value: count(data.summary.hires), note: text.ytd },
		{ name: text.departures, value: count(data.summary.departures), note: text.ytd },
		{ name: text.turnover, value: rate(data.summary.turnoverRate), note: text.ytd }
	];
	const metricWidth = (pageWidth - 2 * margin - 3 * 12) / 4;
	for (const [index, metric] of metrics.entries()) {
		const x = margin + index * (metricWidth + 12);
		rectangle(x, 107, metricWidth, 99, colors.pale, colors.border);
		paragraph(metric.name, x + 12, 127, metricWidth - 24, 10);
		label(metric.value, x + 12, 164, Math.min(28, 28 * (metricWidth - 24) / Math.max(1, measure(metric.value, 28))));
		paragraph(metric.note, x + 12, 184, metricWidth - 24, 7.5);
	}
	const panelWidth = (pageWidth - 2 * margin - 18) / 2;
	const genderX = margin + panelWidth + 18;
	for (const [x, title, note] of [[margin, text.age, text.ageNote], [genderX, text.gender, text.genderNote]] as const) {
		rectangle(x, 224, panelWidth, 281, colors.white, colors.border);
		label(title, x + 14, 246, 13);
		paragraph(note, x + 14, 266, panelWidth - 28, 8);
	}
	if (!data.demographicTotal) {
		label(text.empty, margin + panelWidth / 2, 380, 11, colors.muted, 'center');
		label(text.empty, genderX + panelWidth / 2, 380, 11, colors.muted, 'center');
	} else {
		const left = margin + 45, top = 312, height = 153, width = panelWidth - 62;
		const maximum = ceiling(data.ageGroups.map((item) => item.count));
		ticks(left, top, width, height, maximum, count);
		const spacing = width / Math.max(1, data.ageGroups.length);
		for (const [index, group] of data.ageGroups.entries()) {
			const x = left + spacing * (index + 0.5), barHeight = group.count / maximum * height;
			rectangle(x - spacing * 0.28, top + height - barHeight, spacing * 0.56, barHeight, colors.blue);
			label(count(group.count), x, top + height - barHeight - 6, 9, colors.ink, 'center');
			label(text.ageLabels[group.key] ?? group.key, x, 484, 8, colors.muted, 'center');
		}
		const cx = genderX + 104, cy = 391, radius = 78;
		const genderColors = [colors.blue, colors.orange, '#8292a7', colors.green];
		let angle = -Math.PI / 2;
		for (const [index, group] of data.genders.entries()) {
			const fill = genderColors[index % genderColors.length];
			const share = group.count / data.demographicTotal;
			if (share > 0) {
				const next = angle + share * Math.PI * 2;
				doc.setFillColor(fill).moveTo(cx / unit, cy / unit);
				const segments = Math.max(2, Math.ceil(share * 180));
				for (let step = 0; step <= segments; step++) {
					const part = angle + (next - angle) * step / segments;
					doc.lineTo((cx + radius * Math.cos(part)) / unit, (cy + radius * Math.sin(part)) / unit);
				}
				doc.lineTo(cx / unit, cy / unit).fill();
				angle = next;
			}
			const y = 330 + index * 39;
			rectangle(genderX + 205, y - 8, 8, 8, fill);
			label(text.genderLabels[group.key] ?? group.key, genderX + 221, y, 9);
			label(`${count(group.count)} (${rate(share * 100)})`, genderX + 221, y + 16, 11);
		}
		circle(cx, cy, 35, colors.white);
		label(text.total, cx, cy - 5, 8, colors.muted, 'center');
		label(count(data.demographicTotal), cx, cy + 16, 23, colors.ink, 'center');
	}
	paragraph(text.limitation, margin, 524, pageWidth - 2 * margin, 8);
	nextPage(text.trend, 2);
	paragraph(text.trendNote, margin, 116, pageWidth - 2 * margin, 10);
	const left = 100, plotWidth = pageWidth - 200, top = 176, height = 291;
	const spacing = plotWidth / Math.max(1, data.annual.length);
	const x = (index: number) => left + spacing * (index + 0.5);
	const headcountMaximum = ceiling(data.annual.map((item) => item.headcount));
	const headcountY = (value: number) => top + height - value / headcountMaximum * height;
	ticks(left, top, plotWidth, height, headcountMaximum, count);
	label(text.employees, left, 153, 10, colors.muted);
	for (const [index, item] of data.annual.entries()) {
		if (index) line(x(index - 1), headcountY(data.annual[index - 1].headcount), x(index), headcountY(item.headcount), colors.green, 2);
	}
	for (const [index, item] of data.annual.entries()) {
		circle(x(index), headcountY(item.headcount), 3.5, colors.green);
		label(count(item.headcount), x(index), headcountY(item.headcount) - 11, 11, colors.ink, 'center');
		label(String(item.year), x(index), 490, 11, colors.muted, 'center');
	}
	label(`${text.appliedPeriod}: ${formatDate(period.startDate, settings)} - ${formatDate(period.endDate, settings)}`, margin, 530, 10, colors.muted);
	nextPage(text.rates, 3);
	let legendX = margin;
	for (const [name, fill] of [[text.hiresLabel, colors.blue], [text.departuresLabel, colors.orange], [text.turnoverLabel, colors.green]] as const) {
		rectangle(legendX, 109, 10, 10, fill);
		label(name, legendX + 17, 118, 10);
		legendX += measure(name, 10) + 44;
	}
	const turnoverTop = 197, turnoverHeight = 270;
	const countMaximum = ceiling(data.annual.flatMap((item) => [item.hires, item.departures]));
	const rateMaximum = ceiling(data.annual.map((item) => item.turnoverRate ?? 0));
	const countY = (value: number) => turnoverTop + turnoverHeight - value / countMaximum * turnoverHeight;
	const rateY = (value: number) => turnoverTop + turnoverHeight - value / rateMaximum * turnoverHeight;
	ticks(left, turnoverTop, plotWidth, turnoverHeight, countMaximum, count);
	ticks(left, turnoverTop, plotWidth, turnoverHeight, rateMaximum, rate, true);
	label(text.employees, left, 185, 10, colors.muted);
	label(text.percent, left + plotWidth, 185, 10, colors.muted, 'right');
	label(text.turnoverLabel, margin, 142, 9, colors.green);
	for (const [index, item] of data.annual.entries()) {
		// Keep rate values in a separate aligned row to avoid collisions with bar values.
		label(rate(item.turnoverRate), x(index), 163, 10, colors.green, 'center');
		const previous = data.annual[index - 1];
		if (previous?.turnoverRate !== null && previous?.turnoverRate !== undefined && item.turnoverRate !== null) line(x(index - 1), rateY(previous.turnoverRate), x(index), rateY(item.turnoverRate), colors.green, 2);
		if (item.turnoverRate !== null) circle(x(index), rateY(item.turnoverRate), 3, colors.green);
	}
	const barWidth = Math.min(24, spacing * 0.23);
	for (const [index, item] of data.annual.entries()) {
		for (const [value, offset, fill] of [[item.hires, -barWidth - 3, colors.blue], [item.departures, 3, colors.orange]] as const) {
			const barHeight = value / countMaximum * turnoverHeight;
			rectangle(x(index) + offset, countY(value), barWidth, barHeight, fill);
			const inside = barHeight >= 22 && measure(count(value), 9) < barWidth - 2;
			const y = countY(value) + (inside ? 15 : -7);
			if (!inside) rectangle(x(index) + offset + barWidth / 2 - measure(count(value), 9) / 2 - 2, y - 10, measure(count(value), 9) + 4, 13, colors.white);
			label(count(value), x(index) + offset + barWidth / 2, y, 9, inside ? colors.white : colors.ink, 'center');
		}
		label(String(item.year), x(index), 490, 11, colors.muted, 'center');
	}
	paragraph(text.formula, margin, 523, pageWidth - 2 * margin, 9);
	return { document: doc, fileName: `employee-analysis_${data.referenceDate}_${period.fromMonth}_${period.toMonth}.pdf` };
}
