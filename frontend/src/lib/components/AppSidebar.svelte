<script lang="ts">
	import { COMPACT_NAVIGATION_QUERY } from '#lib/responsive-layout.js';
	import { localeMessages, formatLocaleTemplate } from '#lib/locale-messages.js';
	import { onMount } from 'svelte';
	import { productName } from '#lib/brand.js';
	import favicon from '#lib/assets/favicon.svg';
	import { canOperate, type SessionUser } from '#lib/auth.js';
	import { clearExternalLinks, externalLinks, loadExternalLinks } from '#lib/externalLinks.js';
	import { localization } from '#lib/localization.js';
	import { menuIcon, groupIcon, localizedMenus, type Item, type MenuGroup } from './sidebarNavigation';
	import { sidebarGroupExpanded, type SidebarGroupState, type SidebarGroupId } from '#lib/sidebar-groups.js';

	let { forceExpanded = false, collapsed, user, currentPath = '', groupExpansion = {}, onToggleGroup }: { forceExpanded?: boolean; collapsed: boolean; user: SessionUser | null; currentPath?: string; groupExpansion?: SidebarGroupState; onToggleGroup?: (id: string) => void } = $props();
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
	let sidebarMenus = $derived.by((): MenuGroup[] => localizedMenus($localization.displayLanguage).map((group) => group.id === 'dashboard'
		? { ...group, items: group.items.filter(item => item.id !== 'assetOverview' || user?.capabilities.canReadAssets) }
		: group.id === 'projects'
        ? {...group,items:group.items.filter(item=>canOperate(user,'projects.read'))}
        : group.id === 'general'
		? { ...group, items: group.items.filter((item) => (item.id !== 'projects' || canOperate(user,'projects.read')) && (item.id !== 'workflows' || canOperate(user,'workflows.read')) && (item.id !== 'schedule' || canOperate(user,'schedule.read')) && (item.id !== 'workCalendars' || user?.capabilities.canReadCalendars) && (item.id !== 'teams' || user?.capabilities.canReadTeams) && (item.id !== 'skills' || user?.capabilities.canReadSkills) && (item.id !== 'clients' || user?.capabilities.canReadClients) && (item.id !== 'engagements' || user?.capabilities.canReadEngagements)) }
		: group.id === 'assets'
			? { ...group, items: group.items.filter((item) => item.id !== 'softwareLicenses' || user?.capabilities.canReadSoftware) }
			: group).flatMap((group) => group.id === 'siteManagement' && $externalLinks.length
		? [{ id: 'otherSystems', label: navigationText.groups.otherSystems, items: $externalLinks.map((link): Item => ({ id: `external-${link.id}`, text: link.name, icon: 'external', href: link.url, external: true })) }, group]
		: [group]));
	let openMenu = $state('');
	let previousPath = '';
	let railFlyout = $state('');
	let railFlyoutTop = $state(0);
	let railLabel = $state('');
	let railLabelTop = $state(0);
	let compact = $state(false);
	let animateMenu = $state(false);
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
		const query = matchMedia(COMPACT_NAVIGATION_QUERY);
		compact = query.matches && !forceExpanded;
		const update = () => { compact = query.matches && !forceExpanded; railFlyout = ''; railLabel = ''; };
		const closeMenusOutside = (event: MouseEvent) => {
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

<aside class="app-sidebar" class:force-expanded={forceExpanded} class:collapsed aria-label={navigationText.primaryNavigation}>
	<a class="brand" href="/" aria-label={productName}><img class="brand-icon" src={favicon} alt="" width="28" height="28" /><strong>{productName}</strong></a>
	<nav class="sidebar-nav" onscroll={() => { railFlyout = ''; railLabel = ''; }}>
		{#each user ? sidebarMenus : [] as group (group.id)}
			{#if group.items.length && (!group.systemAdministratorOnly || user?.capabilities.canManageSystemSettings)}
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
					{:else}<a class:active={!item.external && (currentPath === item.href || item.id==='projects' && /^\/projects\/[A-Z][A-Z0-9_]{0,63}\//.test(currentPath))} class="nav-link" href={item.href} target={item.external ? '_blank' : undefined} rel={item.external ? 'noopener noreferrer' : undefined} aria-label={item.external ? formatLocaleTemplate(navigationText.openExternal, item.text) : undefined} onmouseenter={(event) => showRailLabel(item.text, event)} onmouseleave={() => hideRailLabel(item.text)} onfocus={(event) => showRailLabel(item.text, event)} onblur={() => hideRailLabel(item.text)}>{@html menuIcon(item)}<span class="nav-text">{item.text}</span>{#if item.badge}<em class:hot={item.badge === 'Hot'} class="badge">{item.badge}</em>{/if}</a>{/if}
				{/each}
				</div></div>
			</div>
			{/if}
		{/each}
	</nav>
	{#if (collapsed || compact) && railLabel}<div class="rail-label" style:top="{railLabelTop}px" role="tooltip">{railLabel}</div>{/if}

</aside>

<style>
	.group-toggle{position:relative;display:flex;align-items:center;gap:var(--sph-space-8px);width:100%;min-height:40px;border:0;border-radius:var(--sph-radius-4px);background:transparent;text-align:left;cursor:pointer;font-family:inherit}.group-toggle:hover{background:var(--sph-color-sidebar-hover);color:var(--sph-color-on-emphasis)}.group-toggle:focus-visible{outline:2px solid var(--primary);outline-offset:-2px}.group-title{flex:1;min-width:0;overflow-wrap:anywhere}.group-icon{display:none;place-items:center;width:18px;height:18px;flex:none}.group-icon :global(svg){width:18px;height:18px}.group-chevron{width:14px;height:14px;flex:none;fill:none;stroke:currentColor;stroke-width:1.6}.group-open>.group-toggle .group-chevron{transform:rotate(90deg)}.group-content{display:grid;grid-template-rows:0fr;visibility:hidden}.group-items{min-height:0;overflow:hidden}.group-open>.group-content{grid-template-rows:1fr;visibility:visible}.group-animate>.group-content{transition:grid-template-rows .2s}.group-animate>.group-toggle .group-chevron{transition:transform .2s}
	@media(prefers-reduced-motion:reduce){.group-animate>.group-content,.group-animate>.group-toggle .group-chevron{transition:none}}
	aside{position:fixed;inset:0 auto 0 0;display:flex;flex-direction:column;width:252px;overflow:hidden;background:var(--sidebar);color:var(--sph-color-on-emphasis);z-index:60;transition:width .22s}
	.brand{height:56px;display:flex;align-items:center;gap:var(--sph-space-10px);padding:0 var(--sph-space-16px);border-bottom:1px solid var(--sph-color-sidebar-border);flex-shrink:0;color:var(--sph-color-on-emphasis);text-decoration:none}.brand-icon{display:block;width:28px;height:28px;flex:none}.brand strong{font-size:var(--font-size-body);font-weight:var(--sph-weight-600);letter-spacing:-.2px}
	.sidebar-nav{flex:1;overflow-y:auto;padding:var(--sph-space-8px) 0;scrollbar-color:auto;scrollbar-width:auto}.sidebar-nav::-webkit-scrollbar{width:3px}.sidebar-nav::-webkit-scrollbar-track{background:transparent}.sidebar-nav::-webkit-scrollbar-thumb{background:var(--sph-color-sidebar-border);border-radius:var(--sph-radius-3px)}.nav-group{padding:0 var(--sph-space-8px);margin-bottom:var(--sph-space-2px)}.nav-label{margin:var(--sph-space-4px) 0 0;padding:var(--sph-space-8px) var(--sph-space-12px);color:var(--sidebar-muted,var(--sph-color-sidebar-muted));font-size:var(--font-size-support);font-weight:var(--sph-weight-600);letter-spacing:.5px}
	.nav-link{position:relative;display:flex;align-items:center;gap:var(--sph-space-10px);width:100%;min-height:32px;margin-bottom:var(--sph-space-1px);padding:var(--sph-space-6px) var(--sph-space-12px);background:transparent;border:0;border-radius:var(--sph-radius-4px);color:var(--sidebar-muted, var(--sph-color-sidebar-link-fallback));font-size:var(--font-size-body);font-weight:var(--sph-weight-400);text-decoration:none;text-align:left;cursor:pointer}.nav-link:hover,.nav-link.active{background:var(--sph-color-sidebar-hover);color:var(--sph-color-on-emphasis)}.nav-link :global(.nav-icon){width:18px;height:18px;flex:none;opacity:.5}.nav-link:hover :global(.nav-icon),.nav-link.active :global(.nav-icon){opacity:.85}
	.badge{margin-left:auto;padding:var(--sph-space-1px) var(--sph-space-6px);border-radius:var(--sph-radius-3px);background:var(--sph-color-accent-tint);color:var(--primary);font-size:var(--font-size-support);font-weight:var(--sph-weight-600);font-style:normal;line-height:var(--sph-leading-1-6)}.badge.hot{background:var(--sph-color-danger-badge-strong);color:var(--sph-color-sidebar-hot)}.nav-chev{margin-left:auto;opacity:.55;font-style:normal}.nav-tree.animate .nav-chev{transition:transform .2s,opacity .12s}.nav-tree.open .nav-chev{transform:rotate(90deg);opacity:1}.nav-sub{display:grid;grid-template-rows:0fr;margin:0 0 var(--sph-space-4px) var(--sph-space-20px);border-left:1px solid var(--sph-color-sidebar-tree)}.nav-tree.animate .nav-sub{transition:grid-template-rows .2s}.nav-tree.open .nav-sub{grid-template-rows:1fr}.nav-sub-inner{min-height:0;overflow:hidden}.nav-sublink{position:relative;display:flex;padding:var(--sph-space-7px) var(--sph-space-12px);color:var(--sidebar-muted, var(--sph-color-sidebar-link-fallback));font-size:var(--font-size-body);text-decoration:none}.nav-sublink::before{position:absolute;left:-9px;top:50%;width:8px;height:1px;background:var(--sph-color-sidebar-tree-connector);content:''}.nav-sublink:hover,.nav-sublink.active{color:var(--sph-color-on-emphasis);background:var(--sph-color-sidebar-hover)}.nav-sublink.active::before{left:-13px;width:12px;background:var(--primary)}
	.rail-flyout{position:fixed;left:72px;z-index:100;display:grid;min-width:180px;max-height:calc(100dvh - 16px);overflow-y:auto;padding:var(--sph-space-6px);background:var(--surface);border:1px solid var(--border);border-radius:var(--sph-radius-5px);box-shadow:var(--shadow)}.rail-flyout a{padding:var(--sph-space-8px);color:var(--text);font-size:var(--font-size-body);text-decoration:none}.rail-flyout a:hover{background:var(--surface-hover,var(--bg))}
	.rail-label{position:fixed;left:76px;z-index:110;padding:var(--sph-space-5px) var(--sph-space-9px);border-radius:var(--sph-radius-4px);background:var(--sph-color-rail-tooltip);color:var(--sph-color-on-emphasis);font-size:var(--font-size-support);line-height:var(--sph-leading-1-4286);pointer-events:none;transform:translateY(-50%);white-space:nowrap}
	aside.collapsed{width:64px;overflow:visible}
	aside.collapsed .sidebar-nav{overflow-y:auto}
	aside.collapsed .brand strong,aside.collapsed .group-title,aside.collapsed .nav-text,aside.collapsed .badge,aside.collapsed .nav-chev,aside.collapsed .nav-sub{display:none}
	aside.collapsed .group-icon{display:grid}aside.collapsed .group-toggle{justify-content:center;padding:var(--sph-space-8px)}aside.collapsed .group-chevron{position:absolute;right:1px;bottom:5px;width:10px;height:10px}
	aside.collapsed .nav-link{justify-content:center;gap:0;padding:var(--sph-space-8px)}
	@media (max-width:760px), (min-width:701px) and (max-width:1024px) and (max-height:500px) and (any-pointer:coarse){
		aside:not(.force-expanded){width:64px;overflow:visible}
		aside:not(.force-expanded) .brand strong,aside:not(.force-expanded) .group-title,aside:not(.force-expanded) .nav-text,aside:not(.force-expanded) .badge,aside:not(.force-expanded) .nav-chev,aside:not(.force-expanded) .nav-sub{display:none}
		aside:not(.force-expanded) .group-icon{display:grid}aside:not(.force-expanded) .group-toggle{justify-content:center;padding:var(--sph-space-8px)}aside:not(.force-expanded) .group-chevron{position:absolute;right:1px;bottom:5px;width:10px;height:10px}
		aside:not(.force-expanded) .nav-link{justify-content:center;padding:var(--sph-space-10px)}
		aside:not(.force-expanded) .sidebar-nav{overflow-y:auto}
		aside:not(.force-expanded) .rail-flyout{display:grid}
	}
	aside button.nav-link{background:transparent}
	aside button.nav-link:hover{background:var(--sph-color-sidebar-hover)}
</style>
