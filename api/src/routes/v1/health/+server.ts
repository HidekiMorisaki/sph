import { success } from '$lib/server/api/response';
import { systemInformation } from '$lib/server/system-information';

export function GET() {
	return success({ service: 'equipment-api', healthy: true, version: systemInformation.version });
}
