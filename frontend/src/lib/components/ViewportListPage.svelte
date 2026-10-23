<script lang="ts">
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();
</script>

<div class="viewport-list-page">
	{@render children()}
</div>

<style>
	.viewport-list-page{display:flex;min-width:0;flex-direction:column}
</style>
