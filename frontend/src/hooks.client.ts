import type { ClientInit, HandleClientError } from '@sveltejs/kit';

type GuardedFetch = typeof window.fetch & { sessionRedirectGuard?: true };

const AUTHENTICATION_FAILURE_ENDPOINTS = new Set([
	'/v1/auth/login',
	'/v1/auth/account-setup'
]);

export const handleError: HandleClientError = ({ error }) => {
	console.error(error);
};

function requestUrl(input: RequestInfo | URL, response: Response) {
	const value = response.url || (input instanceof Request ? input.url : input.toString());
	try {
		return new URL(value, window.location.href);
	} catch {
		return null;
	}
}

export const init: ClientInit = () => {
	const currentFetch = window.fetch as GuardedFetch;
	if (currentFetch.sessionRedirectGuard) return;

	const originalFetch = currentFetch.bind(window);
	let redirecting = false;
	const guardedFetch: GuardedFetch = async (input, requestInit) => {
		if (redirecting) return new Promise<Response>(() => {});
		const response = await originalFetch(input, requestInit);
		if (response.status !== 401 || window.location.pathname === '/') return response;

		const url = requestUrl(input, response);
		if (!url || url.origin !== window.location.origin || !url.pathname.startsWith('/v1/') || AUTHENTICATION_FAILURE_ENDPOINTS.has(url.pathname)) return response;

		redirecting = true;
		window.location.replace('/');
		return new Promise<Response>(() => {});
	};
	guardedFetch.sessionRedirectGuard = true;
	window.fetch = guardedFetch;
};
