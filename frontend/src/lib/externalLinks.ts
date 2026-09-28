import { get, writable } from 'svelte/store';
import type { ApiSuccess } from '$lib/api';

export type ExternalLink = {
	id: number;
	name: string;
	url: string;
	sortOrder: number;
	createdAt: string;
	updatedAt: string;
};

export const externalLinks = writable<ExternalLink[]>([]);
let loaded = false;
let loading: Promise<ExternalLink[]> | null = null;
let requestVersion = 0;

async function fetchAllExternalLinks(): Promise<ExternalLink[]> {
	const items: ExternalLink[] = [];
	let offset = 0;
	for (;;) {
		const response = await fetch(`/v1/external-links?sortBy=sortOrder&sortOrder=asc&offset=${offset}&limit=500`);
		if (!response.ok) throw new Error('Unable to load external links.');
		const payload = await response.json() as ApiSuccess<ExternalLink[]>;
		items.push(...payload.data);
		if (!payload.meta?.hasMore) return items;
		offset += payload.data.length;
	}
}

export async function loadExternalLinks(force = false): Promise<ExternalLink[]> {
	if (loaded && !force) return get(externalLinks);
	if (loading && !force) return loading;
	const version = ++requestVersion;
	loading = fetchAllExternalLinks()
		.then((items) => {
			if (version === requestVersion) { externalLinks.set(items); loaded = true; }
			return items;
		})
		.catch(() => {
			if (force && version === requestVersion) externalLinks.set([]);
			return get(externalLinks);
		})
		.finally(() => { if (version === requestVersion) loading = null; });
	return loading;
}

export function clearExternalLinks() {
	requestVersion += 1;
	loaded = false;
	loading = null;
	externalLinks.set([]);
}
