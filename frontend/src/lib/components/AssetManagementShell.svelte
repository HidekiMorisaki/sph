<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import type { Snippet } from 'svelte';
  import { apiData } from '$lib/api';
  import AppHeader from './AppHeader.svelte';
  import AppSidebar from './AppSidebar.svelte';
  import { breadcrumbsForPath } from './sidebarNavigation';

  let { title, children }: { title: string; active?: string; children: Snippet } = $props();
  let collapsed = $state(false);
  let user = $state<{ username: string; name: string | null; role: string } | null>(null);
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
      if (response.ok) user = (await apiData<{ user: { username: string; name: string | null; role: string } }>(response)).user;
    })();
  });
</script>

<div class:collapsed class="shell">
  <AppSidebar {collapsed} {user} currentPath={page.url.pathname} onLogout={logout} />
  <section class="workspace">
    <AppHeader {collapsed} onToggleSidebar={toggle} breadcrumbs={breadcrumbsForPath(page.url.pathname, title)} />
    <main>{@render children()}</main>
  </section>
</div>

<style>
  .shell{min-height:100vh;background:var(--bg);color:var(--text)}
  .workspace{min-height:100vh;margin-left:252px;transition:margin-left .22s}
  main{padding:88px 28px 36px}
  .collapsed .workspace{margin-left:64px}
  @media(max-width:760px){.workspace{margin-left:64px}main{padding:78px 16px 24px}}
</style>
