import { readFileSync } from 'node:fs';

export function formatMessage(template, values = []) {
	return template.replace(/\{([1-9][0-9]*)\}/g, (_, position) => {
		if (Number(position) > values.length) throw new Error('Missing translation parameter.');
		return String(values[Number(position) - 1]);
	});
}

export function installerText(language) {
	if (!/^[a-z]{2}(?:-[A-Z]{2})?$/.test(language ?? '')) throw new Error('Unsupported language.');
	const catalog = JSON.parse(readFileSync(new URL(`locales/${language}.json`, import.meta.url), 'utf8'));
	return (key, ...values) => {
		if (!Object.hasOwn(catalog, key) || typeof catalog[key] !== 'string') throw new Error('Missing installer translation.');
		return formatMessage(catalog[key], values);
	};
}
