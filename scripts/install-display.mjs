import { readFileSync } from 'node:fs';

export function installerBanner({ color = false, columns = 0, light = lightBackground() } = {}) {
	if (!color) return 'SPH Installer\n';
	let sections;
	try { sections = readFileSync(new URL('./installer-banner.txt', import.meta.url), 'utf8').trimEnd().replaceAll('\r', '').split('\n\n'); }
	catch { return 'SPH Installer\n'; }
	const width = Math.max(...sections.join('\n').split('\n').map(line => [...line].length));
	if (columns < width) return 'SPH Installer\n';
	return `\n\x1b[${light ? 34 : 94}m${sections[0]}\x1b[0m\n\n\x1b[${light ? 30 : 97}m${sections[1]}\x1b[0m\n\n`;
}

// Presentation metadata is supplied by callers, never inferred from translated text.
const colors = { message: 0, question: 96, option: 94, default: 95, success: 32, warning: 33, error: 31 };
export function lightBackground(environment = process.env) { return /(?:^|;)(?:7|15)$/.test(environment.COLORFGBG ?? ''); }
export function displayText(value, role = 'message', enabled = false, light = lightBackground()) {
	if (!Object.hasOwn(colors, role)) throw new Error('Unknown installer display role.');
	const code = light && ['question', 'option', 'default'].includes(role) ? colors[role] - 60 : colors[role];
	return enabled ? `\x1b[${code}m${value}\x1b[0m` : String(value);
}
export function displayPrompt(text, label, fallback, enabled = false) {
	return text('prompt.styledDefault', displayText(label, 'question', enabled), displayText(`[${fallback}]`, 'default', enabled));
}
