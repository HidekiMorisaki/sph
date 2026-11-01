import { randomUUID } from 'node:crypto';

type Event = { locals: object; route: { id: string | null }; request: { method: string } };
type Classification = { category: string; code: string | null };
type Diagnostic = { requestId: string; started: number; error?: Classification };
// SvelteKit clones RequestEvent for tracing/resolve but shares request locals.
const requests = new WeakMap<object, Diagnostic>();
const codes = new Set([
	'P1000', 'P1001', 'P1002', 'P1003', 'P1008', 'P1010', 'P1011', 'P1017',
	'P2002', 'P2003', 'P2004', 'P2010', 'P2021', 'P2022', 'P2024', 'P2025', 'P2028', 'P2034', 'P2037',
	'40001', '40P01', '53300', '53400', '57014', '57P01', '57P02', '57P03',
	'08000', '08001', '08003', '08004', '08006', '08P01',
	'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EPIPE', 'ENOTFOUND', 'EAI_AGAIN'
]);
const methods = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']);

// Inspect data properties only: getters, messages, stacks, SQL and metadata are
// never evaluated or serialized. Unknown codes are deliberately discarded.
function property(value: unknown, key: string): unknown {
	if (!value || typeof value !== 'object') return undefined;
	try { return Object.getOwnPropertyDescriptor(value, key)?.value; } catch { return undefined; }
}

export function classifyRequestError(error: unknown): Classification {
	let value = error;
	for (let depth = 0; depth < 4; depth++) {
		const code = property(value, 'code');
		if (typeof code === 'string' && codes.has(code)) {
			return { category: code.startsWith('P') ? 'prisma' : /^[0-9]/.test(code) ? 'database' : 'network', code };
		}
		value = property(value, 'cause');
	}
	return { category: 'unclassified_exception', code: null };
}

export function beginRequestDiagnostic(event: Event): void {
	requests.set(event.locals, { requestId: randomUUID(), started: performance.now() });
}

export function recordRequestError(event: Event, error: unknown): void {
	const diagnostic = requests.get(event.locals);
	if (diagnostic && !diagnostic.error) diagnostic.error = classifyRequestError(error);
}

export function finishRequestDiagnostic(event: Event, status: number): string {
	const diagnostic = requests.get(event.locals);
	if (!diagnostic) throw new Error('Request diagnostic was not started.');
	requests.delete(event.locals);
	if (status >= 500) {
		const record = {
			event: 'api_request_failure', at: new Date().toISOString(),
			requestId: diagnostic.requestId, routeId: event.route.id,
			method: methods.has(event.request.method) ? event.request.method : 'OTHER',
			status, elapsedMs: Math.max(0, Math.round(performance.now() - diagnostic.started)),
			...(diagnostic.error ?? { category: 'returned_server_error', code: null })
		};
		// Diagnostics must not replace a response if the logging sink fails.
		try { console.error(JSON.stringify(record)); } catch { /* keep the original response */ }
	}
	return diagnostic.requestId;
}
