<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';
	import { onMount, setContext, untrack } from 'svelte';
	import { afterNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import { readSessionUser } from '$lib/client-session';
	import type { SessionUser } from '$lib/auth';
	import AppHeader from '$lib/components/AppHeader.svelte';
	import AppSidebar from '$lib/components/AppSidebar.svelte';
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
	let showShell = $derived(page.url.pathname !== '/account-setup' && (page.url.pathname !== '/' || user !== null));
	setContext('asset-shell-title', (value: string) => { title = value; });
	function toggleSidebar() {
		collapsed = !collapsed;
		localStorage.setItem('asset-sidebar-collapsed', String(collapsed));
		document.documentElement.dataset.assetSidebarCollapsed = String(collapsed);
	}
	async function logout() {
		++sessionRevision;
		user = null;
		await fetch('/v1/auth/logout', { method: 'POST' });
		window.location.assign('/');
	}
	async function refreshSession() {
		const revision = ++sessionRevision;
		try {
			const current = await readSessionUser();
			if (revision !== sessionRevision) return;
			if (current) await applyLocalization(current);
			if (revision === sessionRevision) user = current;
		} catch {
			if (revision === sessionRevision) user = null;
		}
	}
	afterNavigate(() => { void refreshSession(); });
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
	<link rel="icon" href={favicon} />
</svelte:head>

<div class:shell={showShell} class:collapsed>
	{#if showShell}<AppSidebar {collapsed} {user} currentPath={page.url.pathname} onLogout={logout} />{/if}
	<div class:workspace={showShell}>
		{#if showShell}<AppHeader {collapsed} onToggleSidebar={toggleSidebar} breadcrumbs={breadcrumbsForPath(page.url.pathname, title, $localization.displayLanguage)} />{/if}
		<div class:app-main={showShell}>{@render children()}</div>
	</div>
</div>

<style>
	.shell{min-height:100vh;background:var(--bg);color:var(--text)}
	.workspace{width:calc(100% - 252px);min-height:100vh;margin-left:252px;transition:margin-left .22s}
	.app-main{min-width:0;padding:88px 28px 36px}
	.collapsed .workspace{width:calc(100% - 64px);margin-left:64px}
	@media(max-width:760px){.workspace{width:calc(100% - 64px);margin-left:64px}.app-main{padding:78px 16px 24px}}
</style>
