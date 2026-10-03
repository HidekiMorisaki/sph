<script lang="ts">
	import { localeMessages } from '$lib/locale-messages';
	import { onMount, tick } from 'svelte';
	import type { SessionUser } from '$lib/auth';
	import { applyLocalization, localization } from '$lib/localization';
	import Dashboard from '$lib/components/Dashboard.svelte';
	import { readSessionUser } from '$lib/client-session';
	import { productName } from '$lib/brand';
	import PageTitle from '$lib/components/PageTitle.svelte';
	const pageText = localeMessages.en.login;
	type CurrentUser = SessionUser;
	let user = $state<CurrentUser | null>(null); let identifier = $state(''); let password = $state(''); let isLoading = $state(true); let isSubmitting = $state(false); let message = $state('');
	let identifierError=$state('');let passwordError=$state('');let identifierInput=$state<HTMLInputElement>();let passwordInput=$state<HTMLInputElement>();
	async function validateLogin(){identifierError=identifier.trim()?'':pageText.identifierRequired;passwordError=password?'':pageText.passwordRequired;if(identifierError||passwordError){await tick();(identifierError?identifierInput:passwordInput)?.focus();return false;}return true;}
	async function loadSession() { const current = await readSessionUser(); if (current) await applyLocalization(current); user = current; }
	onMount(() => { let mounted = true; void (async () => { try { await loadSession(); } catch { if (mounted) message = pageText.loginFailed; } finally { if (mounted) isLoading = false; } })(); return () => { mounted = false; }; });
	async function login() { if(!await validateLogin())return; isSubmitting = true; message = ''; try { const response = await fetch('/v1/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ identifier, password }) }); if (!response.ok) { message = pageText.invalidCredentials; return; } password = ''; await loadSession(); } catch { message = pageText.loginFailed; } finally { isSubmitting = false; } }

</script>

{#if !user}<PageTitle />{/if}
<svelte:head><meta name="description" content={pageText.metaDescription} /></svelte:head>

{#if isLoading}<main class="auth"><p>{localeMessages[$localization.displayLanguage].common.loading}</p></main>
{:else if user}<Dashboard />
{:else}<main class="auth"><form novalidate onsubmit={(event) => { event.preventDefault(); void login(); }}><h1>{productName}</h1><p>{pageText.loginDescription}</p><label>{pageText.identifier}<input bind:this={identifierInput} bind:value={identifier} autocomplete="username" maxlength="254" aria-invalid={!!identifierError} aria-describedby={identifierError?'identifier-error':undefined} oninput={()=>identifierError=''} />{#if identifierError}<small id="identifier-error" class="field-error">{identifierError}</small>{/if}</label><label>{pageText.password}<input bind:this={passwordInput} bind:value={password} type="password" autocomplete="current-password" aria-invalid={!!passwordError} aria-describedby={passwordError?'login-password-error':undefined} oninput={()=>passwordError=''} />{#if passwordError}<small id="login-password-error" class="field-error">{passwordError}</small>{/if}</label><button type="submit" disabled={isSubmitting}>{isSubmitting ? pageText.signingIn : pageText.signIn}</button>{#if message}<p role="alert">{message}</p>{/if}</form></main>{/if}

<style>
  .auth{min-height:100vh;display:grid;place-items:center;padding:24px}
  .auth form{width:min(100%,400px);display:grid;gap:15px;padding:32px;background:var(--surface);border:1px solid var(--border);border-radius:8px;box-shadow:var(--shadow)}
  h1,p{margin:0}.auth p{color:var(--muted)}
  label{display:grid;gap:6px;font-size:13px;font-weight:600}
  input{height:36px;padding:0 12px;border:1px solid var(--border);border-radius:4px;background:var(--bg);color:var(--text)}input[aria-invalid='true']{border-color:var(--danger)}.field-error{color:var(--danger);font-size:11px;font-weight:400}
  form button{padding:10px;background:#2a85c8;color:#fff}

</style>
