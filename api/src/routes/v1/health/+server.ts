import { failure, success } from '$lib/server/api/response';
import { systemInformation } from '$lib/server/system-information';
import { validateCredentialEncryptionConfiguration } from '$lib/server/api/it-asset-credentials';

export function GET() {
	try {
		validateCredentialEncryptionConfiguration();
	} catch {
		return failure(503, 'SERVICE_UNAVAILABLE', 'The service is not configured correctly.');
	}
	return success({ service: 'equipment-api', healthy: true, version: systemInformation.version });
}
