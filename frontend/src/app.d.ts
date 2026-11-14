// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			canManageDevelopment?: boolean;
			displayLanguage?: 'en' | 'ja';
			initialLocalization?: import('#lib/localization.js').LocalizationSettings;
		}
		// interface PageData {}
		interface PageState { employeeSearch?: import('#lib/search.js').SearchDefinition }
		// interface Platform {}
	}
}

export {};
