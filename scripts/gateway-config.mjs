import { mkdirSync, writeFileSync } from 'node:fs';
import { isIP } from 'node:net';

const PUBLIC_NAME = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const INTERNAL_NAME = /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/;
const EMAIL = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;

function privateIPv4(host) {
	if (isIP(host) !== 4) return false;
	const [first, second] = host.split('.').map(Number);
	return first === 10 || (first === 172 && second >= 16 && second <= 31) || (first === 192 && second === 168);
}

export function gatewaySettings(mode, origin, email = '') {
	let url;
	try { url = new URL(origin); } catch { throw new Error('Invalid gateway origin.'); }
	if (!['local', 'public', 'internal', 'internal-http'].includes(mode) || url.origin !== origin || !url.hostname || url.username || url.password || url.pathname !== '/' || url.search || url.hash || /[\s'"\\\x00-\x1f\x7f]/.test(origin)) throw new Error('Invalid gateway settings.');
	const host = url.hostname.toLowerCase();
	if (mode === 'local') {
		if (url.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(host)) throw new Error('Invalid local origin.');
	} else if (mode === 'internal-http') {
		if (url.protocol !== 'http:' || !privateIPv4(host)) throw new Error('Invalid internal HTTP origin.');
	} else if (url.protocol !== 'https:' || url.port || (mode === 'public' ? !PUBLIC_NAME.test(host) : !INTERNAL_NAME.test(host))) {
		throw new Error('Invalid HTTPS origin.');
	}
	if (mode === 'public' && (!EMAIL.test(email) || email.length > 254)) throw new Error('Invalid ACME contact.');
	return { mode, origin, hostname: host, email: mode === 'public' ? email : '' };
}

export function renderGatewayConfig(settings) {
	const { mode, hostname, email } = gatewaySettings(settings.mode, settings.origin, settings.email);
	const global = mode === 'internal' ? '{\n\tskip_install_trust\n}\n\n' : '';
	const address = mode === 'local' || mode === 'internal-http' ? 'http://:80' : hostname;
	const issuer = mode === 'internal' ? '\ttls internal\n' : mode === 'public'
		? `\ttls {\n\t\tissuer acme https://acme-v02.api.letsencrypt.org/directory {\n\t\t\temail ${email}\n\t\t}\n\t}\n` : '';
	return `${global}${address} {\n${issuer}\trequest_body {\n\t\tmax_size 2MB\n\t}\n\t@api path /v1/*\n\thandle @api {\n\t\treverse_proxy api:3000 {\n\t\t\theader_up X-Request-Id {http.request.uuid}\n\t\t}\n\t}\n\thandle /v1 {\n\t\theader Content-Type application/json\n\t\trespond \`{"status":"error","responseCode":404,"error":{"code":"NOT_FOUND","message":"The requested API resource was not found.","details":[]}}\` 404\n\t}\n\thandle {\n\t\treverse_proxy frontend:3000 {\n\t\t\theader_up X-Request-Id {http.request.uuid}\n\t\t}\n\t}\n\thandle_errors 413 {\n\t\theader Content-Type application/json\n\t\trespond \`{"status":"error","responseCode":413,"error":{"code":"PAYLOAD_TOO_LARGE","message":"The request payload is too large.","details":[]}}\` 413\n\t}\n\thandle_errors {\n\t\t@api_error path /v1/*\n\t\thandle @api_error {\n\t\t\theader Content-Type application/json\n\t\t\trespond \`{"status":"error","responseCode":{err.status_code},"error":{"code":"GATEWAY_ERROR","message":"The upstream service is unavailable.","details":[]}}\` {err.status_code}\n\t\t}\n\t\trespond "The upstream service is unavailable." {err.status_code}\n\t}\n}\n`;
}

export function writeGatewayConfig(settings, root = '.') {
	const content = renderGatewayConfig(settings);
	mkdirSync(`${root}/.runtime/gateway`, { recursive: true, mode: 0o700 });
	writeFileSync(`${root}/.runtime/gateway/Caddyfile`, content, { mode: 0o600 });
}
