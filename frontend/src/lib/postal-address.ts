export type AddressCountry = 'JP' | 'US';
export type PostalCandidate = { prefecture: string; city: string; streetAddress: string };

export function validPostalCode(country: AddressCountry, value: string): boolean {
	return country === 'JP' ? /^\d{3}-?\d{4}$/.test(value.trim()) : /^\d{5}(?:-\d{4})?$/.test(value.trim());
}

export function addressLabels(country: AddressCountry, language: 'ja' | 'en') {
	return {
		country: language === 'ja' ? '国' : 'Country',
		postal: country === 'US' ? 'ZIP Code' : language === 'ja' ? '郵便番号' : 'Postal code',
		region: country === 'US' ? language === 'ja' ? '州' : 'State' : language === 'ja' ? '都道府県' : 'Prefecture',
		postalExample: country === 'US' ? '12345 or 12345-6789' : '100-0001',
		regionExample: country === 'US' ? 'California' : language === 'ja' ? '東京都' : 'Tokyo',
		postalInvalid: language === 'ja' ? country === 'US' ? '5桁またはZIP+4の郵便番号を入力してください。' : '7桁の郵便番号を入力してください。' : country === 'US' ? 'Enter a 5-digit ZIP Code or ZIP+4.' : 'Enter a 7-digit Japanese postal code.'
	};
}
