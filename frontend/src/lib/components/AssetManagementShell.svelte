<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import type { Snippet } from 'svelte';
  import { apiData } from '$lib/api';
  import type { SessionUser } from '$lib/auth';
  import { applyLocalization, localization } from '$lib/localization';
  import AppHeader from './AppHeader.svelte';
  import AppSidebar from './AppSidebar.svelte';
  import PageTitle from './PageTitle.svelte';
  import { breadcrumbsForPath } from './sidebarNavigation';

  let { title, children }: { title: string; active?: string; children: Snippet } = $props();
  let collapsed = $state(false);
  let user = $state<SessionUser | null>(null);
  function toggle() {
    collapsed = !collapsed;
    localStorage.setItem('asset-sidebar-collapsed', String(collapsed));
    document.documentElement.dataset.assetSidebarCollapsed = String(collapsed);
  }
  async function logout() {
    await fetch('/v1/auth/logout', { method: 'POST' });
    window.location.assign('/');
  }
  onMount(() => {
    collapsed = localStorage.getItem('asset-sidebar-collapsed') === 'true';
    document.documentElement.dataset.assetSidebarCollapsed = String(collapsed);
    void (async () => {
      const response = await fetch('/v1/auth/session');
      if (response.ok) {
        const current = (await apiData<{ user: SessionUser }>(response)).user;
        await applyLocalization(current);
        user = current;
      }
    })();
    const updateProfile = (event: Event) => {
      const detail = (event as CustomEvent<Pick<SessionUser, 'firstName' | 'middleName' | 'lastName'>>).detail;
      if (user && detail?.firstName && detail?.lastName) user = { ...user, ...detail };
    };
    const updateSessionUser = async (event: Event) => {
      const current = (event as CustomEvent<SessionUser>).detail;
      if (!current || (user && current.id !== user.id)) return;
      user = current;
      await applyLocalization(current);
    };
    window.addEventListener('profile-updated', updateProfile);
    window.addEventListener('session-user-updated', updateSessionUser);
    return () => {
      window.removeEventListener('profile-updated', updateProfile);
      window.removeEventListener('session-user-updated', updateSessionUser);
    };
  });
</script>

<PageTitle {title} />
<div class:collapsed class="shell">
  <AppSidebar {collapsed} {user} currentPath={page.url.pathname} onLogout={logout} />
  <section class="workspace">
    <AppHeader {collapsed} onToggleSidebar={toggle} breadcrumbs={breadcrumbsForPath(page.url.pathname, title, $localization.displayLanguage)} />
    <main>{@render children()}</main>
  </section>
</div>

<style>
  .shell{min-height:100vh;background:var(--bg);color:var(--text)}
  .workspace{width:calc(100% - 252px);min-height:100vh;margin-left:252px;transition:margin-left .22s}
  main{min-width:0;padding:88px 28px 36px}
  .collapsed .workspace{width:calc(100% - 64px);margin-left:64px}
  @media(max-width:760px){.workspace{width:calc(100% - 64px);margin-left:64px}main{padding:78px 16px 24px}}
</style>
