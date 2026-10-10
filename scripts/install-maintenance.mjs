import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { resolve4, resolve6 } from 'node:dns/promises';
import { request as httpsRequest } from 'node:https';
import { pathToFileURL } from 'node:url';
import { publicOrigin } from './install-config.mjs';
import { gatewaySettings, writeGatewayConfig } from './gateway-config.mjs';

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
	const mode = content.includes('GATEWAY_TLS_MODE=') ? get('GATEWAY_TLS_MODE') : 'local';
	const email = mode === 'public' ? get('ACME_EMAIL') : '';
	gatewaySettings(mode, origin, email);
	if (['local', 'internal-http'].includes(mode) && (Number(new URL(origin).port) || 80) !== Number(port)) throw new Error('Invalid settings.');
	return { mode, origin, port: Number(port), email };
}

export function withoutInitialAdmin(content) {
	return content.split(/\r?\n/).filter(line => !/^\s*(?:export\s+)?INITIAL_ADMIN_[A-Za-z0-9_]*\s*=/.test(line)).join('\n');
}

async function main() {
	const operation = process.argv[2];
	const content = readFileSync('.env', 'utf8');
	const config = settings(content);
	if (operation === 'settings') { console.log(JSON.stringify({ mode: config.mode, origin: config.origin, port: config.port })); return; }
	if (operation === 'settings-shell') { console.log(config.port); console.log(config.origin); console.log(config.mode); return; }
	if (operation === 'gateway-config') { writeGatewayConfig(config); return; }
	if (operation === 'preflight') {
		if (config.mode !== 'public') return;
		const hostname = new URL(config.origin).hostname;
		const addresses = await Promise.allSettled([resolve4(hostname), resolve6(hostname)]);
		if (!addresses.some(result => result.status === 'fulfilled' && result.value.length)) throw new Error();
		return;
	}
	if (operation === 'prepare-cleanup') {
		writeFileSync('.env.install-clean', withoutInitialAdmin(content), { flag: 'wx', mode: statSync('.env').mode & 0o777 });
		return;
	}
	if (operation === 'check') {
		const local = config.mode === 'local' ? `http://host.docker.internal:${config.port}` : config.mode === 'internal-http' ? config.origin : null;
		const requestLocal = async path => {
			if (local) return fetch(local + path, { signal: AbortSignal.timeout(5000) });
			const hostname = new URL(config.origin).hostname;
			const ca = config.mode === 'internal' ? readFileSync('.runtime/ca/root.crt') : undefined;
			return new Promise((resolve, reject) => {
				const request = httpsRequest({ hostname: 'host.docker.internal', port: 443, path, servername: hostname, headers: { Host: hostname }, ca, timeout: 5000 }, response => {
					const chunks = [];
					response.on('data', chunk => chunks.push(chunk));
					response.on('end', () => resolve({ status: response.statusCode, json: async () => JSON.parse(Buffer.concat(chunks).toString()), text: async () => Buffer.concat(chunks).toString() }));
				});
				request.on('error', reject);
				request.on('timeout', () => request.destroy(new Error('Timeout')));
				request.end();
			});
		};
		const attempts = config.mode === 'public' ? 300 : 120;
		for (let retry = 0; retry < attempts; retry++) {
			try {
				const health = await requestLocal('/v1/health');
				const data = await health.json();
				if (health.status !== 200 || data.status !== 'success' || data.responseCode !== 200 || data.data?.healthy !== true || data.data.version !== readFileSync('VERSION', 'utf8').trim()) throw new Error();
				const page = await requestLocal('/');
				if (page.status !== 200 || !(await page.text()).includes('SME Portal Hub')) throw new Error();
				return;
			} catch { if (retry === attempts - 1) throw new Error(); }
			await new Promise(resolve => setTimeout(resolve, 1000));
		}
	}
	if (operation === 'public-check') {
		if (config.mode === 'internal' || config.mode === 'internal-http') return;
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
