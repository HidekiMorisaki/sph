// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			displayLanguage?: 'en' | 'ja';
			initialLocalization?: import('$lib/localization').LocalizationSettings;
		}
		// interface PageData {}
		interface PageState { employeeSearch?: import('$lib/search').SearchDefinition }
		// interface Platform {}
	}
}

export {};
