import { readFileSync, writeFileSync, mkdirSync, renameSync, unlinkSync, rmdirSync, statfsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// This runs as the questionnaire's container user, without network or Docker socket.
export function workspaceCheck(directory, token) {
	if (!/^\.sph-preflight-[A-Za-z0-9]+$/.test(directory) || !/^[a-f0-9]+$/.test(token)) throw new Error();
	if (readFileSync(`${directory}/token`, 'utf8') !== token) throw new Error();
	for (const file of readFileSync('scripts/install-required-files.txt', 'utf8').trim().split(/\r?\n/)) readFileSync(file);
	const probe = `${directory}/container`;
	mkdirSync(probe);
	try {
		writeFileSync(`${probe}/first`, token, { flag: 'wx', mode: 0o600 });
		renameSync(`${probe}/first`, `${probe}/second`);
		if (readFileSync(`${probe}/second`, 'utf8') !== token) throw new Error();
		unlinkSync(`${probe}/second`);
	} finally {
		for (const name of ['first', 'second']) { try { unlinkSync(`${probe}/${name}`); } catch (error) { if (error.code !== 'ENOENT') throw error; } }
		rmdirSync(probe);
	}
	try {
		const info = statfsSync('.');
		return Math.floor(info.bavail * info.bsize / 1024 ** 3);
	} catch { return null; }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	try { console.log(JSON.stringify({ freeGiB: workspaceCheck(process.argv[2], process.argv[3]) })); }
	catch { process.exitCode = 1; }
}
