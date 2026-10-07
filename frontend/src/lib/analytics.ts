import { localeMessages } from '$lib/locale-messages';
import type { DisplayLanguage } from '$lib/localization';

export type AnalyticsData = {
	referenceDate: string;
	fromYear: number;
	period: { fromMonth: string; toMonth: string; startDate: string; endDate: string } | null;
	demographicTotal: number;
	summary: { headcount: number; hires: number; departures: number; turnoverRate: number | null };
	ageGroups: { key: string; count: number }[];
	genders: { key: string; count: number }[];
	annual: { year: number; startDate: string; endDate: string; startingHeadcount: number; headcount: number; averageAge: number | null; averageAgeCount: number; hires: number; departures: number; turnoverRate: number | null }[];
};

type AnalyticsText = Omit<typeof localeMessages.en.analytics, 'ageLabels' | 'genderLabels'> & {
	ageLabels: Record<string, string>;
	genderLabels: Record<string, string>;
};

export function analyticsText(language: DisplayLanguage): AnalyticsText {
	return localeMessages[language].analytics;
}

export function analyticsPeriodError(fromMonth: string, toMonth: string, maxMonth: string): 'invalidMonth' | 'reversedPeriod' | 'futureMonth' | null {
	const monthPattern = /^(?!0000)\d{4}-(0[1-9]|1[0-2])$/;
	if (!monthPattern.test(fromMonth) || !monthPattern.test(toMonth)) return 'invalidMonth';
	if (fromMonth > toMonth) return 'reversedPeriod';
	if (toMonth > maxMonth) return 'futureMonth';
	return null;
}

export function visibleAgeGroups(groups: AnalyticsData['ageGroups']): AnalyticsData['ageGroups'] {
	return groups.filter((group) => group.key !== 'unknown' || group.count > 0);
}

export function genderPieSlices(genders: AnalyticsData['genders'], total: number) {
	if (!total) return [];
	const colors = ['#a23e74', '#337ab7', '#64748b', '#087f6e'];
	let angle = -Math.PI / 2;
	const slices = genders.map((group, index) => {
		const share = group.count / total;
		const start = angle;
		angle += share * Math.PI * 2;
		const middle = start + share * Math.PI;
		const right = Math.cos(middle) >= 0;
		return {
			...group, share, color: colors[index],
			path: `M130,130 L${130 + 110 * Math.cos(start)},${130 + 110 * Math.sin(start)} A110,110 0 ${share > 0.5 ? 1 : 0},1 ${130 + 110 * Math.cos(angle)},${130 + 110 * Math.sin(angle)} Z`,
			outside: share < 0.12, right,
			labelX: 130 + 80 * Math.cos(middle), labelY: 130 + 80 * Math.sin(middle),
			edgeX: 130 + 112 * Math.cos(middle), edgeY: 130 + 112 * Math.sin(middle)
		};
	});
	for (const right of [false, true]) {
		const labels = slices.filter((slice) => slice.count && slice.outside && slice.right === right).sort((a, b) => a.labelY - b.labelY);
		let previousY = 10;
		for (const slice of labels) {
			slice.labelX = right ? 253 : 7;
			slice.labelY = Math.max(previousY + 30, Math.min(230, slice.labelY));
			previousY = slice.labelY;
		}
	}
	return slices;
}
