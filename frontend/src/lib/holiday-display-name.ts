import type { DisplayLanguage } from '$lib/localization';

// Keep the imported Japanese name so the display language can change without rewriting holiday data.
const japanNamesInEnglish: Record<string, string> = {
	'元日': "New Year's Day",
	'成人の日': 'Coming of Age Day',
	'建国記念の日': 'National Foundation Day',
	'天皇誕生日': "Emperor's Birthday",
	'春分の日': 'Vernal Equinox Day',
	'昭和の日': 'Showa Day',
	'憲法記念日': 'Constitution Memorial Day',
	'みどりの日': 'Greenery Day',
	'こどもの日': "Children's Day",
	'海の日': 'Marine Day',
	'山の日': 'Mountain Day',
	'敬老の日': 'Respect for the Aged Day',
	'秋分の日': 'Autumnal Equinox Day',
	'スポーツの日': 'Sports Day',
	'体育の日': 'Health and Sports Day',
	'体育の日（スポーツの日）': 'Health and Sports Day (Sports Day)',
	'文化の日': 'Culture Day',
	'勤労感謝の日': 'Labor Thanksgiving Day',
	'休日': 'Substitute holiday',
	'休日（祝日扱い）': 'Holiday (treated as a national holiday)',
	'結婚の儀': 'Imperial wedding ceremony',
	'即位礼正殿の儀': 'Enthronement ceremony',
	'大喪の礼': 'Imperial funeral ceremony'
};

export function holidayDisplayName(name: string, language: DisplayLanguage): string {
	return language === 'en' ? japanNamesInEnglish[name] ?? name : name;
}
