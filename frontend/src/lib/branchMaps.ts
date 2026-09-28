export type BranchAddress = {
	postalCode: string | null;
	prefecture: string | null;
	city: string | null;
	streetAddress: string | null;
	buildingName: string | null;
};

const GOOGLE_MAPS_BASE_URL = 'https://www.google.com/maps/search/';
const GOOGLE_MAPS_URL_LIMIT = 2048;

function mapsSearchUrl(query: string) {
	const url = new URL(GOOGLE_MAPS_BASE_URL);
	url.searchParams.set('api', '1');
	url.searchParams.set('query', query);
	return url.toString();
}

export function googleMapsHref(branch: BranchAddress): string | null {
	const query = [branch.postalCode, branch.prefecture, branch.city, branch.streetAddress, branch.buildingName]
		.map((value) => value?.trim() ?? '')
		.filter(Boolean)
		.join(' ');
	if (!query) return null;

	const complete = mapsSearchUrl(query);
	if (complete.length <= GOOGLE_MAPS_URL_LIMIT) return complete;

	const characters = Array.from(query);
	let low = 0;
	let high = characters.length;
	while (low < high) {
		const middle = Math.ceil((low + high) / 2);
		if (mapsSearchUrl(characters.slice(0, middle).join('').trim()).length <= GOOGLE_MAPS_URL_LIMIT) low = middle;
		else high = middle - 1;
	}
	const shortened = characters.slice(0, low).join('').trim();
	return shortened ? mapsSearchUrl(shortened) : null;
}
