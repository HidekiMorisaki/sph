import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { publicOrigin } from './install-config.mjs';

// Read only non-secret installer settings. Never evaluate or print the environment file.
export function settings(content) {
	const get = key => {
		const matches = content.split(/\r?\n/).filter(line => line.startsWith(key + '='));
		if (matches.length !== 1) throw new Error('Invalid settings.');
		return matches[0].slice(key.length + 1).replace(/^'([^']*)'$/, '$1');
	};
	const port = get('HTTP_PORT');
	const origin = publicOrigin(get('APP_ORIGIN'));
	if (!origin || !/^\d{1,5}$/.test(port) || Number(port) < 1 || Number(port) > 65535) throw new Error('Invalid settings.');
	return { origin, port: Number(port) };
}

export function withoutInitialAdmin(content) {
	return content.split(/\r?\n/).filter(line => !/^\s*(?:export\s+)?INITIAL_ADMIN_[A-Za-z0-9_]*\s*=/.test(line)).join('\n');
}

async function main() {
	const operation = process.argv[2];
	const content = readFileSync('.env', 'utf8');
	const config = settings(content);
	if (operation === 'settings') { console.log(JSON.stringify(config)); return; }
	if (operation === 'settings-shell') { console.log(config.port); console.log(config.origin); return; }
	if (operation === 'prepare-cleanup') {
		writeFileSync('.env.install-clean', withoutInitialAdmin(content), { flag: 'wx', mode: statSync('.env').mode & 0o777 });
		return;
	}
	if (operation === 'check') {
		const local = `http://host.docker.internal:${config.port}`;
		// Nginx may briefly retain the API's previous container address after recreation.
		for (let retry = 0; retry < 15; retry++) {
			try {
				const health = await fetch(local + '/v1/health', { signal: AbortSignal.timeout(5000) });
				const data = await health.json();
				if (health.status !== 200 || data.status !== 'success' || data.responseCode !== 200 || data.data?.healthy !== true || data.data.version !== readFileSync('VERSION', 'utf8').trim()) throw new Error();
				const page = await fetch(local + '/', { signal: AbortSignal.timeout(5000) });
				if (page.status !== 200 || !(await page.text()).includes('SME Portal Hub')) throw new Error();
				return;
			} catch { if (retry === 14) throw new Error(); }
			await new Promise(resolve => setTimeout(resolve, 1000));
		}
	}
	if (operation === 'public-check') {
		const hostname = new URL(config.origin).hostname;
		if (['localhost', '127.0.0.1', '[::1]'].includes(hostname)) return;
		const response = await fetch(config.origin + '/v1/health', { signal: AbortSignal.timeout(10000), redirect: 'error' });
		const data = await response.json();
		if (response.status !== 200 || data.status !== 'success' || data.data?.healthy !== true || data.data.version !== readFileSync('VERSION', 'utf8').trim()) throw new Error();
		return;
	}
	throw new Error();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	main().catch(() => { process.exitCode = 1; });
}
