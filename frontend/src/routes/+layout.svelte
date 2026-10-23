<script lang="ts">
	import { COMPACT_NAVIGATION_QUERY } from '$lib/responsive-layout';
	import favicon from '$lib/assets/favicon.svg';
	import { onMount, setContext, untrack, tick } from 'svelte';
	import { afterNavigate, beforeNavigate, replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import { readSessionUser } from '$lib/client-session';
	import { safeLoginDestination } from '$lib/login-redirect';
	import { clearAvatar, loadAvatarFor } from '$lib/avatar';
	import { canOperate, type SessionUser } from '$lib/auth';
	import { isSidebarGroupId, readSidebarGroups, saveSidebarGroups, sidebarGroupExpanded, type SidebarGroupState } from '$lib/sidebar-groups';
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
	setContext('operation-allowed', (code: string, branchId?: number) => canOperate(user, code, branchId));
	let sidebarGroups = $state<SidebarGroupState>({});
	let sidebarOwner: number | null = null;
	function setSidebarUser(current: SessionUser | null) {
		const employeeId = current?.id ?? null;
		if (employeeId !== sidebarOwner) {
			sidebarGroups = employeeId === null ? {} : readSidebarGroups(employeeId);
			sidebarOwner = employeeId;
		}
		// Restore preferences before the new employee's navigation can render.
		user = current;
	}
	function toggleSidebarGroup(id: string) {
		if (!user || sidebarOwner !== user.id || !isSidebarGroupId(id)) return;
		sidebarGroups = { ...sidebarGroups, [id]: !sidebarGroupExpanded(sidebarGroups, id) };
		saveSidebarGroups(user.id, sidebarGroups);
	}
	let collapsed = $state(false);
 let mobileMenu = $state<HTMLDialogElement>();
 let mobileMenuOpen=$state(false);
 async function closeMobileMenu(){mobileMenu?.close();mobileMenuOpen=false;await tick();document.querySelector<HTMLButtonElement>('.app-header .menu')?.focus({preventScroll:true});}
 function mobileMenuClick(event:MouseEvent){if(event.target instanceof Element && event.target.closest('a[href]'))void closeMobileMenu();}
 onMount(()=>{const media=matchMedia(COMPACT_NAVIGATION_QUERY);const changed=()=>{document.documentElement.dataset.compactNavigation=String(media.matches);if(!media.matches){mobileMenu?.close();mobileMenuOpen=false;}};changed();media.addEventListener('change',changed);return()=>{media.removeEventListener('change',changed);delete document.documentElement.dataset.compactNavigation;};});
	let title = $state('');
	let sessionRevision = 0;
	let loggingOut = false;
	let logoutError = $state(false);
	let overdueNotice = $state('');
	let noticeCheckRunning = false;
	let navigationDestination: URL | null = null;
	let showShell = $derived(page.url.pathname !== '/account-setup' && (page.url.pathname !== '/' || user !== null));
	setContext('asset-shell-title', (value: string) => { title = value; });
	async function toggleSidebar() {
  if(matchMedia(COMPACT_NAVIGATION_QUERY).matches){mobileMenuOpen=true;await tick();mobileMenu?.showModal();return;}
		collapsed = !collapsed;
		try { localStorage.setItem('asset-sidebar-collapsed', String(collapsed)); } catch { /* Width can change without persistence. */ }
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
				setSidebarUser(current);
				if (current) void loadAvatarFor(current.id).catch(() => undefined);
				else { clearAvatar(); sessionStorage.removeItem('book-overdue-checked'); overdueNotice = ''; }
				if (current) void checkOverdueNotice(current.id);
			}
		} catch {
			if (revision === sessionRevision) { setSidebarUser(null); clearAvatar(); }
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
		try { collapsed = localStorage.getItem('asset-sidebar-collapsed') === 'true'; } catch { /* Keep the default width. */ }
		document.documentElement.dataset.assetSidebarCollapsed = String(collapsed);
		const updateProfile = (event: Event) => {
			const detail = (event as CustomEvent<Pick<SessionUser, 'firstName' | 'middleName' | 'lastName'>>).detail;
			if (user && detail?.firstName && detail?.lastName) user = { ...user, ...detail };
		};
		const updateSessionUser = (event: Event) => {
			const current = (event as CustomEvent<SessionUser>).detail;
			if (!current || (user && current.id !== user.id)) return;
			++sessionRevision;
			setSidebarUser(current);
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
	{#if showShell}<div class="desktop-navigation"><AppSidebar {collapsed} {user} groupExpansion={sidebarGroups} onToggleGroup={toggleSidebarGroup} currentPath={page.url.pathname} onLogout={logout} /></div>
 {#if mobileMenuOpen}<dialog bind:this={mobileMenu} class="mobile-navigation" aria-label={localeMessages[$localization.displayLanguage].navigation.primaryNavigation} onclick={event=>{if(event.target===mobileMenu)void closeMobileMenu();else mobileMenuClick(event);}} onkeydown={event=>{if(event.key==='Escape'){event.preventDefault();void closeMobileMenu();}}} oncancel={event=>{event.preventDefault();void closeMobileMenu();}}>
 <button type="button" class="mobile-menu-close" aria-label={localeMessages[$localization.displayLanguage].common.close} onclick={()=>void closeMobileMenu()}>×</button>
 <AppSidebar collapsed={false} forceExpanded {user} groupExpansion={sidebarGroups} onToggleGroup={toggleSidebarGroup} currentPath={page.url.pathname} onLogout={()=>{mobileMenu?.close();mobileMenuOpen=false;void logout();}} />
 </dialog>{/if}{/if}
	<div class:workspace={showShell}>
		{#if showShell}<AppHeader {collapsed} onToggleSidebar={toggleSidebar} breadcrumbs={breadcrumbsForPath(page.url.pathname, title, $localization.displayLanguage)} />{/if}
		<div class:app-main={showShell}>{#if logoutError}<StatusNotice message={localeMessages[$localization.displayLanguage].navigation.logoutFailed} tone="error" onDismiss={() => logoutError = false} />{/if}{#if overdueNotice}<StatusNotice message={overdueNotice} tone="warning" onDismiss={() => overdueNotice = ''} />{/if}{@render children()}</div>
	</div>
</div>

<style>
	:global(body:has(.mobile-navigation[open])){overflow:hidden}
	.shell{min-height:100vh;background:var(--bg);color:var(--text)}
	.workspace{width:calc(100% - 252px);min-height:100vh;margin-left:252px;transition:margin-left .22s}
	.app-main{min-width:0;padding:88px 28px 36px}
	.collapsed .workspace{width:calc(100% - 64px);margin-left:64px}
	.mobile-navigation{position:fixed;inset:0 auto 0 0;width:min(300px,90vw);height:100dvh;max-height:100dvh;max-width:90vw;margin:0;padding:0;border:0;background:var(--surface);color:var(--text);overflow:visible}.mobile-navigation::backdrop{background:rgba(0,0,0,.5)}.mobile-navigation :global(.app-sidebar){position:absolute;width:100%;height:100%;min-height:0}.mobile-menu-close{position:absolute;z-index:101;right:8px;top:8px;min-width:44px;min-height:44px;padding:0;background:transparent!important;color:#fff;font-size:26px}.mobile-navigation :global(.brand){padding-right:54px}
 @media (max-width:760px), (min-width:701px) and (max-width:1024px) and (max-height:500px) and (any-pointer:coarse){.desktop-navigation{display:none}.shell .workspace{width:100%;margin-left:0}.app-main{padding:72px 12px 20px}}

</style>
