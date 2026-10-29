<script lang="ts">
	import NotificationBell from './NotificationBell.svelte';
	import AccountMenu from './AccountMenu.svelte';
 import type { SessionUser } from '$lib/auth';
	import { localeMessages } from '$lib/locale-messages';
	import { localization } from '$lib/localization';
	import { onMount } from 'svelte';
	import { appearance, initializeAppearance, setColorMode } from '$lib/themes/appearance';

	type Breadcrumb = { label: string; href?: string };

	let {
		collapsed,
		breadcrumbs,
		onToggleSidebar, onLogout, user = null
	}: {
		user?: SessionUser | null;
		collapsed: boolean;
		breadcrumbs: Breadcrumb[];
		onToggleSidebar: () => void;
		onLogout: () => void | Promise<void>;
	} = $props();

	let navigationText = $derived(localeMessages[$localization.displayLanguage].navigation);
	let theme = $derived($appearance.colorMode);
	onMount(initializeAppearance);
</script>

<header class:collapsed class="app-header">
	<div class="head-left">
		<button
			class="menu"
			aria-label={collapsed ? navigationText.expand : navigationText.collapse}
			aria-pressed={collapsed}
			type="button"
			onclick={onToggleSidebar}
		>
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
				<path d="M4 6h16M4 12h16M4 18h16" />
			</svg>
		</button>
		<nav class="crumb" aria-label={navigationText.breadcrumb}>
			{#each breadcrumbs as breadcrumb, index}
				{#if breadcrumb.href}<a href={breadcrumb.href}>{breadcrumb.label}</a>{:else}<span>{breadcrumb.label}</span>{/if}
				{#if index < breadcrumbs.length - 1}<b aria-hidden="true">›</b>{/if}
			{/each}
		</nav>
	</div>
 <div class="header-actions"><NotificationBell {user}/>
	<button
		class="theme"
		title={navigationText.switchTheme}
		aria-label={theme === 'light' ? navigationText.darkMode : navigationText.lightMode}
		type="button"
		onclick={() => setColorMode(theme === 'light' ? 'dark' : 'light')}
	>
		{#if theme === 'light'}
			<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" fill="none" stroke="currentColor" stroke-width="1.5" /></svg>
		{:else}
			<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="1.5" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" stroke="currentColor" stroke-width="1.5" /></svg>
		{/if}
	</button>
 {#if user}<AccountMenu {user} {onLogout} />{/if}
 </div>
</header>

<style>
	.app-header{position:fixed;z-index:50;top:0;left:252px;right:0;height:56px;display:flex;align-items:center;justify-content:space-between;padding:0 var(--sph-space-28px);background:color-mix(in srgb,var(--surface) 85%,transparent);backdrop-filter:blur(14px);border-bottom:1px solid var(--border);transition:left .22s}
 .header-actions{display:flex;flex:none;align-items:center;gap:var(--sph-space-8px)}
	.app-header{gap:var(--sph-space-12px)}
	.head-left{display:flex;flex:1;min-width:0;align-items:center;gap:var(--sph-space-16px)}
	.menu,.theme{display:grid;place-items:center;width:34px;height:34px;padding:var(--sph-space-7px);background:transparent;color:var(--muted);border:0;border-radius:var(--sph-radius-4px);cursor:pointer;font:inherit}
	.menu:hover,.theme:hover{background:var(--surface-hover,var(--bg))}
	.menu svg{width:18px;height:18px;transition:transform .2s}
	.theme svg{width:20px;height:20px}
	.menu,.theme{flex:none;margin:0}
	.crumb{display:flex;min-width:0;align-items:center;gap:var(--sph-space-8px);overflow:hidden;white-space:nowrap;color:var(--muted);font-size:var(--font-size-support)}
	.crumb a,.crumb span{min-width:0;overflow:hidden;text-overflow:ellipsis}
	.crumb a{color:inherit;text-decoration:none}
	.crumb a:hover{color:var(--text)}
	.crumb b{font-weight:var(--sph-weight-600)}
	.app-header.collapsed{left:64px}
	.app-header.collapsed .menu svg{transform:rotate(180deg)}
	:global(html[data-asset-sidebar-collapsed='true']) .app-header{left:64px}
	:global(html[data-asset-sidebar-collapsed='true']) .menu svg{transform:rotate(180deg)}
	@media (max-width:760px), (min-width:701px) and (max-width:1024px) and (max-height:500px) and (any-pointer:coarse){.app-header,.app-header.collapsed,:global(html[data-asset-sidebar-collapsed='true']) .app-header{left:0;padding:0 var(--sph-space-16px)}.crumb{font-size:var(--font-size-support)}}
</style>
