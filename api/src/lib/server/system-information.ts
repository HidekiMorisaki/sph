import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

type RevisionHistoryEntry = {
	version: string;
	releasedAt: string;
	changes: string[];
};

type ReleaseMetadata = {
	name: string;
	notices: string[];
	repositoryUrl: string | null;
	revisionHistory: RevisionHistoryEntry[];
};

export type SystemInformation = ReleaseMetadata & {
	version: string;
};

const VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const projectFileCandidates = (name: string) => [resolve('/run/sph', name), resolve(process.cwd(), name), resolve(process.cwd(), '..', name)];

function readProjectFile(name: string): string {
	for (const path of projectFileCandidates(name)) {
		try {
			return readFileSync(path, 'utf8');
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
		}
	}
	throw new Error(`Required system information file is unavailable: ${name}`);
}

function parseMetadata(): ReleaseMetadata {
	const parsed = JSON.parse(readProjectFile('release-metadata.json')) as Partial<ReleaseMetadata>;
	if (typeof parsed.name !== 'string' || !parsed.name.trim()) throw new Error('System name is invalid.');
	if (!Array.isArray(parsed.notices) || parsed.notices.some((notice) => typeof notice !== 'string' || !notice.trim())) throw new Error('Version notices are invalid.');
	if (parsed.repositoryUrl !== null && typeof parsed.repositoryUrl !== 'string') throw new Error('Repository URL is invalid.');
	if (parsed.repositoryUrl) {
		const url = new URL(parsed.repositoryUrl);
		if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password) throw new Error('Repository URL is invalid.');
	}
	if (!Array.isArray(parsed.revisionHistory) || parsed.revisionHistory.some((entry) =>
		!entry || typeof entry !== 'object' || !VERSION_PATTERN.test(entry.version) || !/^\d{4}-\d{2}-\d{2}$/.test(entry.releasedAt) ||
		!Array.isArray(entry.changes) || !entry.changes.length || entry.changes.some((change) => typeof change !== 'string' || !change.trim())
	)) throw new Error('Revision history is invalid.');
	if (new Set(parsed.revisionHistory.map((entry) => entry.version)).size !== parsed.revisionHistory.length) throw new Error('Revision history versions must be unique.');
	return {
		name: parsed.name.trim(),
		notices: parsed.notices.map((notice) => notice.trim()),
		repositoryUrl: parsed.repositoryUrl?.trim() || null,
		revisionHistory: parsed.revisionHistory.map((entry) => ({
			version: entry.version,
			releasedAt: entry.releasedAt,
			changes: entry.changes.map((change) => change.trim())
		}))
	};
}

function loadSystemInformation(): SystemInformation {
	const version = readProjectFile('VERSION').trim();
	if (!VERSION_PATTERN.test(version)) throw new Error('Product version is invalid.');
	return { ...parseMetadata(), version };
}

export const systemInformation = Object.freeze(loadSystemInformation());
