import type { ResolveOptions } from '@sveltejs/kit';

const escapeAttribute = (value: string) => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

// Keep SvelteKit's default JS/CSS preloads in the document rather than a
// potentially oversized HTTP Link header. State belongs to one SSR request.
export function createHtmlPreloads() {
	const links = new Set<string>();
	const preload: NonNullable<ResolveOptions['preload']> = ({ type, path }) => {
		const href = escapeAttribute(encodeURI(path));
		if (type === 'js') links.add(`<link rel="modulepreload" href="${href}">`);
		if (type === 'css') links.add(`<link rel="preload" as="style" href="${href}">`);
		// Returning false prevents SvelteKit from also sending these as headers.
		return false;
	};
	return {
		preload,
		transform(html: string): string {
			if (!links.size || !html.includes('</head>')) return html;
			const tags = [...links].join('\n\t\t');
			links.clear();
			return html.replace('</head>', () => `${tags}\n\t</head>`);
		}
	};
}
