export function normalizeIsbn(value: string): string | null {
	const isbn = value.replace(/[\s-]/g, '').toUpperCase();
	if (/^\d{9}[\dX]$/.test(isbn)) {
		const sum = [...isbn].reduce((total, char, index) => total + (char === 'X' ? 10 : Number(char)) * (10 - index), 0);
		return sum % 11 === 0 ? isbn : null;
	}
	if (/^(978|979)\d{10}$/.test(isbn)) {
		const sum = [...isbn].reduce((total, char, index) => total + Number(char) * (index % 2 === 0 ? 1 : 3), 0);
		return sum % 10 === 0 ? isbn : null;
	}
	return null;
}

export function equivalentIsbns(isbn: string): string[] {
	if (isbn.length === 10) {
		const digits = `978${isbn.slice(0, 9)}`;
		const sum = [...digits].reduce((total, char, index) => total + Number(char) * (index % 2 === 0 ? 1 : 3), 0);
		return [isbn, `${digits}${(10 - sum % 10) % 10}`];
	}
	if (!isbn.startsWith('978')) return [isbn];
	const digits = isbn.slice(3, 12);
	const sum = [...digits].reduce((total, char, index) => total + Number(char) * (10 - index), 0);
	const check = (11 - sum % 11) % 11;
	return [isbn, `${digits}${check === 10 ? 'X' : check}`];
}

/** The stored identity is always ISBN-13, regardless of input notation. */
export function canonicalIsbn(value: string): string | null {
 const normalized = normalizeIsbn(value);
 return normalized ? equivalentIsbns(normalized).find(isbn => isbn.length === 13) ?? null : null;
}
