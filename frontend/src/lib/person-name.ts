export type PersonNameOrder = 'givenFirst' | 'surnameFirst';

export type PersonNameParts = {
	firstName: string;
	middleName: string | null;
	lastName: string;
};

const HAN = /\p{Script=Han}/u;
const HIRAGANA = /\p{Script=Hiragana}/u;
const KATAKANA = /\p{Script=Katakana}/u;
const HANGUL = /\p{Script=Hangul}/u;
const LETTER = /\p{Letter}/u;

type InferredNameLocale = 'ja' | 'ko' | 'zh' | 'other' | 'unknown';

function characterLocale(character: string): InferredNameLocale | null {
	if (HAN.test(character)) return 'zh';
	if (HIRAGANA.test(character) || KATAKANA.test(character)) return 'ja';
	if (HANGUL.test(character)) return 'ko';
	if (LETTER.test(character)) return 'other';
	return null;
}

/**
 * Implements the CLDR name-script scan relevant to the application's name model:
 * inspect surname first, then given name, ignoring Common/Inherited/Unknown characters.
 */
export function inferPersonNameLocale(name: Pick<PersonNameParts, 'firstName' | 'lastName'>): InferredNameLocale {
	for (const value of [name.lastName, name.firstName]) {
		for (const character of value.normalize('NFC')) {
			const locale = characterLocale(character);
			if (locale) return locale;
		}
	}
	return 'unknown';
}

export function inferPersonNameOrder(
	name: Pick<PersonNameParts, 'firstName' | 'lastName'>,
	fallbackOrder: PersonNameOrder
): PersonNameOrder {
	const nameLocale = inferPersonNameLocale(name);
	if (nameLocale === 'ja' || nameLocale === 'ko' || nameLocale === 'zh') return 'surnameFirst';
	if (nameLocale === 'other') return 'givenFirst';
	return fallbackOrder;
}

export function formatPersonName(name: PersonNameParts, fallbackOrder: PersonNameOrder): string {
	const order = inferPersonNameOrder(name, fallbackOrder);
	const fields = order === 'surnameFirst'
		? [name.lastName, name.middleName, name.firstName]
		: [name.firstName, name.middleName, name.lastName];
	return fields.map((part) => part?.trim()).filter((part): part is string => Boolean(part)).join(' ');
}
