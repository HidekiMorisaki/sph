<script lang="ts">
	import { onMount } from 'svelte';
	import { productName } from '$lib/brand';
	import { icons, isExpandableMenu, menus, parentMenuForPath, roleLabels, type Item } from './sidebarNavigation';

	type User = { username: string; name: string | null; role: string };
	let { collapsed, user, currentPath = '', home = false, onLogout }: { collapsed: boolean; user: User | null; currentPath?: string; home?: boolean; onLogout: () => void | Promise<void> } = $props();
	let canManageMasters = $derived(user?.role === 'system_administrator' || user?.role === 'business_administrator');
	const openMenuStorageKey = 'asset-sidebar-open-menu';
	let chosenMenu = $state<string | null>(null);
	let openMenu = $derived(chosenMenu ?? parentMenuForPath(currentPath) ?? '');
	let previousPath = '';
	let railFlyout = $state('');
	let userMenuOpen = $state(false);
	let compact = $state(false);
	let animateMenu = $state(false);
	let animationTimer: ReturnType<typeof setTimeout> | undefined;
	function stopMenuAnimation() {
		clearTimeout(animationTimer);
		animateMenu = false;
	}
	function rememberOpenMenu(text: string) {
		chosenMenu = text;
		localStorage.setItem(openMenuStorageKey, text);
	}
	function toggle(item: Item) {
		if (collapsed || compact) { railFlyout = railFlyout === item.text ? '' : item.text; return; }
		stopMenuAnimation();
		animateMenu = true;
		rememberOpenMenu(openMenu === item.text ? '' : item.text);
		animationTimer = setTimeout(() => animateMenu = false, 220);
	}
	$effect(() => {
		const path = currentPath;
		if (path === previousPath) return;
		previousPath = path;
		stopMenuAnimation();
		const parent = parentMenuForPath(path);
		if (parent) rememberOpenMenu(parent);
	});
	onMount(() => {
		const saved = localStorage.getItem(openMenuStorageKey);
		const legacy = localStorage.getItem('home-masters-open') === 'true' ? 'Master management' : '';
		const fallback = saved === '' || (saved !== null && isExpandableMenu(saved)) ? saved : legacy;
		rememberOpenMenu(parentMenuForPath(currentPath) ?? fallback);
		localStorage.removeItem('home-masters-open');
		const query = matchMedia('(max-width: 760px)');
		compact = query.matches;
		const update = () => { compact = query.matches; railFlyout = ''; };
		query.addEventListener('change', update);
		return () => { query.removeEventListener('change', update); clearTimeout(animationTimer); };
	});
</script>

<aside class="app-sidebar" class:collapsed aria-label="Primary navigation">
	{#if home}<div class="brand"><span class="brand-icon">S</span><strong>{productName}</strong></div>{:else}<a class="brand" href="/"><span class="brand-icon">S</span><strong>{productName}</strong></a>{/if}
	<nav class="sidebar-nav">
		{#each menus as group}
			{#if group.label !== 'ADMIN' || canManageMasters}
			<div class="nav-group"><p class="nav-label">{group.label}</p>
				{#each group.items as item}
					{#if item.href !== '/system-settings' || user?.role === 'system_administrator'}
					{#if item.children}
						<div class:open={openMenu === item.text} class:animate={animateMenu} class="nav-tree">
							<button class="nav-link nav-toggle" type="button" data-rail-label={item.text} aria-expanded={collapsed || compact ? railFlyout === item.text : openMenu === item.text} onclick={() => toggle(item)}>{@html icons[item.icon]}<span class="nav-text">{item.text}</span>{#if item.badge}<em class:hot={item.badge === 'Hot'} class="badge">{item.badge}</em>{/if}<i class="nav-chev">›</i></button>
							<div class="nav-sub"><div class="nav-sub-inner">{#each item.children as child}<a class:active={currentPath === child.href} class="nav-sublink" href={child.href} onclick={stopMenuAnimation}>{child.text}</a>{/each}</div></div>
							{#if (collapsed || compact) && railFlyout === item.text}<div class="rail-flyout">{#each item.children as child}<a href={child.href} onclick={stopMenuAnimation}>{child.text}</a>{/each}</div>{/if}
						</div>
					{:else}<a class:active={currentPath === item.href} class="nav-link" data-rail-label={item.text} href={item.href}>{@html icons[item.icon]}<span class="nav-text">{item.text}</span>{#if item.badge}<em class:hot={item.badge === 'Hot'} class="badge">{item.badge}</em>{/if}</a>{/if}
					{/if}
				{/each}
			</div>
			{/if}
		{/each}
	</nav>
	{#if user}
		<div class="sidebar-footer">
			<div class="sidebar-user">
				<button class="account-trigger" type="button" aria-label={userMenuOpen ? 'Close account menu' : 'Open account menu'} aria-haspopup="menu" aria-expanded={userMenuOpen} onclick={() => userMenuOpen = !userMenuOpen}>
					<span class="avatar">{user.username.slice(0, 1).toUpperCase()}<i></i></span>
					<span class="sidebar-user-info"><b>{user.name ?? user.username}</b><small>{roleLabels[user.role] ?? user.role}</small></span>
					<span class="more-icon" aria-hidden="true"><svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><circle cx="8" cy="3" r="1.2"/><circle cx="8" cy="8" r="1.2"/><circle cx="8" cy="13" r="1.2"/></svg></span>
				</button>
				{#if userMenuOpen}<div class="user-menu" role="menu"><a href="/settings">Account Settings</a><button type="button" onclick={onLogout}>Sign out</button></div>{/if}
			</div>
		</div>
	{/if}
</aside>

<style>
	aside{position:fixed;inset:0 auto 0 0;display:flex;flex-direction:column;width:252px;overflow:hidden;background:var(--sidebar);color:#fff;z-index:60;transition:width .22s}
	.brand{height:56px;display:flex;align-items:center;gap:10px;padding:0 16px;border-bottom:1px solid #ffffff14;flex-shrink:0;color:#fff;text-decoration:none}.brand-icon{display:grid;place-items:center;width:28px;height:28px;background:var(--primary);border-radius:6px;font-size:13px;font-weight:700}.brand strong{font-size:15px;font-weight:600;letter-spacing:-.2px}
	.sidebar-nav{flex:1;overflow-y:auto;padding:8px 0;scrollbar-color:auto;scrollbar-width:auto}.sidebar-nav::-webkit-scrollbar{width:3px}.sidebar-nav::-webkit-scrollbar-track{background:transparent}.sidebar-nav::-webkit-scrollbar-thumb{background:#ffffff14;border-radius:3px}.nav-group{padding:0 8px;margin-bottom:2px}.nav-label{margin:0;padding:16px 12px 4px;color:#7b8fa380;font-size:11px;font-weight:600;letter-spacing:.5px}
	.nav-link{position:relative;display:flex;align-items:center;gap:10px;width:100%;min-height:32px;margin-bottom:1px;padding:6px 12px;background:transparent;border:0;border-radius:4px;color:var(--sidebar-muted, #7b8fa3);font-size:14px;font-weight:400;text-decoration:none;text-align:left;cursor:pointer}.nav-link:hover,.nav-link.active{background:#ffffff0c;color:#fff}.nav-link :global(.nav-icon){width:18px;height:18px;flex:none;opacity:.5}.nav-link:hover :global(.nav-icon),.nav-link.active :global(.nav-icon){opacity:.85}
	.badge{margin-left:auto;padding:1px 6px;border-radius:3px;background:#1abb9c20;color:var(--primary);font-size:10px;font-weight:600;font-style:normal;line-height:1.6}.badge.hot{background:#d6393926;color:#f87171}.nav-chev{margin-left:auto;opacity:.55;font-style:normal}.nav-tree.animate .nav-chev{transition:transform .2s,opacity .12s}.nav-tree.open .nav-chev{transform:rotate(90deg);opacity:1}.nav-sub{display:grid;grid-template-rows:0fr;margin:0 0 4px 20px;border-left:1px solid #ffffff12}.nav-tree.animate .nav-sub{transition:grid-template-rows .2s}.nav-tree.open .nav-sub{grid-template-rows:1fr}.nav-sub-inner{min-height:0;overflow:hidden}.nav-sublink{position:relative;display:flex;padding:7px 12px;color:var(--sidebar-muted, #7b8fa3);font-size:13px;text-decoration:none}.nav-sublink::before{position:absolute;left:-9px;top:50%;width:8px;height:1px;background:#ffffff1f;content:''}.nav-sublink:hover,.nav-sublink.active{color:#fff;background:#ffffff0c}.nav-sublink.active::before{left:-13px;width:12px;background:var(--primary)}
	.sidebar-footer{padding:8px;border-top:1px solid #ffffff14;flex-shrink:0}
	.sidebar-user{position:relative;border-radius:4px}
	.account-trigger{display:flex;align-items:center;gap:10px;width:100%;min-height:48px;padding:8px;border:0;border-radius:4px;background:transparent;color:#fff;text-align:left;cursor:pointer}
	.account-trigger:hover{background:#ffffff0c}
	.account-trigger:focus-visible{outline:2px solid var(--primary);outline-offset:2px}
	.avatar{position:relative;display:grid;place-items:center;width:32px;height:32px;flex:none;border-radius:50%;background:linear-gradient(135deg,var(--primary),#168b76);font-size:12px;font-weight:600}
	.avatar i{position:absolute;right:-1px;bottom:-1px;width:8px;height:8px;border:2px solid var(--sidebar);border-radius:50%;background:#42c885}
	.sidebar-user-info{flex:1;min-width:0}
	.sidebar-user-info b{display:block;overflow:hidden;color:#fff;font-size:13px;font-weight:500;line-height:1.2;text-overflow:ellipsis;white-space:nowrap}
	.sidebar-user-info small{display:block;margin-top:2px;color:var(--sidebar-muted, #7b8fa3);font-size:12px;line-height:1.2}
	.more-icon{display:grid;place-items:center;width:24px;height:24px;flex:none;margin-left:auto;color:var(--sidebar-muted, #7b8fa3)}
	.user-menu{position:absolute;right:8px;bottom:58px;z-index:70;display:grid;width:188px;padding:6px;background:var(--sidebar);border:1px solid #ffffff14;border-radius:6px;box-shadow:var(--shadow)}.user-menu a,.user-menu button{padding:8px;background:transparent;border:0;color:var(--sidebar-muted, #7b8fa3);font-size:14px;text-align:left;text-decoration:none;cursor:pointer}.user-menu a:hover,.user-menu button:hover{background:#ffffff0c;color:#fff}.user-menu a:focus-visible,.user-menu button:focus-visible{outline:2px solid var(--primary);outline-offset:-2px}
	.rail-flyout{position:absolute;top:0;left:calc(100% + 8px);z-index:100;display:grid;min-width:180px;padding:6px;background:var(--surface);border:1px solid var(--border);border-radius:5px;box-shadow:var(--shadow)}.rail-flyout a{padding:8px;color:var(--text);font-size:12px;text-decoration:none}.rail-flyout a:hover{background:var(--bg)}
	aside.collapsed{width:64px;overflow:visible}
	aside.collapsed .sidebar-nav{overflow:visible}
	aside.collapsed .brand strong,aside.collapsed .nav-label,aside.collapsed .nav-text,aside.collapsed .badge,aside.collapsed .nav-chev,aside.collapsed .nav-sub,aside.collapsed .sidebar-user-info,aside.collapsed .more-icon{display:none}
	aside.collapsed .nav-link{justify-content:center;gap:0;padding:8px}
	aside.collapsed .account-trigger{justify-content:center;padding:8px}
	aside.collapsed .user-menu{left:calc(100% + 8px);right:auto;bottom:0;max-height:calc(100vh - 16px);overflow-y:auto}
	aside.collapsed .nav-link[data-rail-label]::after{position:absolute;left:calc(100% + 12px);top:50%;z-index:110;padding:5px 9px;border-radius:4px;background:#182230;color:#fff;content:attr(data-rail-label);font-size:12px;opacity:0;pointer-events:none;transform:translateY(-50%) translateX(-4px);transition:opacity .12s,transform .12s;white-space:nowrap}
	aside.collapsed .nav-link[data-rail-label]:hover::after{opacity:1;transform:translateY(-50%) translateX(0)}
	@media(max-width:760px){
		aside{width:64px;overflow:visible}
		.brand strong,.nav-label,.nav-text,.badge,.nav-chev,.nav-sub,.sidebar-user-info,.more-icon{display:none}
		.nav-link{justify-content:center;padding:10px}
		.sidebar-nav{overflow:visible}
		.rail-flyout{display:grid}
		.account-trigger{justify-content:center;padding:8px}
		.user-menu{left:calc(100% + 8px);right:auto;bottom:0;max-height:calc(100vh - 16px);overflow-y:auto}
	}
	aside button.nav-link,aside button.account-trigger,aside .user-menu button{background:transparent}
	aside button.nav-link:hover,aside button.account-trigger:hover{background:#ffffff0c}
	aside .user-menu button:hover{background:#ffffff0c;color:#fff}
</style>
