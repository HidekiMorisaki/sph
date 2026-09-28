<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		title,
		framed = false,
		columns = 3,
		children
	}: {
		title: string;
		framed?: boolean;
		columns?: 2 | 3;
		children: Snippet;
	} = $props();
</script>

<section class="app-form-section" class:app-form-section--framed={framed}>
	<h3>{title}</h3>
	<div class={`app-form-section-grid app-form-section-grid--${columns}`}>
		{@render children()}
	</div>
</section>
