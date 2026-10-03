<script lang="ts">
	import { localeMessages, formatLocaleTemplate } from '$lib/locale-messages';
	import { roleNames, type SessionUser } from '$lib/auth';
	import { formatEmployeeName, localization } from '$lib/localization';
	import AppHeader from './AppHeader.svelte';
	import AppSidebar from './AppSidebar.svelte';
	import MasterPageHeader from './MasterPageHeader.svelte';
	import { breadcrumbsForPath } from './sidebarNavigation';

	let { user, collapsed, onToggleSidebar, onLogout }: {
		user: SessionUser;
		collapsed: boolean;
		onToggleSidebar: () => void;
		onLogout: () => void | Promise<void>;
	} = $props();
	let pageText = $derived(localeMessages[$localization.displayLanguage].myPage);
</script>

<div class:collapsed={collapsed} class="shell"><AppSidebar collapsed={collapsed} {user} currentPath="/mypage" {onLogout} /><section class="workspace" aria-labelledby="my-page-title"><AppHeader collapsed={collapsed} onToggleSidebar={onToggleSidebar} breadcrumbs={breadcrumbsForPath('/mypage', pageText.title, $localization.displayLanguage)} /><MasterPageHeader title={pageText.title} titleId="my-page-title" description={formatLocaleTemplate(pageText.welcome, formatEmployeeName(user, $localization) || user.username)} />
<aside class="development-notice" role="note">
	<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="10" cy="10" r="8" /><path d="M10 9v5" /><circle cx="10" cy="6" r="1" fill="currentColor" stroke="none" /></svg>
	<p>{pageText.underDevelopment}</p>
</aside>
<div class="cards"><article><small>{pageText.assetOverview}</small><b>{pageText.ready}</b><span>{pageText.inventory}</span></article><article><small>{pageText.attention}</small><b>{pageText.noAlerts}</b><span>{pageText.assignments}</span></article><article><small>{pageText.account}</small><b>{roleNames(user)}</b><span>{user.email ?? pageText.emailUnset}</span></article></div><section class="panel"><h2>{pageText.management}</h2><p>{pageText.sidebarHelp}</p></section></section></div>

<style>
  h2,p{margin:0}
  .shell{min-height:100vh}.workspace{min-height:100vh;margin-left:252px;padding:88px 28px 36px;transition:margin-left .22s}
  .collapsed .workspace{margin-left:64px}
  .development-notice{display:flex;align-items:flex-start;gap:10px;min-width:0;max-width:100%;margin:0 0 20px;padding:14px 16px;border:1px solid color-mix(in srgb,var(--action-primary) 40%,var(--border));border-radius:var(--radius);background:color-mix(in srgb,var(--action-primary) 12%,var(--surface));color:var(--text)}
  .development-notice svg{width:20px;height:20px;flex:none;color:color-mix(in srgb,var(--action-primary) 70%,var(--text))}
  .development-notice p{min-width:0;font-size:14px;line-height:1.5;overflow-wrap:anywhere}
  .cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;margin:2px 0 26px}
  .cards article,.panel{padding:18px;background:var(--surface);border:1px solid var(--border);border-radius:7px;box-shadow:var(--shadow)}
  .cards small{color:var(--muted);font-size:11px;font-weight:700;letter-spacing:.07em}.cards b{display:block;margin:8px 0 4px;font-size:20px}.cards span,.panel p{color:var(--muted);font-size:14px}.panel h2{margin-bottom:7px;font-size:17px}
  @media(max-width:760px){.workspace{margin-left:64px;padding:78px 16px 24px}.cards{grid-template-columns:1fr}}
</style>
