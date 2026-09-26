<script lang="ts">
	import { page } from '$app/state';
	import type { Snippet } from 'svelte';
	import { groupLabelForPath } from '$lib/components/sidebarNavigation';

	let { title, titleId, description, actions }: {
		title: string;
		titleId?: string;
		description?: string;
		actions?: Snippet;
	} = $props();
	let groupLabel = $derived(groupLabelForPath(page.url.pathname));
</script>

<header class="master-page-header">
	<div>
		{#if groupLabel}<p>{groupLabel}</p>{/if}
		<h1 id={titleId}>{title}</h1>
		{#if description}<span>{description}</span>{/if}
	</div>
	{#if actions}<div class="master-page-actions">{@render actions()}</div>{/if}
</header>

<style>
	.master-page-header{display:flex;flex:none;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:24px}
	.master-page-header p{margin:0;color:#1abb9c;font-size:11px;font-weight:700;letter-spacing:.08em}
	.master-page-header h1{margin:4px 0;color:var(--text);font-size:30px;line-height:1.2}
	.master-page-header span{display:block;color:var(--muted);font-size:13px}
	.master-page-actions{display:flex;align-items:center;gap:8px}
	@media(max-width:700px){.master-page-header{align-items:stretch;flex-direction:column}.master-page-actions{width:100%}}
</style>
