import { requireAuthenticatedApi } from '$lib/server/api/admin';
import { addressCountry, postalLookupCode, validPostalCode } from '$lib/server/api/postal-address';
import { failure, success } from '$lib/server/api/response';

type PostalCandidate = { prefecture: string; city: string; streetAddress: string };

export async function GET({ locals, url, fetch }: import('./$types').RequestEvent) {
	requireAuthenticatedApi(locals.user);
	const countryCode = url.searchParams.get('countryCode');
	const postalCode = url.searchParams.get('postalCode')?.trim() ?? '';
	if (!addressCountry(countryCode) || !validPostalCode(countryCode, postalCode)) {
		return failure(400, 'VALIDATION_ERROR', 'Enter a valid country and postal code.');
	}
	const code = postalLookupCode(countryCode, postalCode);
	const endpoint = countryCode === 'JP'
		? `https://zipcloud.ibsnet.co.jp/api/search?zipcode=${code}`
		: `https://api.zippopotam.us/us/${code}`;
	try {
		const response = await fetch(endpoint, { signal: AbortSignal.timeout(5000), headers: { accept: 'application/json' } });
		if (countryCode === 'US' && response.status === 404) return noStore(success([] as PostalCandidate[]));
		if (!response.ok) return noStore(failure(503, 'POSTAL_LOOKUP_UNAVAILABLE', 'Postal lookup is temporarily unavailable.'));
		const body = await response.text();
		if (body.length > 100_000) throw new Error('Postal response too large');
		const data = JSON.parse(body) as Record<string, unknown>;
		let candidates: PostalCandidate[];
		if (countryCode === 'JP') {
			if (data.status !== 200) throw new Error('Postal provider error');
			if (data.results === null) candidates = [];
			else if (Array.isArray(data.results)) candidates = data.results.map((item: Record<string, unknown>) => ({ prefecture: String(item.address1 ?? ''), city: String(item.address2 ?? ''), streetAddress: String(item.address3 ?? '') }));
			else throw new Error('Invalid postal response');
		} else {
			if (!Array.isArray(data.places)) throw new Error('Invalid postal response');
			candidates = data.places.map((item: Record<string, unknown>) => ({ prefecture: String(item.state ?? ''), city: String(item['place name'] ?? ''), streetAddress: '' }));
		}
		if (candidates.some((item) => !item.prefecture || !item.city || item.prefecture.length > 64 || item.city.length > 128 || item.streetAddress.length > 255)) throw new Error('Invalid postal candidate');
		return noStore(success(candidates.slice(0, 20)));
	} catch {
		return noStore(failure(503, 'POSTAL_LOOKUP_UNAVAILABLE', 'Postal lookup is temporarily unavailable.'));
	}
}

function noStore(response: Response): Response {
	response.headers.set('Cache-Control', 'no-store');
	return response;
}
