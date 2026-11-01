<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		title,
		hideTitle = false,
		framed = false,
		columns = 3,
		action,
		children
	}: {
		title: string;
		hideTitle?: boolean;
		framed?: boolean;
		columns?: 2 | 3;
		action?: Snippet;
		children: Snippet;
	} = $props();
</script>

<section class="app-form-section" class:app-form-section--framed={framed} aria-label={hideTitle ? title : undefined}>
	{#if !hideTitle || action}<div class="app-form-section-header">{#if !hideTitle}<h3>{title}</h3>{/if}{#if action}{@render action()}{/if}</div>{/if}
	<div class={`app-form-section-grid app-form-section-grid--${columns}`}>
		{@render children()}
	</div>
</section>

<style>
	.app-form-section-header{display:flex;align-items:center;justify-content:space-between;gap:var(--sph-space-12px);min-width:0}
	.app-form-section-header h3{margin:0}
</style>
