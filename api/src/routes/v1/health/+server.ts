import { success } from '$lib/server/api/response';

export function GET() {
	return success({ service: 'equipment-api', healthy: true });
}
