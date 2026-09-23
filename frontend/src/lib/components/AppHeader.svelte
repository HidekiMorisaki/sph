<script lang="ts">
	import { onMount } from 'svelte';

	type Breadcrumb = { label: string; href?: string };
	type Theme = 'light' | 'dark';

	let {
		collapsed,
		breadcrumbs,
		onToggleSidebar
	}: {
		collapsed: boolean;
		breadcrumbs: Breadcrumb[];
		onToggleSidebar: () => void;
	} = $props();

	let theme = $state<Theme>('dark');

	function setTheme(value: Theme) {
		theme = value;
		document.documentElement.dataset.theme = value;
		localStorage.setItem('theme', value);
	}

	onMount(() => {
		theme = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
	});
</script>

<header class:collapsed class="app-header">
	<div class="head-left">
		<button
			class="menu"
			aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
			aria-pressed={collapsed}
			type="button"
			onclick={onToggleSidebar}
		>
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
				<path d="M4 6h16M4 12h16M4 18h16" />
			</svg>
		</button>
		<nav class="crumb" aria-label="Breadcrumb">
			{#each breadcrumbs as breadcrumb, index}
				{#if breadcrumb.href}<a href={breadcrumb.href}>{breadcrumb.label}</a>{:else}<span>{breadcrumb.label}</span>{/if}
				{#if index < breadcrumbs.length - 1}<b aria-hidden="true">›</b>{/if}
			{/each}
		</nav>
	</div>
	<button
		class="theme"
		aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
		type="button"
		onclick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
	>
		{#if theme === 'light'}
			<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" fill="none" stroke="currentColor" stroke-width="1.5" /></svg>
		{:else}
			<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="1.5" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" stroke="currentColor" stroke-width="1.5" /></svg>
		{/if}
	</button>
</header>

<style>
	.app-header{position:fixed;z-index:50;top:0;left:252px;right:0;height:56px;display:flex;align-items:center;justify-content:space-between;padding:0 28px;background:color-mix(in srgb,var(--surface) 85%,transparent);backdrop-filter:blur(14px);border-bottom:1px solid var(--border);transition:left .22s}
	.head-left{display:flex;align-items:center;gap:16px}
	.menu,.theme{display:grid;place-items:center;width:34px;height:34px;padding:7px;background:transparent;color:var(--muted);border:0;border-radius:4px;cursor:pointer;font:inherit}
	.menu:hover,.theme:hover{background:var(--bg)}
	.menu svg{width:18px;height:18px;transition:transform .2s}
	.theme svg{width:20px;height:20px}
	.crumb{display:flex;align-items:center;gap:8px;color:var(--muted);font-size:14px}
	.crumb a{color:inherit;text-decoration:none}
	.crumb a:hover{color:var(--text)}
	.crumb b{font-weight:600}
	.app-header.collapsed{left:64px}
	.app-header.collapsed .menu svg{transform:rotate(180deg)}
	:global(html[data-asset-sidebar-collapsed='true']) .app-header{left:64px}
	:global(html[data-asset-sidebar-collapsed='true']) .menu svg{transform:rotate(180deg)}
	@media(max-width:760px){.app-header{left:64px;padding:0 16px}.crumb{font-size:13px}}
</style>
