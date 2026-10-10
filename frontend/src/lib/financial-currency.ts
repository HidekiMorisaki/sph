import type { MessageLanguage } from './locale-messages';

export type FinancialCurrency = 'JPY' | 'USD';

export function formatFinancialAmount(value: string | null, currency: FinancialCurrency, language: MessageLanguage): string | null {
	if (value === null) return null;
	const negative = value.startsWith('-');
	const [whole, fraction = ''] = (negative ? value.slice(1) : value).split('.');
	const grouped = new Intl.NumberFormat(language === 'ja' ? 'ja-JP' : 'en-US').format(BigInt(whole));
	const formatted = currency === 'JPY' ? `¥${grouped}` : `$${grouped}.${fraction.padEnd(2, '0').slice(0, 2)}`;
	return negative ? `−${formatted}` : formatted;
}
