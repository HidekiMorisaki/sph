// Treat the return destination as untrusted input, even on the sign-in page.
export function safeLoginDestination(value: string | null): string | null {
	if (!value || !value.startsWith('/') || value.startsWith('//') || /[\\\u0000-\u0020\u007f]/.test(value)) return null;
	try {
		const url = new URL(value, 'https://local.invalid');
		const path = decodeURIComponent(url.pathname);
		if (url.origin !== 'https://local.invalid' || path.startsWith('//') || /[\\\u0000-\u0020\u007f]/.test(path)) return null;
		if (path === '/' || path === '/account-setup' || path === '/v1' || path.startsWith('/v1/')) return null;
		return url.pathname + url.search + url.hash;
	} catch {
		return null;
	}
}

export function loginUrl(location: Pick<Location, 'href'>): string {
	const url = new URL(location.href);
	const destination = safeLoginDestination(url.pathname + url.search + url.hash);
	return destination ? `/?returnTo=${encodeURIComponent(destination)}` : '/';
}
