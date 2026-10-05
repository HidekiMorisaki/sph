export function allowsSensitiveRequest(url: URL, request: Request): boolean {
	if (url.protocol === 'https:') return true;
	if (url.protocol !== 'http:' || url.hostname !== 'localhost') return false;

	const host = request.headers.get('host');
	const forwardedHost = request.headers.get('x-forwarded-host');
	return host?.toLowerCase() === url.host.toLowerCase()
		&& (forwardedHost === null || forwardedHost.toLowerCase() === url.host.toLowerCase());
}
