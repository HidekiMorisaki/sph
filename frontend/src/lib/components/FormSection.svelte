<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		title,
		framed = false,
		columns = 3,
		action,
		children
	}: {
		title: string;
		framed?: boolean;
		columns?: 2 | 3;
		action?: Snippet;
		children: Snippet;
	} = $props();
</script>

<section class="app-form-section" class:app-form-section--framed={framed}>
	<div class="app-form-section-header"><h3>{title}</h3>{#if action}{@render action()}{/if}</div>
	<div class={`app-form-section-grid app-form-section-grid--${columns}`}>
		{@render children()}
	</div>
</section>

<style>
	.app-form-section-header{display:flex;align-items:center;justify-content:space-between;gap:12px;min-width:0}
</style>
