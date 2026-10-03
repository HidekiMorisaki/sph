import reasons from './asset-validation-reasons.json';
import { formatLocaleTemplate } from './locale-messages';
type AssetMessages = typeof import('./locales/en/assets.json');

/** Localize the existing REST validation reasons without displaying unknown server text. */
export function localizeAssetReason(reason: string | undefined, text: AssetMessages, fallback = text.invalidValue): string {
	if (!reason) return fallback;
	for (const [key, original] of Object.entries(reasons.errors)) if (reason === original) return text.errors[key as keyof typeof text.errors];
	for (const key of ['codeRequired','purchaseRequired','ramInvalid','differentIp','passwordLength'] as const) if (reason === reasons.messages[key]) return text[key];
	for (const key of ['codePrefix','codeDigits'] as const) {
		const [before, after] = reasons.messages[key].split('{1}');
		if (reason.startsWith(before) && reason.endsWith(after)) return formatLocaleTemplate(text[key], reason.slice(before.length, -after.length));
	}
	return fallback;
}
export function assetErrorMessage(code: string | undefined, status: number, text: AssetMessages, fallback: string): string {
	if (code === 'REAUTHENTICATION_FAILED') return text.wrongPassword;
	if (code === 'HTTPS_REQUIRED') return text.httpsRequired;
	if (code === 'CREDENTIAL_NOT_FOUND') return text.credentialMissing;
	if (code === 'RESOURCE_IN_USE') return text.resourceInUse;
	if (code === 'IT_ASSET_CODE_EXHAUSTED') return text.errors.codeExhausted;
	if (status === 401) return text.signInRequired;
	if (status === 403) return text.forbidden;
	if (status === 404) return text.notFound;
	return fallback;
}
