const LATEST_RELEASE_URL = 'https://api.github.com/repos/HidekiMorisaki/sph/releases/latest';
const RELEASE_PAGE_URL = 'https://github.com/HidekiMorisaki/sph/releases/tag/';
const STABLE_TAG_PATTERN = /^v?((0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*))$/;
const INSTALLED_VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const SUCCESS_CACHE_MS = 60 * 60 * 1000;
const FAILURE_CACHE_MS = 5 * 60 * 1000;

export type AvailableUpdate = { version: string; url: string };
export type ReleaseCheck =
	| { releaseStatus: 'update_available'; availableUpdate: AvailableUpdate }
	| { releaseStatus: 'latest' | 'unavailable'; availableUpdate: null };

export function parsePublishedRelease(value: unknown): AvailableUpdate | null {
	if (!value || typeof value !== 'object') return null;
	const release = value as Record<string, unknown>;
	if (release.draft !== false || release.prerelease !== false || typeof release.tag_name !== 'string' || typeof release.published_at !== 'string') return null;
	const match = STABLE_TAG_PATTERN.exec(release.tag_name);
	if (!match) return null;
	return { version: match[1], url: `${RELEASE_PAGE_URL}${encodeURIComponent(release.tag_name)}` };
}

export function isNewerVersion(candidate: string, installed: string): boolean {
	const newer = STABLE_TAG_PATTERN.exec(candidate);
	const current = INSTALLED_VERSION_PATTERN.exec(installed);
	if (!newer || !current) return false;
	for (let index = 2; index <= 4; index++) {
		const difference = BigInt(newer[index]) - BigInt(current[index - 1]);
		if (difference !== 0n) return difference > 0n;
	}
	return Boolean(current[4]);
}

export function createLatestReleaseChecker(fetcher: typeof fetch = fetch, now: () => number = Date.now) {
	let cached: { release: AvailableUpdate | null; expiresAt: number } | null = null;
	let pending: Promise<AvailableUpdate | null> | null = null;

	async function latestRelease(): Promise<AvailableUpdate | null> {
		if (cached && cached.expiresAt > now()) return cached.release;
		if (!pending) {
			pending = (async () => {
				let release: AvailableUpdate | null = null;
				try {
					const response = await fetcher(LATEST_RELEASE_URL, {
						headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'sph-release-check', 'X-GitHub-Api-Version': '2026-03-10' },
						redirect: 'error',
						signal: AbortSignal.timeout(3000)
					});
					if (response.ok) release = parsePublishedRelease(await response.json());
				} catch {
					// Release notifications must not prevent the system information page from loading.
				}
				cached = { release, expiresAt: now() + (release ? SUCCESS_CACHE_MS : FAILURE_CACHE_MS) };
				return release;
			})().finally(() => { pending = null; });
		}
		return pending;
	}

	return async (installedVersion: string): Promise<ReleaseCheck> => {
		const release = await latestRelease();
		if (!release) return { releaseStatus: 'unavailable', availableUpdate: null };
		if (isNewerVersion(release.version, installedVersion)) return { releaseStatus: 'update_available', availableUpdate: release };
		return { releaseStatus: 'latest', availableUpdate: null };
	};
}

export const getReleaseCheck = createLatestReleaseChecker((input, init) => fetch(input, init));
