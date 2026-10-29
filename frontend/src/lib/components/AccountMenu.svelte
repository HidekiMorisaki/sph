<script lang="ts">
	import { tick } from 'svelte';
	import { page } from '$app/state';
	import { avatarImage } from '$lib/avatar';
	import { localization } from '$lib/localization';
	import { localeMessages } from '$lib/locale-messages';
	import type { SessionUser } from '$lib/auth';
	import { icons } from './sidebarNavigation';

	let { user, onLogout }: { user: SessionUser; onLogout: () => void | Promise<void> } = $props();
	const id = $props.id();
	let text = $derived(localeMessages[$localization.displayLanguage].navigation);
	let employeeId = $derived(user.id);
	let open = $state(false);
	let container = $state<HTMLDivElement>();
	let trigger = $state<HTMLButtonElement>();
	let menu = $state<HTMLDivElement>();
	let failedImage = $state<string | null>(null);
	let image = $derived($avatarImage && $avatarImage !== failedImage ? $avatarImage : null);

	function close(restoreFocus = false) {
		open = false;
		if (restoreFocus) trigger?.focus();
	}
	async function show(last = false) {
		open = true;
		await tick();
		const items = menu?.querySelectorAll<HTMLElement>('[role="menuitem"]');
		items?.[last ? items.length - 1 : 0]?.focus();
	}
	function triggerKeydown(event: KeyboardEvent) {
		if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return;
		event.preventDefault();
		void show(event.key === 'ArrowUp');
	}
	function keydown(event: KeyboardEvent) {
		if (!open || event.defaultPrevented) return;
		if (event.key === 'Escape') { event.preventDefault(); close(true); return; }
		if (!(event.target instanceof Node) || !menu?.contains(event.target)) return;
		if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
		event.preventDefault();
		const items = [...menu.querySelectorAll<HTMLElement>('[role="menuitem"]')];
		const index = items.indexOf(document.activeElement as HTMLElement);
		const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
		items[next]?.focus();
	}
	function outside(event: MouseEvent | FocusEvent) {
		if (event.target instanceof Node && !container?.contains(event.target)) close();
	}
	$effect(() => { void page.url.href; void employeeId; close(); });
</script>

<svelte:window onclick={outside} onfocusin={outside} onkeydown={keydown} />

<div class="header-account" bind:this={container}>
	<button bind:this={trigger} id={`${id}-trigger`} class="account-trigger" type="button" aria-label={open ? text.closeAccount : text.openAccount} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? `${id}-menu` : undefined} onclick={() => open ? close() : void show()} onkeydown={triggerKeydown}>
		<span class="avatar" aria-hidden="true">
			{#if image}<img src={image} alt="" onerror={() => failedImage = image} />
			{:else}<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="8" r="3.5" /><path d="M5 21v-2a7 7 0 0 1 14 0v2" /></svg>{/if}
		</span>
	</button>
	{#if open}
		<div bind:this={menu} id={`${id}-menu`} class="menu-popover user-menu" role="menu" aria-labelledby={`${id}-trigger`}>
			<a href="/my-page" role="menuitem" tabindex="-1" aria-current={page.url.pathname === '/my-page' ? 'page' : undefined} onclick={() => close()}>{@html icons.myPage}{text.items.myPage}</a>
			<a href="/personal-settings" role="menuitem" tabindex="-1" aria-current={page.url.pathname === '/personal-settings' ? 'page' : undefined} onclick={() => close()}>{@html icons.settings}{text.settings}</a>
			<button type="button" role="menuitem" tabindex="-1" onclick={() => { close(); void onLogout(); }}>{@html icons.signOut}{text.signOut}</button>
		</div>
	{/if}
</div>

<style>
	.header-account{position:relative;flex:none}
	.account-trigger{display:grid;place-items:center;width:34px;height:34px;margin:0;padding:var(--sph-space-1px);border:0;border-radius:50%;background:transparent;color:var(--muted);cursor:pointer}
	.account-trigger:hover,.account-trigger[aria-expanded='true']{background:var(--surface-hover)}
	.account-trigger:focus-visible{outline:2px solid var(--action-primary);outline-offset:2px}
	.avatar{display:grid;place-items:center;width:32px;height:32px;border-radius:50%;overflow:hidden}
	.avatar img{display:block;width:100%;height:100%;object-fit:cover}
	.avatar svg{width:22px;height:22px}
	.user-menu{position:absolute;top:calc(100% + 8px);right:0;width:220px;min-width:0;max-width:calc(100vw - 24px);max-height:calc(100dvh - 72px);overflow-y:auto}
	.user-menu :global(.nav-icon){width:18px;height:18px;flex:none;color:var(--muted);opacity:.5}
	.user-menu [role='menuitem']:hover :global(.nav-icon),.user-menu [role='menuitem']:focus-visible :global(.nav-icon){color:var(--text);opacity:.85}
	.user-menu [role='menuitem']:focus-visible{outline:2px solid var(--action-primary);outline-offset:-2px}
</style>
