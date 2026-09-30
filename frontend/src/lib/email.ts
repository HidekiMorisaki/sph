function encodeEmailAddress(email: string): string {
	return email.split('@').map((part) => encodeURIComponent(part)).join('@');
}

export function mailtoHref(email: string, subject?: string): string {
	const address = encodeEmailAddress(email);
	return subject ? `mailto:${address}?subject=${encodeURIComponent(subject)}` : `mailto:${address}`;
}
