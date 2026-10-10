import { jsPDF } from 'jspdf';
import { analyticsPeriodError, analyticsText, genderPieSlices, visibleAgeGroups, type AnalyticsData } from '$lib/analytics';
import { productName } from '$lib/brand';
import { DISPLAY_LANGUAGES, formatDate, formatMonthYear, type LocalizationSettings } from '$lib/localization';
import { niceAxis } from '$lib/chartAxis';

const fontName = 'NotoSansJP';
const colors = { ink: '#243449', muted: '#607086', border: '#dce4ec', blue: '#337ab7', green: '#168b75', orange: '#b85b16', pale: '#f4f7fa', white: '#ffffff' };
const clean = (value: string) => value.replace(/[\u2010-\u2015\u2212]/g, '-');
const pageHeight = 765.28;
const overviewWidth = 841.89;
const margin = 36;
const repositoryUrl = 'https://github.com/HidekiMorisaki/sph';

/** Render from the complete API data, independently of screen widths or scroll positions. */
export function createAnalyticsPdf(data: AnalyticsData, settings: LocalizationSettings, fontBase64: string) {
	const period = data.period;
	if (!period || analyticsPeriodError(period.fromMonth, period.toMonth, data.referenceDate.slice(0, 7))) throw new Error('Invalid PDF period');
	const text = analyticsText(settings.displayLanguage);
	const locale = DISPLAY_LANGUAGES.find((item) => item.value === settings.displayLanguage)!.locale;
	const numbers = new Intl.NumberFormat(locale);
	const percentages = new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 1 });
	const ages = new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
	const count = (value: number) => numbers.format(value);
	const rate = (value: number | null) => value === null ? text.unavailable : percentages.format(value / 100);
	const age = (value: number | null) => value === null ? text.unavailable : `${ages.format(value)} ${text.averageAgeUnit}`;
	const month = (value: string) => formatMonthYear(Number(value.slice(0, 4)), Number(value.slice(5)) - 1, settings);
	const countLabels = data.annual.flatMap((item) => [count(item.headcount), count(item.hires), count(item.departures)]);
	// Reserve a readable amount of space for each year, including two count labels and a rate.
	const slotWidth = Math.max(92, ...countLabels.map((label) => label.length * 12 + 28), ...data.annual.map((item) => rate(item.turnoverRate).length * 6 + 24));
	const annualWidth = Math.max(overviewWidth, 200 + data.annual.length * slotWidth);
	// PDF UserUnit keeps very wide periods within the PDF coordinate limit without reducing physical font sizes.
	const unit = Math.max(1, Math.ceil(annualWidth / 14000));
	const doc = new jsPDF({ orientation: annualWidth >= pageHeight ? 'landscape' : 'portrait', unit: 'pt', format: [annualWidth / unit, pageHeight / unit], userUnit: unit, compress: true, putOnlyUsedFonts: true });
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
	function chartValueLabel(value: string, x: number, y: number) {
		doc.setFontSize(9 / unit).setDrawColor(colors.white).setLineWidth(2.5 / unit).setLineJoin('round')
			.text(clean(value), x / unit, y / unit, { align: 'center', renderingMode: 'stroke' });
		label(value, x, y, 9, colors.green, 'center');
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
	function header(section: string, page: number, height: number) {
		rectangle(0, 0, pageWidth, 6, colors.green);
		label(productName, margin, 34, 10, colors.muted);
		doc.link(margin / unit, 23 / unit, measure(productName, 10) / unit, 13 / unit, { url: repositoryUrl });
		if (section) label(section, margin, 65, 18, colors.green);
		label(`${text.asOf}: ${formatDate(data.referenceDate, settings)}`, pageWidth - margin, 34, 10, colors.muted, 'right');
		label(`${text.appliedPeriod}: ${month(period!.fromMonth)} - ${month(period!.toMonth)}`, pageWidth - margin, 54, 10, colors.muted, 'right');
		line(margin, height - 38, pageWidth - margin, height - 38);
		label(text.title, margin, height - 20, 9, colors.muted);
		label(`${text.pdfPage} ${page} / 3`, pageWidth - margin, height - 20, 9, colors.muted, 'right');
	}
	function nextPage(section: string, page: number, height: number) {
		doc.addPage([pageWidth / unit, height / unit], 'landscape');
		header(section, page, height);
	}
	function ticks(left: number, top: number, width: number, height: number, values: number[], formatter: (value: number) => string, right = false) {
		const maximum = values[values.length - 1];
		for (const value of values) {
			const y = top + height - value / maximum * height;
			if (!right) line(left, y, left + width, y);
			label(formatter(value), right ? left + width + 12 : left - 12, y + 3, 10, colors.muted, right ? 'left' : 'right');
		}
	}
	header(text.title, 1, pageHeight);
	const referenceAverageAge = data.annual.at(-1)?.averageAge ?? null;
	const metrics = [
		{ name: text.headcount, value: count(data.summary.headcount), unit: text.peopleUnit, note: text.current },
		{ name: text.hires, value: count(data.summary.hires), unit: text.peopleUnit, note: text.ytd },
		{ name: text.departures, value: count(data.summary.departures), unit: text.peopleUnit, note: text.ytd },
		{ name: text.referenceAverageAge, value: referenceAverageAge === null ? text.unavailable : ages.format(referenceAverageAge), unit: referenceAverageAge === null ? '' : text.averageAgeUnit, note: text.referenceAverageAgeNote },
		{ name: text.turnover, value: data.summary.turnoverRate === null ? text.unavailable : rate(data.summary.turnoverRate).replace(/\s*%$/, ''), unit: data.summary.turnoverRate === null ? '' : '%', note: text.ytd }
	];
	const metricWidth = (pageWidth - 2 * margin - (metrics.length - 1) * 12) / metrics.length;
	for (const [index, metric] of metrics.entries()) {
		const x = margin + index * (metricWidth + 12);
		rectangle(x, 82, metricWidth, 99, colors.pale, colors.border);
		paragraph(metric.name, x + 12, 102, metricWidth - 24, 10);
		const unitSize = 12;
		const unitGap = metric.unit ? 6 : 0;
		const valueSize = Math.min(28, 28 * (metricWidth - 24 - measure(metric.unit, unitSize) - unitGap) / Math.max(1, measure(metric.value, 28)));
		label(metric.value, x + 12, 139, valueSize);
		if (metric.unit) label(metric.unit, x + 12 + measure(metric.value, valueSize) + unitGap, 139, unitSize, colors.muted);
		paragraph(metric.note, x + 12, 159, metricWidth - 24, 7.5);
	}
	const left = 100, plotWidth = pageWidth - 200;
	const spacing = plotWidth / Math.max(1, data.annual.length);
	const x = (index: number) => left + spacing * (index + 0.5);
	label(text.rates, margin, 234, 16, colors.green);
	let legendX = margin;
	for (const [name, fill] of [[text.hiresLabel, colors.blue], [text.departuresLabel, colors.orange], [text.turnoverLabel, colors.green]] as const) {
		rectangle(legendX, 258, 10, 10, fill);
		label(name, legendX + 17, 267, 10);
		legendX += measure(name, 10) + 44;
	}
	const turnoverTop = 346, turnoverHeight = 270;
	const countAxis = niceAxis(data.annual.flatMap((item) => [item.hires, item.departures]));
	const rateAxis = niceAxis(data.annual.map((item) => item.turnoverRate ?? 0), 0.1);
	const countMaximum = countAxis.maximum;
	const rateMaximum = rateAxis.maximum;
	const countY = (value: number) => turnoverTop + turnoverHeight - value / countMaximum * turnoverHeight;
	const rateY = (value: number) => turnoverTop + turnoverHeight - value / rateMaximum * turnoverHeight;
	ticks(left, turnoverTop, plotWidth, turnoverHeight, countAxis.ticks, count);
	ticks(left, turnoverTop, plotWidth, turnoverHeight, rateAxis.ticks, rate, true);
	label(text.employees, left, 334, 10, colors.muted);
	label(text.percent, left + plotWidth, 334, 10, colors.muted, 'right');
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
		label(String(item.year), x(index), 639, 11, colors.muted, 'center');
	}
	for (const [index, item] of data.annual.entries()) {
		const previous = data.annual[index - 1];
		if (previous?.turnoverRate !== null && previous?.turnoverRate !== undefined && item.turnoverRate !== null) line(x(index - 1), rateY(previous.turnoverRate), x(index), rateY(item.turnoverRate), colors.green, 2);
		if (item.turnoverRate !== null) {
			circle(x(index), rateY(item.turnoverRate), 3, colors.green);
			const value = rate(item.turnoverRate);
			const labelY = rateY(item.turnoverRate) - 12 < turnoverTop + 12 ? rateY(item.turnoverRate) + 17 : rateY(item.turnoverRate) - 12;
			chartValueLabel(value, x(index), labelY);
		} else label(text.unavailable, x(index), turnoverTop + 16, 9, colors.muted, 'center');
	}
	paragraph(text.formula, margin, 672, pageWidth - 2 * margin, 9);
	nextPage(text.headcountAgeTrend, 2, pageHeight);
	paragraph(text.headcountAgeNote, margin, 116, pageWidth - 2 * margin, 10);
	rectangle(margin, 149, 10, 10, colors.blue);
	label(text.employees, margin + 17, 158, 10);
	const ageLegendX = margin + measure(text.employees, 10) + 44;
	line(ageLegendX, 154, ageLegendX + 19, 154, colors.green, 2);
	label(text.averageAge, ageLegendX + 25, 158, 10);
	const top = 196, height = 440;
	const headcountAxis = niceAxis(data.annual.map((item) => item.headcount));
	const ageAxis = niceAxis(data.annual.map((item) => item.averageAge ?? 0));
	const headcountMaximum = headcountAxis.maximum;
	const ageMaximum = ageAxis.maximum;
	const headcountY = (value: number) => top + height - value / headcountMaximum * height;
	const ageY = (value: number) => top + height - value / ageMaximum * height;
	ticks(left, top, plotWidth, height, headcountAxis.ticks, count);
	ticks(left, top, plotWidth, height, ageAxis.ticks, count, true);
	label(text.employees, left, 184, 10, colors.muted);
	label(text.averageAgeAxis, left + plotWidth, 184, 10, colors.muted, 'right');
	const headcountBarWidth = Math.min(34, spacing * 0.45);
	for (const [index, item] of data.annual.entries()) {
		const barHeight = item.headcount / headcountMaximum * height;
		rectangle(x(index) - headcountBarWidth / 2, headcountY(item.headcount), headcountBarWidth, barHeight, colors.blue);
		if (item.headcount > 0) {
			const inside = barHeight >= 24 && measure(count(item.headcount), 9) < headcountBarWidth - 2;
			label(count(item.headcount), x(index), headcountY(item.headcount) + (inside ? 15 : -7), 9, inside ? colors.white : colors.ink, 'center');
		}
	}
	for (const [index, item] of data.annual.entries()) {
		const previous = data.annual[index - 1];
		if (previous?.averageAge !== null && previous?.averageAge !== undefined && item.averageAge !== null) line(x(index - 1), ageY(previous.averageAge), x(index), ageY(item.averageAge), colors.green, 2);
		if (item.averageAge !== null) {
			circle(x(index), ageY(item.averageAge), 3.5, colors.green);
			const preferredY = ageY(item.averageAge) - 11;
			const barHeight = item.headcount / headcountMaximum * height;
			const inside = barHeight >= 24 && measure(count(item.headcount), 9) < headcountBarWidth - 2;
			const countLabelY = headcountY(item.headcount) + (inside ? 15 : -7);
			const valueY = item.headcount > 0 && Math.abs(preferredY - countLabelY) < 15 ? ageY(item.averageAge) + 18 : preferredY;
			chartValueLabel(age(item.averageAge), x(index), valueY);
		} else label(text.unavailable, x(index), top + 42, 9, colors.muted, 'center');
		label(String(item.year), x(index), 660, 11, colors.muted, 'center');
	}
	nextPage(`${text.age}${settings.displayLanguage === 'ja' ? '・' : ' / '}${text.gender}`, 3, pageHeight);
	const panelWidth = (pageWidth - 2 * margin - 18) / 2;
	const genderX = margin + panelWidth + 18;
	for (const [x, title, note] of [[margin, text.age, text.ageNote], [genderX, text.gender, text.genderNote]] as const) {
		rectangle(x, 124, panelWidth, 551, colors.white, colors.border);
		label(title, x + 14, 146, 13);
		paragraph(note, x + 14, 166, panelWidth - 28, 8);
	}
	if (!data.demographicTotal) {
		label(text.empty, margin + panelWidth / 2, 400, 11, colors.muted, 'center');
		label(text.empty, genderX + panelWidth / 2, 400, 11, colors.muted, 'center');
	} else {
		const left = margin + 45, top = 212, height = 390, width = panelWidth - 62;
		const ageGroups = visibleAgeGroups(data.ageGroups);
		const axis = niceAxis(ageGroups.map((item) => item.count));
		const maximum = axis.maximum;
		ticks(left, top, width, height, axis.ticks, count);
		const spacing = width / Math.max(1, ageGroups.length);
		for (const [index, group] of ageGroups.entries()) {
			const x = left + spacing * (index + 0.5), barHeight = group.count / maximum * height;
			rectangle(x - spacing * 0.28, top + height - barHeight, spacing * 0.56, barHeight, colors.blue);
			label(count(group.count), x, top + height - barHeight - 6, 9, colors.ink, 'center');
			label(text.ageLabels[group.key] ?? group.key, x, 625, 8, colors.muted, 'center');
		}
		const cx = genderX + panelWidth / 2, cy = 395, radius = Math.min(125, (panelWidth - 80) / 2);
		const pieScale = radius / 110;
		const genderSlices = genderPieSlices(data.genders.filter((group) => group.key !== 'other'), data.demographicTotal);
		let angle = -Math.PI / 2;
		for (const slice of genderSlices.filter((item) => item.count > 0)) {
			if (slice.share === 1) circle(cx, cy, radius, slice.color);
			else {
				const next = angle + slice.share * Math.PI * 2;
				doc.setFillColor(slice.color).moveTo(cx / unit, cy / unit);
				const segments = Math.max(2, Math.ceil(slice.share * 180));
				for (let step = 0; step <= segments; step++) {
					const part = angle + (next - angle) * step / segments;
					doc.lineTo((cx + radius * Math.cos(part)) / unit, (cy + radius * Math.sin(part)) / unit);
				}
				doc.lineTo(cx / unit, cy / unit).fill();
			}
			angle += slice.share * Math.PI * 2;
		}
		circle(cx, cy, radius * 48 / 110, colors.white);
		label(text.total, cx, cy - 5, 8, colors.muted, 'center');
		label(count(data.demographicTotal), cx, cy + 16, 23, colors.ink, 'center');
		for (const slice of genderSlices.filter((item) => item.count > 0)) {
			const labelX = cx + (slice.labelX - 130) * pieScale;
			const labelY = cy + (slice.labelY - 130) * pieScale;
			const textColor = slice.outside ? colors.ink : colors.white;
			const align = slice.outside ? slice.right ? 'left' : 'right' : 'center';
			if (slice.outside) line(cx + (slice.edgeX - 130) * pieScale, cy + (slice.edgeY - 130) * pieScale, labelX, labelY, colors.muted);
			label(count(slice.count), labelX, labelY - 3, 10, textColor, align);
			label(rate(slice.share * 100), labelX, labelY + 11, 9, textColor, align);
		}
		const legendItems = genderSlices.map((slice) => {
			const name = text.genderLabels[slice.key] ?? slice.key;
			return { slice, name, width: 14 + measure(name, 9) };
		});
		const legendGap = 14;
		const legendWidth = legendItems.reduce((total, item) => total + item.width, 0) + Math.max(0, legendItems.length - 1) * legendGap;
		let legendX = genderX + (panelWidth - legendWidth) / 2;
		for (const { slice, name, width } of legendItems) {
			rectangle(legendX, 574, 8, 8, slice.color);
			label(name, legendX + 14, 582, 9);
			legendX += width + legendGap;
		}
	}
	return { document: doc, fileName: `employee-analysis_${data.referenceDate}_${period.fromMonth}_${period.toMonth}.pdf` };
}
