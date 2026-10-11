export type AddressCountry = 'JP' | 'US';

export function addressCountry(value: unknown): value is AddressCountry {
	return value === 'JP' || value === 'US';
}

export function validPostalCode(country: AddressCountry, value: string): boolean {
	return country === 'JP' ? /^\d{3}-?\d{4}$/.test(value) : /^\d{5}(?:-\d{4})?$/.test(value);
}

export function postalLookupCode(country: AddressCountry, value: string): string {
	return country === 'JP' ? value.replace('-', '') : value.slice(0, 5);
}
