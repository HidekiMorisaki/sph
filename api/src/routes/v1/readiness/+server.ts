import { failure, success } from '$lib/server/api/response';
import { isServiceReady } from '$lib/server/startup-readiness';

export async function GET() {
	const ready = await isServiceReady();
	const response = ready
		? success({ ready: true })
		: failure(503, 'SERVICE_UNAVAILABLE', 'The service is not ready.');
	response.headers.set('cache-control', 'no-store');
	if (!ready) response.headers.set('retry-after', '2');
	return response;
}
