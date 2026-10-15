<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';
	import { onMount, setContext, untrack } from 'svelte';
	import { afterNavigate, beforeNavigate, replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import { readSessionUser } from '$lib/client-session';
	import { safeLoginDestination } from '$lib/login-redirect';
	import { clearAvatar, loadAvatarFor } from '$lib/avatar';
	import type { SessionUser } from '$lib/auth';
	import AppHeader from '$lib/components/AppHeader.svelte';
	import AppSidebar from '$lib/components/AppSidebar.svelte';
	import StatusNotice from '$lib/components/StatusNotice.svelte';
	import { localeMessages } from '$lib/locale-messages';
	import { breadcrumbsForPath } from '$lib/components/sidebarNavigation';
	import { applyLocalization, initializeLocalization, LOCALIZATION_CONTEXT, localization } from '$lib/localization';
	import '../app.css';

	let { children, data } = $props();
	// Initialize before child rendering; later changes use the applied client store.
	setContext(LOCALIZATION_CONTEXT, untrack(() => initializeLocalization(data.initialLocalization)));
	let user = $state<SessionUser | null>(null);
	let collapsed = $state(false);
	let title = $state('');
	let sessionRevision = 0;
	let loggingOut = false;
	let logoutError = $state(false);
	let overdueNotice = $state('');
	let noticeCheckRunning = false;
	let navigationDestination: URL | null = null;
	let showShell = $derived(page.url.pathname !== '/account-setup' && (page.url.pathname !== '/' || user !== null));
	setContext('asset-shell-title', (value: string) => { title = value; });
	function toggleSidebar() {
		collapsed = !collapsed;
		localStorage.setItem('asset-sidebar-collapsed', String(collapsed));
		document.documentElement.dataset.assetSidebarCollapsed = String(collapsed);
	}
	async function logout() {
		if (loggingOut) return;
		loggingOut = true;
		logoutError = false;
		++sessionRevision;
		try {
			const response = await fetch('/v1/auth/logout', { method: 'POST' });
			if (!response.ok) throw new Error('Logout failed');
			sessionStorage.removeItem('book-overdue-checked');
			window.location.replace('/');
		} catch {
			logoutError = true;
			loggingOut = false;
			void refreshSession();
		}
	}
	async function refreshSession() {
		const revision = ++sessionRevision;
		try {
			const current = await readSessionUser();
			if (revision !== sessionRevision) return;
			if (current) await applyLocalization(current);
			if (revision === sessionRevision) {
				user = current;
				if (current) void loadAvatarFor(current.id).catch(() => undefined);
				else { clearAvatar(); sessionStorage.removeItem('book-overdue-checked'); overdueNotice = ''; }
				if (current) void checkOverdueNotice(current.id);
			}
		} catch {
			if (revision === sessionRevision) { user = null; clearAvatar(); }
		}
	}
	async function checkOverdueNotice(employeeId: number) {
		if (noticeCheckRunning || sessionStorage.getItem('book-overdue-checked') === String(employeeId)) return;
		noticeCheckRunning = true;
		try {
			const response = await fetch('/v1/book-notices/me');
			if (!response.ok) return;
			const payload = await response.json() as { data?: Array<{ kind: string; title: string }> };
			if (user?.id !== employeeId) return;
			const overdue = payload.data?.filter(item => item.kind === 'overdue') ?? [];
			if (overdue.length) overdueNotice = $localization.displayLanguage === 'ja' ? `返却期限を過ぎた書籍が${overdue.length}冊あります。マイページで確認してください。` : `${overdue.length} book(s) are overdue. Check My Page.`;
			sessionStorage.setItem('book-overdue-checked', String(employeeId));
		} catch { /* The next navigation can retry. */ } finally { noticeCheckRunning = false; }
	}
	beforeNavigate(({ to }) => { navigationDestination = to?.url ?? null; });
	afterNavigate(({ to }) => {
		// Client-side redirects cannot send the requested fragment to the server.
		// Carry it into the sign-in URL so reloads and failed logins retain it.
		if (to?.url.pathname === '/' && navigationDestination?.hash) {
			const destination = safeLoginDestination(to.url.searchParams.get('returnTo'));
			if (to.url.origin === navigationDestination.origin && destination === navigationDestination.pathname + navigationDestination.search) {
				const loginPage = new URL(to.url);
				loginPage.searchParams.set('returnTo', destination + navigationDestination.hash);
				loginPage.hash = '';
				replaceState(loginPage, page.state);
			}
		}
		navigationDestination = null;
		void refreshSession();
	});
	onMount(() => {
		collapsed = localStorage.getItem('asset-sidebar-collapsed') === 'true';
		document.documentElement.dataset.assetSidebarCollapsed = String(collapsed);
		const updateProfile = (event: Event) => {
			const detail = (event as CustomEvent<Pick<SessionUser, 'firstName' | 'middleName' | 'lastName'>>).detail;
			if (user && detail?.firstName && detail?.lastName) user = { ...user, ...detail };
		};
		const updateSessionUser = (event: Event) => {
			const current = (event as CustomEvent<SessionUser>).detail;
			if (!current || (user && current.id !== user.id)) return;
			++sessionRevision;
			user = current;
			void applyLocalization(current);
		};
		window.addEventListener('profile-updated', updateProfile);
		window.addEventListener('session-user-updated', updateSessionUser);
		return () => {
			window.removeEventListener('profile-updated', updateProfile);
			window.removeEventListener('session-user-updated', updateSessionUser);
		};
	});
</script>

<svelte:head>
	<link rel="icon" type="image/x-icon" sizes="16x16 32x32 48x48" href="/favicon.ico?v=sph-2" />
	<link rel="icon" type="image/svg+xml" sizes="any" href={favicon} />
	<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png?v=sph-2" />
</svelte:head>

<div class:shell={showShell} class:collapsed>
	{#if showShell}<AppSidebar {collapsed} {user} currentPath={page.url.pathname} onLogout={logout} />{/if}
	<div class:workspace={showShell}>
		{#if showShell}<AppHeader {collapsed} onToggleSidebar={toggleSidebar} breadcrumbs={breadcrumbsForPath(page.url.pathname, title, $localization.displayLanguage)} />{/if}
		<div class:app-main={showShell}>{#if logoutError}<StatusNotice message={localeMessages[$localization.displayLanguage].navigation.logoutFailed} tone="error" onDismiss={() => logoutError = false} />{/if}{#if overdueNotice}<StatusNotice message={overdueNotice} tone="warning" onDismiss={() => overdueNotice = ''} />{/if}{@render children()}</div>
	</div>
</div>

<style>
	.shell{min-height:100vh;background:var(--bg);color:var(--text)}
	.workspace{width:calc(100% - 252px);min-height:100vh;margin-left:252px;transition:margin-left .22s}
	.app-main{min-width:0;padding:88px 28px 36px}
	.collapsed .workspace{width:calc(100% - 64px);margin-left:64px}
	@media(max-width:760px){.workspace{width:calc(100% - 64px);margin-left:64px}.app-main{padding:78px 16px 24px}}
</style>
