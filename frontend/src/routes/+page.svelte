<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { apiData } from '$lib/api';
	import { employeeFullName, type EmployeeProfile } from '$lib/employees';
	import AppHeader from '$lib/components/AppHeader.svelte';
	import AppSidebar from '$lib/components/AppSidebar.svelte';
	import { breadcrumbsForPath } from '$lib/components/sidebarNavigation';
	import { productName } from '$lib/brand';
	type CurrentUser = { id: number; username: string; email: string | null; name: string | null; role: 'system_administrator' | 'business_administrator' | 'general_user'; mustChangeCredentials: boolean };
	const roleLabels: Record<CurrentUser['role'], string> = { system_administrator: 'System Administrator', business_administrator: 'Business Administrator', general_user: 'General User' };
	let user = $state<CurrentUser | null>(null); let identifier = $state(''); let password = $state(''); let isLoading = $state(true); let isSubmitting = $state(false); let message = $state(''); let sidebarCollapsed = $state(false);
	let identifierError=$state('');let passwordError=$state('');let identifierInput=$state<HTMLInputElement>();let passwordInput=$state<HTMLInputElement>();
	async function validateLogin(){identifierError=identifier.trim()?'':'Username or email is required.';passwordError=password?'':'Password is required.';if(identifierError||passwordError){await tick();(identifierError?identifierInput:passwordInput)?.focus();return false;}return true;}
	async function validateNewPassword(){passwordError=password.length>=12&&/[a-z]/.test(password)&&/[A-Z]/.test(password)&&/\d/.test(password)?'':'Use at least 12 characters with uppercase, lowercase, and numbers.';if(passwordError){await tick();passwordInput?.focus();return false;}return true;}
	function toggleSidebar() { sidebarCollapsed = !sidebarCollapsed; localStorage.setItem('asset-sidebar-collapsed', String(sidebarCollapsed)); document.documentElement.dataset.assetSidebarCollapsed = String(sidebarCollapsed); }
	async function loadSession() { const response = await fetch('/v1/auth/session'); user = response.ok ? (await apiData<{ user: CurrentUser }>(response)).user : null; }
	onMount(async () => { sidebarCollapsed = localStorage.getItem('asset-sidebar-collapsed') === 'true'; document.documentElement.dataset.assetSidebarCollapsed = String(sidebarCollapsed); try { await loadSession(); } finally { isLoading = false; } });
	async function login() { if(!await validateLogin())return; isSubmitting = true; message = ''; try { const response = await fetch('/v1/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ identifier, password }) }); if (!response.ok) { message = 'Invalid username or password.'; return; } password = ''; await loadSession(); } catch { message = 'Sign-in failed. Please try again.'; } finally { isSubmitting = false; } }
	async function completeOnboarding() { if(!await validateNewPassword())return; isSubmitting = true; message = ''; try { const response = await fetch('/v1/auth/onboarding', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password }) }); if (!response.ok) { message = 'Check your password.'; return; } password = ''; user = null; message = 'Your account settings were saved. Sign in with your new password.'; } finally { isSubmitting = false; } }
	async function logout() { isSubmitting = true; try { await fetch('/v1/auth/logout', { method: 'POST' }); user = null; } finally { isSubmitting = false; } }
	function profileSaved(profile: EmployeeProfile) { if (user) user = { ...user, name: employeeFullName(profile), email: profile.email }; }
</script>

<svelte:head><title>{productName}</title><meta name="description" content="Workplace asset management" /></svelte:head>

{#if isLoading}<main class="auth"><p>Checking your session…</p></main>
{:else if user?.mustChangeCredentials}<main class="auth"><form novalidate onsubmit={(event) => { event.preventDefault(); void completeOnboarding(); }}><h1>Complete your account</h1><p>Set a new password to continue.</p><p>Email: {user.email}</p><label>New password<input bind:this={passwordInput} bind:value={password} type="password" autocomplete="new-password" minlength="12" aria-invalid={!!passwordError} aria-describedby={passwordError?'new-password-error':undefined} oninput={()=>passwordError=''} />{#if passwordError}<small id="new-password-error" class="field-error">{passwordError}</small>{/if}</label><button type="submit" disabled={isSubmitting}>Save account</button>{#if message}<p role="alert">{message}</p>{/if}</form></main>
{:else if user}<div class:collapsed={sidebarCollapsed} class="shell"><AppSidebar collapsed={sidebarCollapsed} {user} currentPath="/" home onLogout={logout} onProfileSaved={profileSaved} /><section class="workspace" aria-labelledby="dashboard-title"><AppHeader collapsed={sidebarCollapsed} onToggleSidebar={toggleSidebar} breadcrumbs={breadcrumbsForPath('/', 'Operations')} /><div class="page-title"><p>OPERATIONS</p><h1 id="dashboard-title">Welcome back, {user.name ?? user.username}</h1><span>Manage your workplace assets from one place.</span></div><div class="cards"><article><small>ASSET OVERVIEW</small><b>Ready to manage</b><span>Keep inventory current</span></article><article><small>ATTENTION</small><b>No critical alerts</b><span>Review assignments regularly</span></article><article><small>ACCOUNT</small><b>{user.role}</b><span>{user.email ?? 'Email not set'}</span></article></div><section class="panel"><h2>Management</h2><p>Use the sidebar to maintain employees, locations and equipment.</p></section></section></div>
{:else}<main class="auth"><form novalidate onsubmit={(event) => { event.preventDefault(); void login(); }}><h1>{productName}</h1><p>Sign in to manage workplace assets.</p><label>Username or email<input bind:this={identifierInput} bind:value={identifier} autocomplete="username" maxlength="254" aria-invalid={!!identifierError} aria-describedby={identifierError?'identifier-error':undefined} oninput={()=>identifierError=''} />{#if identifierError}<small id="identifier-error" class="field-error">{identifierError}</small>{/if}</label><label>Password<input bind:this={passwordInput} bind:value={password} type="password" autocomplete="current-password" aria-invalid={!!passwordError} aria-describedby={passwordError?'login-password-error':undefined} oninput={()=>passwordError=''} />{#if passwordError}<small id="login-password-error" class="field-error">{passwordError}</small>{/if}</label><button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Signing in…' : 'Sign in'}</button>{#if message}<p role="alert">{message}</p>{/if}</form></main>{/if}

<style>
  .auth{min-height:100vh;display:grid;place-items:center;padding:24px}
  .auth form{width:min(100%,400px);display:grid;gap:15px;padding:32px;background:var(--surface);border:1px solid var(--border);border-radius:8px;box-shadow:var(--shadow)}
  h1,h2,p{margin:0}.auth p,.page-title span{color:var(--muted)}
  label{display:grid;gap:6px;font-size:13px;font-weight:600}
  input{height:36px;padding:0 12px;border:1px solid var(--border);border-radius:4px;background:var(--bg);color:var(--text)}input[aria-invalid='true']{border-color:var(--danger)}.field-error{color:var(--danger);font-size:11px;font-weight:400}
  form button{padding:10px;background:#2a85c8;color:#fff}
  .shell{min-height:100vh}.workspace{min-height:100vh;margin-left:252px;padding:88px 28px 36px;transition:margin-left .22s}
  .collapsed .workspace{margin-left:64px}
  .page-title p{margin-bottom:5px;color:var(--primary);font-size:11px;font-weight:700;letter-spacing:.09em}.page-title h1{font-size:28px}
  .cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;margin:26px 0}
  .cards article,.panel{padding:18px;background:var(--surface);border:1px solid var(--border);border-radius:7px;box-shadow:var(--shadow)}
  .cards small{color:var(--muted);font-size:11px;font-weight:700;letter-spacing:.07em}.cards b{display:block;margin:8px 0 4px;font-size:20px}.cards span,.panel p{color:var(--muted);font-size:14px}.panel h2{margin-bottom:7px;font-size:17px}
  @media(max-width:760px){.workspace{margin-left:64px;padding:78px 16px 24px}.cards{grid-template-columns:1fr}.page-title h1{font-size:24px}}
</style>
