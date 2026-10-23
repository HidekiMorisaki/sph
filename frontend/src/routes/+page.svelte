<script lang="ts">
	import { localeMessages } from '$lib/locale-messages';
	import { onMount, tick } from 'svelte';
	import type { SessionUser } from '$lib/auth';
	import { applyLocalization, localization } from '$lib/localization';
	import { readSessionUser } from '$lib/client-session';
	import { safeLoginDestination } from '$lib/login-redirect';
	import { productName } from '$lib/brand';
	import PageTitle from '$lib/components/PageTitle.svelte';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
	import StatusNotice from '$lib/components/StatusNotice.svelte';
	import { checkServiceReadiness } from '$lib/service-readiness.mjs';
	const pageText = localeMessages.en.login;
	let startupText = $derived(localeMessages[$localization.displayLanguage].login);
	type CurrentUser = SessionUser;
	let user = $state<CurrentUser | null>(null); let identifier = $state(''); let password = $state(''); let isLoading = $state(true); let isSubmitting = $state(false); let message = $state('');
	let identifierError=$state('');let passwordError=$state('');let identifierInput=$state<HTMLInputElement>();let passwordInput=$state<HTMLInputElement>();
	let serviceUnavailable = $state(false);
	let limitedUntil = $state(0);
	let remainingMinutes = $state(0);
	const limitMessage = () => (remainingMinutes === 1 ? pageText.rateLimitedOneMinute : pageText.rateLimited).replace('{1}', String(remainingMinutes));
	let restartReadiness = () => {};
	async function validateLogin(){identifierError=identifier.trim()?'':pageText.identifierRequired;passwordError=password?'':pageText.passwordRequired;if(identifierError||passwordError){await tick();(identifierError?identifierInput:passwordInput)?.focus();return false;}return true;}
	async function loadSession(signal?: AbortSignal) {
		const current = await readSessionUser((input, options) => fetch(input, { ...options,
			signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(5000)]) : AbortSignal.timeout(5000)
		}));
		if (signal?.aborted) return;
		if (current) await applyLocalization(current);
		user = current;
		if (current) {
			window.dispatchEvent(new CustomEvent('session-user-updated', { detail: current }));
			const loginPage = new URL(window.location.href);
			const destination = safeLoginDestination(loginPage.searchParams.get('returnTo')) ?? '/my-page';
			// HTTP redirects preserve the original fragment on the sign-in URL.
			window.location.replace(destination.includes('#') ? destination : destination + loginPage.hash);
		}
	}
	onMount(() => {
		const limitTimer = setInterval(() => {
			if (!limitedUntil) return;
			remainingMinutes = Math.max(0, Math.ceil((limitedUntil - performance.now()) / 60000));
			if (!remainingMinutes) { limitedUntil = 0; message = ''; }
			else message = limitMessage();
		}, 1000);
		const controller = new AbortController();
		let running = false;
		let timer: ReturnType<typeof setTimeout> | undefined;
		async function waitUntilReady() {
			if (running || controller.signal.aborted) return;
			running = true;
			isLoading = true;
			serviceUnavailable = false;
			const started = Date.now();
			try {
				while (!controller.signal.aborted) {
					if (await checkServiceReadiness('/v1/readiness', fetch, controller.signal)) {
						try {
							await loadSession(controller.signal);
							if (controller.signal.aborted) return;
							isLoading = false;
							return;
						} catch { /* Keep the form hidden when session validation is unavailable. */ }
					}
					if (controller.signal.aborted) return;
					serviceUnavailable = Date.now() - started >= 30000;
					await new Promise<void>(resolve => {
						const finish = () => { clearTimeout(timer); controller.signal.removeEventListener('abort', finish); resolve(); };
						timer = setTimeout(finish, 2000);
						controller.signal.addEventListener('abort', finish, { once: true });
					});
				}
			} finally { running = false; }
		}
		restartReadiness = () => { void waitUntilReady(); };
		restartReadiness();
		return () => { controller.abort(); clearTimeout(timer); clearInterval(limitTimer); restartReadiness = () => {}; };
	});
	function waitForService() {
		password = '';
		message = '';
		restartReadiness();
	}
	async function login() {
		if (isLoading || isSubmitting || !await validateLogin()) return;
		if (limitedUntil > performance.now()) { message = limitMessage(); return; }
		isSubmitting = true;
		message = '';
		try {
			if (!await checkServiceReadiness('/v1/readiness')) { waitForService(); return; }
			const response = await fetch('/v1/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ identifier, password }), signal: AbortSignal.timeout(10000) });
			if (response.status >= 500 || !response.headers.get('content-type')?.includes('application/json')) { waitForService(); return; }
			if (response.status === 429) {
				const seconds = Number(response.headers.get('retry-after'));
				if (!Number.isFinite(seconds) || seconds < 1 || seconds > 900) { message = pageText.loginFailed; return; }
				limitedUntil = performance.now() + seconds * 1000;
				remainingMinutes = Math.ceil(seconds / 60);
				message = limitMessage();
				password = '';
				return;
			}
			if (!response.ok) { message = response.status === 401 ? pageText.invalidCredentials : pageText.loginFailed; return; }
			password = '';
			await loadSession();
		} catch { waitForService(); }
		finally { isSubmitting = false; }
	}

</script>

{#if !user}<PageTitle />{/if}
<svelte:head><meta name="description" content={pageText.metaDescription} /></svelte:head>

{#if isLoading||user}<main class="auth"><section class="startup" data-service-startup aria-live="polite" aria-atomic="true"><h1>{productName}</h1><LoadingSpinner /><p>{serviceUnavailable ? startupText.serviceUnavailable : startupText.serviceStarting}</p><p class="startup-help">{serviceUnavailable ? startupText.serviceRetrying : startupText.serviceStartingHelp}</p></section></main>
{:else}<main class="auth"><form novalidate onsubmit={(event) => { event.preventDefault(); void login(); }}><h1>{productName}</h1><p>{pageText.loginDescription}</p><label>{pageText.identifier}<input bind:this={identifierInput} bind:value={identifier} autocomplete="username" maxlength="254" aria-invalid={!!identifierError} aria-describedby={identifierError?'identifier-error':undefined} oninput={()=>{identifierError='';limitedUntil=0;remainingMinutes=0;message='';}} />{#if identifierError}<small id="identifier-error" class="field-error">{identifierError}</small>{/if}</label><label>{pageText.password}<input bind:this={passwordInput} bind:value={password} type="password" autocomplete="current-password" aria-invalid={!!passwordError} aria-describedby={passwordError?'login-password-error':undefined} oninput={()=>passwordError=''} />{#if passwordError}<small id="login-password-error" class="field-error">{passwordError}</small>{/if}</label><button type="submit" disabled={isSubmitting}>{isSubmitting ? pageText.signingIn : pageText.signIn}</button>{#if message}<StatusNotice message={message} tone="error" onDismiss={() => message = ''} />{/if}</form></main>{/if}

<style>
  .auth{min-height:100vh;display:grid;place-items:center;padding:24px}
  .auth form,.startup{width:min(100%,400px);display:grid;gap:15px;padding:32px;background:var(--surface);border:1px solid var(--border);border-radius:8px;box-shadow:var(--shadow)}
  .startup{text-align:center}.startup-help{font-size:var(--font-size-support);color:var(--muted)}
  h1,p{margin:0}.auth p{color:var(--muted)}
  label{display:grid;gap:6px;font-size:var(--font-size-support);font-weight:600}
  input{height:36px;padding:0 12px;border:1px solid var(--border);border-radius:4px;background:var(--bg);color:var(--text)}input[aria-invalid='true']{border-color:var(--danger)}.field-error{color:var(--danger);font-size:var(--font-size-support);font-weight:400}
  form button{padding:10px;background:#2a85c8;color:#fff}

</style>
