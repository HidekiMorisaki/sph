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
