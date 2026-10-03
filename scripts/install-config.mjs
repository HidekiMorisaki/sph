import { randomBytes } from 'node:crypto';
import { installerText } from './install-i18n.mjs';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { pathToFileURL } from 'node:url';

const initialDefaults = JSON.parse(readFileSync(new URL('install-defaults.json', import.meta.url), 'utf8'));

export function validDate(value) {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
	const date = new Date(`${value}T00:00:00Z`);
	return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function strongPassword(value) {
	return value.length >= 12 && value.length <= 1024 && /[a-z]/.test(value) && /[A-Z]/.test(value) && /[0-9]/.test(value) && !/[\x00-\x1f\x7f]/.test(value);
}

export function publicOrigin(value) {
	try {
		const url = new URL(value);
		if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password || url.pathname !== '/' || url.search || url.hash || /[\s'"\\\x00-\x1f\x7f]/.test(value)) return null;
		return url.origin;
	} catch { return null; }
}

export function envValue(value) {
	if (/[\x00-\x1f\x7f]/.test(value)) throw new Error('Invalid configuration value.');
	// Compose single quotes preserve dollar signs and literal backslashes.
	if (value.includes('\\')) return `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('$', () => '$$')}"`;
	return /^[A-Za-z0-9_-]+$/.test(value) ? value : `'${value.replaceAll("'", "\\'")}'`;
}

export async function configuration(language, ask, say) {
	if (!Object.hasOwn(initialDefaults, language)) throw new Error('Unsupported language.');
	const defaults = initialDefaults[language];
	const text = installerText(language);
	const input = async (key, fallback, valid) => {
		while (true) {
			const answer = (await ask(text('prompt.default', text(key), fallback))).trim() || fallback;
			if (!/[\x00-\x1f\x7f]/.test(answer) && valid(answer)) return answer;
			say(text('input.invalid'));
		}
	};
	const limited = maximum => value => value.length > 0 && value.length <= maximum;
	const select = async (key, options) => {
		say(text('prompt.selection', text(key)));
		options.forEach((option, index) => say(text('prompt.option', index + 1, text(option.label))));
		const answer = await input('input.selectNumber', '1', value => /^[1-9]\d*$/.test(value) && Number(value) <= options.length);
		return options[Number(answer) - 1].value;
	};
	say(text('input.defaultsNotice'));
	const values = {
		POSTGRES_DB: 'sph', POSTGRES_USER: 'appuser', POSTGRES_PASSWORD: randomBytes(32).toString('base64url'),
		POSTGRES_HOST: 'db', POSTGRES_PORT: '5432',
		IT_ASSET_CREDENTIAL_ENCRYPTION_KEY: randomBytes(32).toString('base64url'),
		INITIAL_ADMIN_DISPLAY_LANGUAGE: language
	};
	say(text('connection.notice'));
	values.HTTP_PORT = await input('connection.port', '3000', value => /^\d{1,5}$/.test(value) && Number(value) >= 1 && Number(value) <= 65535);
	values.APP_ORIGIN = publicOrigin(await input('connection.url', `http://localhost:${values.HTTP_PORT}`, value => publicOrigin(value) !== null));
	if (values.APP_ORIGIN.startsWith('http:') && !['localhost', '127.0.0.1', '[::1]'].includes(new URL(values.APP_ORIGIN).hostname)) {
		say(text('connection.httpsNotice'));
	}
	values.CORS_ALLOWED_ORIGINS = values.APP_ORIGIN;
	values.INITIAL_ADMIN_USERNAME = await input('account.username', 'admin', limited(64));
	say(text('password.notice'));
	while (true) {
		const password = await ask(text('password.prompt'), true);
		if (!strongPassword(password)) { say(text('password.invalid')); continue; }
		if (password !== await ask(text('password.confirm'), true)) { say(text('password.mismatch')); continue; }
		values.INITIAL_ADMIN_PASSWORD = password;
		break;
	}
	say(text('profile.notice'));
	values.INITIAL_ADMIN_FIRST_NAME = await input('profile.firstName', defaults.firstName, limited(128));
	values.INITIAL_ADMIN_LAST_NAME = await input('profile.lastName', defaults.lastName, limited(128));
	values.INITIAL_ADMIN_BIRTH_DATE = await input('profile.birthDate', '1990-01-01', validDate);
	values.INITIAL_ADMIN_GENDER = await select('profile.gender', [
		{ value: 'unspecified', label: 'gender.unspecified' },
		{ value: 'female', label: 'gender.female' },
		{ value: 'male', label: 'gender.male' }
	]);
	values.INITIAL_ADMIN_EMAIL = await input('profile.email', 'system-admin@example.test', value => value.length <= 255 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value));
	say(text('employment.notice'));
	values.INITIAL_ADMIN_EMPLOYEE_CODE = await input('employment.employeeCode', 'SYSTEMADMIN0001', value => /^[A-Za-z0-9]{10,64}$/.test(value));
	values.INITIAL_ADMIN_HIRED_AT = await input('employment.hireDate', new Date().toISOString().slice(0, 10), validDate);
	values.INITIAL_ADMIN_EMPLOYMENT_TYPE = await select('employment.type', [
		{ value: 'Regular', label: 'employment.regular' },
		{ value: 'Contract', label: 'employment.contract' },
		{ value: 'Part Time', label: 'employment.partTime' },
		{ value: 'Temporary', label: 'employment.temporary' }
	]);
	values.INITIAL_ADMIN_BRANCH = defaults.branch;
	values.INITIAL_ADMIN_SAMPLE_DATA = await select('samples.prompt', [
		{ value: 'no', label: 'samples.no' },
		{ value: 'yes', label: 'samples.yes' }
	]);
	say(text('language.notice'));
	return values;
}

async function main() {
	const language = process.argv[2];
	const text = installerText(language);
	if (!Object.hasOwn(initialDefaults, language)) throw new Error();
	if (existsSync('.env')) throw new Error('error.existingConfiguration');
	if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('error.terminal');
	const color = !Object.hasOwn(process.env, 'NO_COLOR') && process.env.TERM !== 'dumb';
	const accent = value => color ? `\x1b[36m${value}\x1b[0m` : value;
	let hidden = false;
	const output = new Writable({ write(chunk, encoding, callback) { if (!hidden) process.stdout.write(chunk); callback(); } });
	output.isTTY = process.stdout.isTTY;
	output.columns = process.stdout.columns;
	process.stdout.on('resize', () => { output.columns = process.stdout.columns; });
	const terminal = createInterface({ input: process.stdin, output, terminal: true });
	terminal.on('SIGINT', () => { terminal.close(); process.stdout.write(text('cancelled')); process.exit(130); });
	try {
		const values = await configuration(language, async (prompt, secret = false) => {
			if (secret) process.stdout.write(accent(prompt));
			hidden = secret;
			try { return await terminal.question(secret ? '' : accent(prompt)); }
			finally { hidden = false; if (secret) process.stdout.write('\n'); }
		}, message => process.stdout.write(accent(message) + '\n'));
		process.umask(0o077);
		try {
			writeFileSync('.env', Object.entries(values).map(([key, value]) => `${key}=${envValue(value)}`).join('\n') + '\n', { flag: 'wx', mode: 0o600 });
		} catch (error) {
			throw new Error(error.code === 'EEXIST' ? 'error.existingConfiguration' : 'error.saveConfiguration');
		}
		process.stdout.write(text('configuration.saved'));
	} finally { terminal.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	main().catch(error => {
		// Native Docker stderr is suppressed by the launcher. Show only allowlisted messages on stdout.
		const key = ['error.existingConfiguration', 'error.terminal', 'error.saveConfiguration'].includes(error.message) ? error.message : 'configuration.failed';
		try { console.log(installerText(process.argv[2])(key)); }
		catch { console.log('Installer language files are missing or invalid. Extract the complete release again before running the installer.'); }
		process.exitCode = 1;
	});
}
