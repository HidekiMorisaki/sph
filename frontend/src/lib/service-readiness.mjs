/**
 * @param {string | URL} url
 * @param {typeof fetch} [fetcher]
 * @param {AbortSignal} [signal]
 */
export async function checkServiceReadiness(url, fetcher = fetch, signal) {
	try {
		const response = await fetcher(url, {
			cache: 'no-store', credentials: 'omit', redirect: 'error',
			signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(4000)]) : AbortSignal.timeout(4000)
		});
		if (response.status !== 200 || !response.headers.get('content-type')?.includes('application/json')) {
			await response.body?.cancel();
			return false;
		}
		const body = await response.json();
		return body?.responseCode === 200 && body?.status === 'success' && body?.data?.ready === true;
	} catch {
		return false;
	}
}
