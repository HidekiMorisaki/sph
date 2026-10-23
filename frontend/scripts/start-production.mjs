import { setTimeout as delay } from 'node:timers/promises';
import { checkServiceReadiness } from '../src/lib/service-readiness.mjs';

let readinessUrl;
try {
	readinessUrl = new URL('/v1/readiness', process.env.API_INTERNAL_ORIGIN);
	if (!['http:', 'https:'].includes(readinessUrl.protocol) || readinessUrl.username || readinessUrl.password) throw new Error();
} catch {
	console.error('A valid API_INTERNAL_ORIGIN is required to start the frontend.');
	process.exit(1);
}

const controller = new AbortController();
const stop = () => controller.abort();
process.once('SIGTERM', stop);
process.once('SIGINT', stop);
console.log('Waiting for the service to be ready.');
while (!controller.signal.aborted) {
	if (await checkServiceReadiness(readinessUrl, fetch, controller.signal)) break;
	await delay(2000, undefined, { signal: controller.signal }).catch(() => undefined);
}
process.removeListener('SIGTERM', stop);
process.removeListener('SIGINT', stop);
if (!controller.signal.aborted) {
	console.log('Service ready. Starting the frontend.');
	await import('../build/index.js');
}
