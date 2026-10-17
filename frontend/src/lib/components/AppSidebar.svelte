<script lang="ts">
	import { localeMessages, formatLocaleTemplate } from '$lib/locale-messages';
	import { onMount } from 'svelte';
	import { productName } from '$lib/brand';
	import favicon from '$lib/assets/favicon.svg';
	import { avatarImage } from '$lib/avatar';
	import { roleNames, type SessionUser } from '$lib/auth';
	import { clearExternalLinks, externalLinks, loadExternalLinks } from '$lib/externalLinks';
	import { formatEmployeeName, localization } from '$lib/localization';
	import { icons, menuIcon, groupIcon, localizedMenus, type Item, type MenuGroup } from './sidebarNavigation';
	import { sidebarGroupExpanded, type SidebarGroupState, type SidebarGroupId } from '$lib/sidebar-groups';

	let { collapsed, user, currentPath = '', onLogout, groupExpansion = {}, onToggleGroup }: { collapsed: boolean; user: SessionUser | null; currentPath?: string; onLogout: () => void | Promise<void>; groupExpansion?: SidebarGroupState; onToggleGroup?: (id: string) => void } = $props();
	const id = $props.id();
	const groupOpen = (groupId: string) => sidebarGroupExpanded(groupExpansion, groupId as SidebarGroupId);
	let animatedGroup = $state('');
	let groupAnimationTimer: ReturnType<typeof setTimeout> | undefined;
	function toggleGroup(groupId: string) {
		clearTimeout(groupAnimationTimer);
		animatedGroup = groupId;
		railLabel = '';
		railFlyout = '';
		onToggleGroup?.(groupId);
		groupAnimationTimer = setTimeout(() => animatedGroup = '', 220);
	}
	let navigationText = $derived(localeMessages[$localization.displayLanguage].navigation);
	let canManageMasters = $derived(Boolean(user?.capabilities.canManageMasters || user?.capabilities.canManageBranches));
	let sidebarMenus = $derived.by((): MenuGroup[] => localizedMenus($localization.displayLanguage).map((group) => group.id === 'general'
		? { ...group, items: group.items.filter((item) => (item.id !== 'workCalendars' || user?.capabilities.canReadCalendars) && (item.id !== 'teams' || user?.capabilities.canReadTeams) && (item.id !== 'skills' || user?.capabilities.canReadSkills) && (item.id !== 'clients' || user?.capabilities.canReadClients) && (item.id !== 'projects' || user?.capabilities.canReadProjects)) }
		: group.id === 'assets'
			? { ...group, items: group.items.filter((item) => item.id !== 'softwareLicenses' || user?.capabilities.canReadSoftware) }
		: group.id === 'siteManagement' && !user?.capabilities.canManageSystemSettings
			? { ...group, items: group.items.filter((item) => item.id === 'businessOverview' && user?.capabilities.canManageBranches) }
			: group).flatMap((group) => group.id === 'siteManagement' && $externalLinks.length
		? [{ id: 'otherSystems', label: navigationText.groups.otherSystems, items: $externalLinks.map((link): Item => ({ id: `external-${link.id}`, text: link.name, icon: 'external', href: link.url, external: true })) }, group]
		: [group]));
	let openMenu = $state('');
	let previousPath = '';
	let railFlyout = $state('');
	let railFlyoutTop = $state(0);
	let railLabel = $state('');
	let railLabelTop = $state(0);
	let userMenuOpen = $state(false);
	let compact = $state(false);
	let animateMenu = $state(false);
	let sidebarUser = $state<HTMLDivElement>();
	let animationTimer: ReturnType<typeof setTimeout> | undefined;
	function stopMenuAnimation() {
		clearTimeout(animationTimer);
		animateMenu = false;
	}
	function setOpenMenu(id: string) {
		openMenu = id;
	}
	function showRailLabel(text: string, event: Event) {
		if (!(collapsed || compact) || !(event.currentTarget instanceof HTMLElement)) return;
		const rect = event.currentTarget.getBoundingClientRect();
		railLabel = text;
		railLabelTop = rect.top + rect.height / 2;
	}
	function hideRailLabel(text: string) {
		if (railLabel === text) railLabel = '';
	}
	function toggle(item: Item, event: MouseEvent) {
		if (collapsed || compact) {
			railLabel = '';
			const triggerTop = event.currentTarget instanceof HTMLElement ? event.currentTarget.getBoundingClientRect().top : 0;
			const flyoutHeight = Math.min(window.innerHeight - 16, (item.children?.length ?? 0) * 34 + 14);
			railFlyoutTop = Math.max(8, Math.min(triggerTop, window.innerHeight - flyoutHeight - 8));
			railFlyout = railFlyout === item.id ? '' : item.id;
			return;
		}
		stopMenuAnimation();
		animateMenu = true;
		setOpenMenu(openMenu === item.id ? '' : item.id);
		animationTimer = setTimeout(() => animateMenu = false, 220);
	}
	$effect(() => {
		if (user) void loadExternalLinks();
		else clearExternalLinks();
	});
	$effect(() => {
		const path = currentPath;
		if (path === previousPath) return;
		previousPath = path;
		stopMenuAnimation();
		railFlyout = '';
		railLabel = '';
		userMenuOpen = false;
	});
	$effect(() => {
		if (!collapsed && !compact) {
			railLabel = '';
			railFlyout = '';
		}
	});
	$effect(() => {
		// Hover labels contain translated text; dismiss them when the language changes.
		void $localization.displayLanguage;
		railLabel = '';
	});
	onMount(() => {
		const query = matchMedia('(max-width: 760px)');
		compact = query.matches;
		const update = () => { compact = query.matches; railFlyout = ''; railLabel = ''; };
		const closeMenusOutside = (event: MouseEvent) => {
			if (event.target instanceof Node && !sidebarUser?.contains(event.target)) userMenuOpen = false;
			if (!(event.target instanceof Element) || !event.target.closest('.rail-flyout,.nav-toggle')) railFlyout = '';
		};
		query.addEventListener('change', update);
		document.addEventListener('click', closeMenusOutside);
		return () => {
			query.removeEventListener('change', update);
			document.removeEventListener('click', closeMenusOutside);
			clearTimeout(animationTimer);
			clearTimeout(groupAnimationTimer);
		};
	});
</script>

<aside class="app-sidebar" class:collapsed aria-label={navigationText.primaryNavigation}>
	<a class="brand" href="/" aria-label={productName}><img class="brand-icon" src={favicon} alt="" width="28" height="28" /><strong>{productName}</strong></a>
	<nav class="sidebar-nav" onscroll={() => { railFlyout = ''; railLabel = ''; }}>
		{#each user ? sidebarMenus : [] as group (group.id)}
			{#if (!group.managerOnly || canManageMasters) && (!group.systemAdministratorOnly || user?.capabilities.canManageSystemSettings || group.id === 'siteManagement' && user?.capabilities.canManageBranches)}
			<div class="nav-group" data-group-id={group.id} class:group-open={groupOpen(group.id)} class:group-animate={animatedGroup === group.id}>
				<button class="nav-label group-toggle" type="button" aria-label={group.label} aria-expanded={groupOpen(group.id)} aria-controls={`${id}-group-${group.id}`} onmouseenter={event => showRailLabel(group.label,event)} onmouseleave={() => hideRailLabel(group.label)} onfocus={event => showRailLabel(group.label,event)} onblur={() => hideRailLabel(group.label)} onclick={() => toggleGroup(group.id)}><span class="group-icon" aria-hidden="true">{@html groupIcon(group.id)}</span><span class="group-title">{group.label}</span><svg class="group-chevron" viewBox="0 0 20 20" aria-hidden="true"><path d="m7 4 6 6-6 6" /></svg></button>
				<div class="group-content" id={`${id}-group-${group.id}`} inert={!groupOpen(group.id)} aria-hidden={!groupOpen(group.id)}><div class="group-items">
				{#each group.items as item}
					{#if item.children}
						<div class:open={openMenu === item.id} class:animate={animateMenu} class="nav-tree">
							<button class="nav-link nav-toggle" type="button" aria-expanded={collapsed || compact ? railFlyout === item.id : openMenu === item.id} onmouseenter={(event) => showRailLabel(item.text, event)} onmouseleave={() => hideRailLabel(item.text)} onfocus={(event) => showRailLabel(item.text, event)} onblur={() => hideRailLabel(item.text)} onclick={(event) => toggle(item, event)}>{@html menuIcon(item)}<span class="nav-text">{item.text}</span>{#if item.badge}<em class:hot={item.badge === 'Hot'} class="badge">{item.badge}</em>{/if}<i class="nav-chev">›</i></button>
							<div class="nav-sub"><div class="nav-sub-inner">{#each item.children as child}<a class:active={currentPath === child.href} class="nav-sublink" href={child.href} onclick={stopMenuAnimation}>{child.text}</a>{/each}</div></div>
							{#if (collapsed || compact) && railFlyout === item.id}<div class="rail-flyout" style:top="{railFlyoutTop}px">{#each item.children as child}<a href={child.href} onclick={stopMenuAnimation}>{child.text}</a>{/each}</div>{/if}
						</div>
					{:else}<a class:active={!item.external && currentPath === item.href} class="nav-link" href={item.href} target={item.external ? '_blank' : undefined} rel={item.external ? 'noopener noreferrer' : undefined} aria-label={item.external ? formatLocaleTemplate(navigationText.openExternal, item.text) : undefined} onmouseenter={(event) => showRailLabel(item.text, event)} onmouseleave={() => hideRailLabel(item.text)} onfocus={(event) => showRailLabel(item.text, event)} onblur={() => hideRailLabel(item.text)}>{@html menuIcon(item)}<span class="nav-text">{item.text}</span>{#if item.badge}<em class:hot={item.badge === 'Hot'} class="badge">{item.badge}</em>{/if}</a>{/if}
				{/each}
				</div></div>
			</div>
			{/if}
		{/each}
	</nav>
	{#if (collapsed || compact) && railLabel}<div class="rail-label" style:top="{railLabelTop}px" role="tooltip">{railLabel}</div>{/if}
	{#if user}
		<div class="sidebar-footer">
			<div class="sidebar-user" bind:this={sidebarUser}>
				<button class="account-trigger" type="button" aria-label={userMenuOpen ? navigationText.closeAccount : navigationText.openAccount} aria-haspopup="menu" aria-expanded={userMenuOpen} onclick={() => userMenuOpen = !userMenuOpen}>
					<span class="avatar">{#if $avatarImage}<img src={$avatarImage} alt="" />{:else}{user.username.slice(0, 1).toUpperCase()}{/if}<i></i></span>
					<span class="sidebar-user-info"><b>{formatEmployeeName(user, $localization) || user.username}</b><small>{roleNames(user)}</small></span>
					<span class="more-icon" aria-hidden="true"><svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><circle cx="8" cy="3" r="1.2"/><circle cx="8" cy="8" r="1.2"/><circle cx="8" cy="13" r="1.2"/></svg></span>
				</button>
				{#if userMenuOpen}<div class="menu-popover user-menu" role="menu"><a href="/my-page" role="menuitem" aria-current={currentPath === '/my-page' ? 'page' : undefined} onclick={() => userMenuOpen = false}>{@html icons.myPage}{navigationText.items.myPage}</a><a href="/personal-settings" role="menuitem" aria-current={currentPath === '/personal-settings' ? 'page' : undefined} onclick={() => userMenuOpen = false}>{@html icons.settings}{navigationText.settings}</a><button type="button" role="menuitem" onclick={onLogout}>{@html icons.signOut}{navigationText.signOut}</button></div>{/if}
			</div>
		</div>
	{/if}
</aside>

<style>
	.group-toggle{position:relative;display:flex;align-items:center;gap:8px;width:100%;min-height:40px;border:0;border-radius:4px;background:transparent;text-align:left;cursor:pointer;font-family:inherit}.group-toggle:hover{background:#ffffff0c;color:#fff}.group-toggle:focus-visible{outline:2px solid var(--primary);outline-offset:-2px}.group-title{flex:1;min-width:0;overflow-wrap:anywhere}.group-icon{display:none;place-items:center;width:18px;height:18px;flex:none}.group-icon :global(svg){width:18px;height:18px}.group-chevron{width:14px;height:14px;flex:none;fill:none;stroke:currentColor;stroke-width:1.6}.group-open>.group-toggle .group-chevron{transform:rotate(90deg)}.group-content{display:grid;grid-template-rows:0fr;visibility:hidden}.group-items{min-height:0;overflow:hidden}.group-open>.group-content{grid-template-rows:1fr;visibility:visible}.group-animate>.group-content{transition:grid-template-rows .2s}.group-animate>.group-toggle .group-chevron{transition:transform .2s}
	@media(prefers-reduced-motion:reduce){.group-animate>.group-content,.group-animate>.group-toggle .group-chevron{transition:none}}
	aside{position:fixed;inset:0 auto 0 0;display:flex;flex-direction:column;width:252px;overflow:hidden;background:var(--sidebar);color:#fff;z-index:60;transition:width .22s}
	.brand{height:56px;display:flex;align-items:center;gap:10px;padding:0 16px;border-bottom:1px solid #ffffff14;flex-shrink:0;color:#fff;text-decoration:none}.brand-icon{display:block;width:28px;height:28px;flex:none}.brand strong{font-size:var(--font-size-body);font-weight:600;letter-spacing:-.2px}
	.sidebar-nav{flex:1;overflow-y:auto;padding:8px 0;scrollbar-color:auto;scrollbar-width:auto}.sidebar-nav::-webkit-scrollbar{width:3px}.sidebar-nav::-webkit-scrollbar-track{background:transparent}.sidebar-nav::-webkit-scrollbar-thumb{background:#ffffff14;border-radius:3px}.nav-group{padding:0 8px;margin-bottom:2px}.nav-label{margin:4px 0 0;padding:8px 12px;color:var(--sidebar-muted,#adbed0);font-size:var(--font-size-support);font-weight:600;letter-spacing:.5px}
	.nav-link{position:relative;display:flex;align-items:center;gap:10px;width:100%;min-height:32px;margin-bottom:1px;padding:6px 12px;background:transparent;border:0;border-radius:4px;color:var(--sidebar-muted, #7b8fa3);font-size:var(--font-size-body);font-weight:400;text-decoration:none;text-align:left;cursor:pointer}.nav-link:hover,.nav-link.active{background:#ffffff0c;color:#fff}.nav-link :global(.nav-icon){width:18px;height:18px;flex:none;opacity:.5}.nav-link:hover :global(.nav-icon),.nav-link.active :global(.nav-icon){opacity:.85}
	.badge{margin-left:auto;padding:1px 6px;border-radius:3px;background:#1abb9c20;color:var(--primary);font-size:var(--font-size-support);font-weight:600;font-style:normal;line-height:1.6}.badge.hot{background:#d6393926;color:#f87171}.nav-chev{margin-left:auto;opacity:.55;font-style:normal}.nav-tree.animate .nav-chev{transition:transform .2s,opacity .12s}.nav-tree.open .nav-chev{transform:rotate(90deg);opacity:1}.nav-sub{display:grid;grid-template-rows:0fr;margin:0 0 4px 20px;border-left:1px solid #ffffff12}.nav-tree.animate .nav-sub{transition:grid-template-rows .2s}.nav-tree.open .nav-sub{grid-template-rows:1fr}.nav-sub-inner{min-height:0;overflow:hidden}.nav-sublink{position:relative;display:flex;padding:7px 12px;color:var(--sidebar-muted, #7b8fa3);font-size:var(--font-size-body);text-decoration:none}.nav-sublink::before{position:absolute;left:-9px;top:50%;width:8px;height:1px;background:#ffffff1f;content:''}.nav-sublink:hover,.nav-sublink.active{color:#fff;background:#ffffff0c}.nav-sublink.active::before{left:-13px;width:12px;background:var(--primary)}
	.sidebar-footer{padding:8px;border-top:1px solid #ffffff14;flex-shrink:0}
	.sidebar-user{position:relative;border-radius:4px}
	.account-trigger{display:flex;align-items:center;gap:10px;width:100%;min-height:48px;padding:8px;border:0;border-radius:4px;background:transparent;color:#fff;text-align:left;cursor:pointer}
	.account-trigger:hover{background:#ffffff0c}
	.account-trigger:focus-visible{outline:2px solid var(--primary);outline-offset:2px}
	.avatar{position:relative;display:grid;place-items:center;width:32px;height:32px;flex:none;border-radius:50%;background:linear-gradient(135deg,var(--primary),#168b76);font-size:var(--font-size-support);font-weight:600}
	.avatar img{width:100%;height:100%;border-radius:50%;object-fit:cover}
	.avatar i{position:absolute;right:-1px;bottom:-1px;width:8px;height:8px;border:2px solid var(--sidebar);border-radius:50%;background:#42c885}
	.sidebar-user-info{flex:1;min-width:0}
	.sidebar-user-info b{display:block;overflow:hidden;color:#fff;font-size:var(--font-size-body);font-weight:500;line-height:1.2;text-overflow:ellipsis;white-space:nowrap}
	.sidebar-user-info small{display:block;margin-top:2px;color:var(--sidebar-muted, #7b8fa3);font-size:var(--font-size-support);line-height:1.2}
	.more-icon{display:grid;place-items:center;width:24px;height:24px;flex:none;margin-left:auto;color:var(--sidebar-muted, #7b8fa3)}
	.user-menu{position:absolute;right:8px;bottom:58px;z-index:70;width:188px}
	.user-menu :global(.nav-icon){width:18px;height:18px;flex:none;color:var(--sidebar-muted,#7b8fa3);opacity:.5}
	.user-menu [role='menuitem']:hover :global(.nav-icon),.user-menu [role='menuitem']:focus-visible :global(.nav-icon){color:var(--text);opacity:.85}
	.user-menu a{margin:0;padding:7px 10px;color:var(--text);border-radius:4px;font-size:var(--font-size-body);line-height:1.4286;text-decoration:none}.user-menu a:hover,.user-menu a:focus-visible{background:var(--surface-secondary)}.user-menu a:hover{background:var(--surface-hover,var(--surface-secondary))}
	.rail-flyout{position:fixed;left:72px;z-index:100;display:grid;min-width:180px;max-height:calc(100dvh - 16px);overflow-y:auto;padding:6px;background:var(--surface);border:1px solid var(--border);border-radius:5px;box-shadow:var(--shadow)}.rail-flyout a{padding:8px;color:var(--text);font-size:var(--font-size-body);text-decoration:none}.rail-flyout a:hover{background:var(--surface-hover,var(--bg))}
	.rail-label{position:fixed;left:76px;z-index:110;padding:5px 9px;border-radius:4px;background:#182230;color:#fff;font-size:var(--font-size-support);line-height:1.4286;pointer-events:none;transform:translateY(-50%);white-space:nowrap}
	aside.collapsed{width:64px;overflow:visible}
	aside.collapsed .sidebar-nav{overflow-y:auto}
	aside.collapsed .brand strong,aside.collapsed .group-title,aside.collapsed .nav-text,aside.collapsed .badge,aside.collapsed .nav-chev,aside.collapsed .nav-sub,aside.collapsed .sidebar-user-info,aside.collapsed .more-icon{display:none}
	aside.collapsed .group-icon{display:grid}aside.collapsed .group-toggle{justify-content:center;padding:8px}aside.collapsed .group-chevron{position:absolute;right:1px;bottom:5px;width:10px;height:10px}
	aside.collapsed .nav-link{justify-content:center;gap:0;padding:8px}
	aside.collapsed .account-trigger{justify-content:center;padding:8px}
	aside.collapsed .user-menu{left:calc(100% + 8px);right:auto;bottom:0;max-height:calc(100vh - 16px);overflow-y:auto}
	@media(max-width:760px){
		aside{width:64px;overflow:visible}
		.brand strong,.group-title,.nav-text,.badge,.nav-chev,.nav-sub,.sidebar-user-info,.more-icon{display:none}
		.group-icon{display:grid}.group-toggle{justify-content:center;padding:8px}.group-chevron{position:absolute;right:1px;bottom:5px;width:10px;height:10px}
		.nav-link{justify-content:center;padding:10px}
		.sidebar-nav{overflow-y:auto}
		.rail-flyout{display:grid}
		.account-trigger{justify-content:center;padding:8px}
		.user-menu{left:calc(100% + 8px);right:auto;bottom:0;max-height:calc(100vh - 16px);overflow-y:auto}
	}
	aside button.nav-link,aside button.account-trigger{background:transparent}
	aside button.nav-link:hover,aside button.account-trigger:hover{background:#ffffff0c}
</style>
