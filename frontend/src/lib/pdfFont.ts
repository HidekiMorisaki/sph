import { base } from '$app/paths';

let fontPromise: Promise<string> | null = null;

export async function loadPdfFont(fetcher: typeof fetch): Promise<string> {
	if (!fontPromise) {
		fontPromise = (async () => {
			const response = await fetcher(`${base}/fonts/NotoSansJP-Regular.ttf`);
			if (!response.ok) throw new Error('Unable to load PDF font');
			const bytes = new Uint8Array(await response.arrayBuffer());
			let binary = '';
			for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
			return btoa(binary);
		})().catch((error) => { fontPromise = null; throw error; });
	}
	return fontPromise;
}
