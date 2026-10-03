import { base } from '$app/paths';
import { requestAnalytics } from '$lib/analyticsRequests';
import { createAnalyticsPdf } from '$lib/analyticsPdf';
import type { LocalizationSettings } from '$lib/localization';

export type AnalyticsPdfSelection = { referenceDate: string; fromMonth: string; toMonth: string };
let fontPromise: Promise<string> | null = null;

async function loadFont(fetcher: typeof fetch) {
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

export async function prepareAnalyticsPdfDownload(selection: AnalyticsPdfSelection, settings: LocalizationSettings, fetcher: typeof fetch = fetch) {
	const font = await loadFont(fetcher);
	// Use the exact same server-side access check as the page, on every download.
	// A cached screen or font must never substitute for a fresh authorized API response.
	const data = await requestAnalytics(selection, fetcher);
	if (data.period?.fromMonth !== selection.fromMonth || data.period?.toMonth !== selection.toMonth) throw new Error('PDF period mismatch');
	return { ...createAnalyticsPdf(data, settings, font), data };
}
