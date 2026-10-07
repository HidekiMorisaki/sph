import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

type ChangeGroups = {
	newFeatures: string[];
	improvements: string[];
	bugFixes: string[];
};

type RevisionHistoryEntry = {
	version: string;
	releasedAt: string | null;
	changeIds?: string[];
	changeGroups?: ChangeGroups;
};

type ReleaseMetadata = {
	name: string;
	noticeIds: string[];
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

function validMessageIds(value: unknown, allowEmpty = true): value is string[] {
	return Array.isArray(value) && (allowEmpty || value.length > 0) && value.every((id) => typeof id === 'string' && /^[a-z][a-z0-9_]*$/.test(id)) && new Set(value).size === value.length;
}

const changeGroupNames = ['newFeatures', 'improvements', 'bugFixes'] as const;

function usesChangeGroups(version: string): boolean {
	const [major, minor] = version.split('.').map(Number);
	return major > 0 || minor >= 3;
}

function validChangeGroups(value: unknown): value is ChangeGroups {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
	const groups = value as Record<string, unknown>;
	if (Object.keys(groups).length !== changeGroupNames.length || changeGroupNames.some((name) => !validMessageIds(groups[name]))) return false;
	const ids = changeGroupNames.flatMap((name) => groups[name] as string[]);
	return ids.length > 0 && new Set(ids).size === ids.length;
}

export function parseReleaseMetadata(value: unknown): ReleaseMetadata {
	if (!value || typeof value !== 'object') throw new Error('Release metadata is invalid.');
	const parsed = value as Partial<ReleaseMetadata>;
	if (typeof parsed.name !== 'string' || !parsed.name.trim()) throw new Error('System name is invalid.');
	if (!validMessageIds(parsed.noticeIds)) throw new Error('Version notice IDs are invalid.');
	if (parsed.repositoryUrl !== null && typeof parsed.repositoryUrl !== 'string') throw new Error('Repository URL is invalid.');
	if (parsed.repositoryUrl) {
		const url = new URL(parsed.repositoryUrl);
		if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password) throw new Error('Repository URL is invalid.');
	}
	if (!Array.isArray(parsed.revisionHistory) || !parsed.revisionHistory.length || parsed.revisionHistory.some((entry, index) =>
		!entry || typeof entry !== 'object' || typeof entry.version !== 'string' || !VERSION_PATTERN.test(entry.version) ||
		!(entry.releasedAt === null ? index === 0 : typeof entry.releasedAt === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(entry.releasedAt)) ||
		(usesChangeGroups(entry.version)
			? entry.changeIds !== undefined || !validChangeGroups(entry.changeGroups)
			: entry.changeGroups !== undefined || !validMessageIds(entry.changeIds, false))
	)) throw new Error('Revision history is invalid.');
	if (new Set(parsed.revisionHistory.map((entry) => entry.version)).size !== parsed.revisionHistory.length) throw new Error('Revision history versions must be unique.');
	return {
		name: parsed.name.trim(),
		noticeIds: [...parsed.noticeIds],
		repositoryUrl: parsed.repositoryUrl?.trim() || null,
		revisionHistory: parsed.revisionHistory.map((entry) => ({
			version: entry.version,
			releasedAt: entry.releasedAt,
			...(entry.changeGroups
				? { changeGroups: Object.fromEntries(changeGroupNames.map((name) => [name, [...entry.changeGroups![name]]])) as ChangeGroups }
				: { changeIds: [...entry.changeIds!] })
		}))
	};
}

function loadSystemInformation(): SystemInformation {
	const version = readProjectFile('VERSION').trim();
	if (!VERSION_PATTERN.test(version)) throw new Error('Product version is invalid.');
	const metadata = parseReleaseMetadata(JSON.parse(readProjectFile('release-metadata.json')));
	if (metadata.revisionHistory[0].version !== version) throw new Error('Product version and current revision history version do not match.');
	return { ...metadata, version };
}

export const systemInformation = Object.freeze(loadSystemInformation());
