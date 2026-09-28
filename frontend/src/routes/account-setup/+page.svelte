<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { productName } from '$lib/brand';

	let token = $state('');
	let ready = $state(false);
	let password = $state('');
	let confirmPassword = $state('');
	let loading = $state(false);
	let completed = $state(false);
	let error = $state('');
	let passwordError=$state('');let confirmError=$state('');let passwordInput=$state<HTMLInputElement>();let confirmInput=$state<HTMLInputElement>();

	onMount(() => {
		token = new URLSearchParams(window.location.hash.slice(1)).get('token') ?? '';
		window.history.replaceState(null, '', window.location.pathname + window.location.search);
		ready = true;
	});

	async function complete() {
		error = '';
		passwordError=password.length>=12&&/[a-z]/.test(password)&&/[A-Z]/.test(password)&&/\d/.test(password)?'':'Use at least 12 characters with uppercase, lowercase, and numbers.';
		confirmError=!confirmPassword?'Confirm your password.':password!==confirmPassword?'Passwords do not match.':'';
		if(passwordError||confirmError){await tick();(passwordError?passwordInput:confirmInput)?.focus();return;}
		loading = true;
		try {
			const response = await fetch('/v1/auth/account-setup', {
				method: 'POST',
				headers: { 'content-type': 'application/json', 'x-account-invitation': token },
				body: JSON.stringify({ password })
			});
			if (!response.ok) { error = 'This invitation is invalid or has expired. Ask your system administrator for a new link.'; return; }
			completed = true;
			token = '';
			password = '';
			confirmPassword = '';
		} catch { error = 'Unable to complete account setup. Try again.'; }
		finally { loading = false; }
	}
</script>

<svelte:head><title>Set up your account | {productName}</title><meta name="referrer" content="no-referrer" /></svelte:head>

<main class="setup-page"><section class="setup-card">
	{#if !ready}<p>Checking invitation…</p>
	{:else if completed}<h1>Account ready</h1><p>Your password is set. Sign in using your email address.</p><a href="/">Go to sign in</a>
	{:else if !token}<h1>Invitation unavailable</h1><p>Open the invitation link you received from your system administrator. If it has expired, ask for a new link.</p><a href="/">Go to sign in</a>
	{:else}<h1>Set up your account</h1><p>Choose a password to activate your account. The invitation link can be used only once.</p>
		<form novalidate onsubmit={(event) => { event.preventDefault(); void complete(); }}>
			<label>New password<input bind:this={passwordInput} bind:value={password} type="password" autocomplete="new-password" minlength="12" maxlength="1024" aria-invalid={!!passwordError} aria-describedby={passwordError?'setup-password-error':undefined} oninput={()=>passwordError=''} />{#if passwordError}<small id="setup-password-error" class="field-error">{passwordError}</small>{/if}</label>
			<label>Confirm password<input bind:this={confirmInput} bind:value={confirmPassword} type="password" autocomplete="new-password" minlength="12" maxlength="1024" aria-invalid={!!confirmError} aria-describedby={confirmError?'setup-confirm-error':undefined} oninput={()=>confirmError=''} />{#if confirmError}<small id="setup-confirm-error" class="field-error">{confirmError}</small>{/if}</label>
			{#if error}<p class="error" role="alert">{error}</p>{/if}
			<button type="submit" disabled={loading}>{loading ? 'Setting up…' : 'Set password'}</button>
		</form>
	{/if}
</section></main>

<style>
	.setup-page{min-height:100dvh;display:grid;place-items:center;padding:24px;background:var(--bg)}
	.setup-card{display:grid;gap:16px;width:min(100%,440px);padding:32px;background:var(--surface);border:1px solid var(--border);border-radius:8px;box-shadow:var(--shadow)}
	h1,p{margin:0}h1{font-size:24px}.setup-card>p{color:var(--muted);font-size:13px;line-height:1.5}
	form{display:grid;gap:15px}label{display:grid;gap:6px;font-size:13px;font-weight:600}input{width:100%;height:36px;padding:0 12px;border:1px solid var(--border);border-radius:4px;background:var(--bg);color:var(--text)}input[aria-invalid='true']{border-color:var(--danger)}.field-error{color:var(--danger);font-size:11px;font-weight:400}
	button,a{display:inline-flex;justify-content:center;align-items:center;min-height:40px;padding:9px 14px;border-radius:4px;font-size:13px;font-weight:600;text-decoration:none}
	button{background:#337ab7;color:#fff;border:1px solid #286090}button:disabled{opacity:.6;cursor:wait}a{width:max-content;background:#337ab7;color:#fff}.error{color:var(--danger);font-size:12px}
</style>
