<script lang="ts">
	import { productName } from '#lib/brand.js';

	let { title = '' }: { title?: string } = $props();
</script>

<svelte:head><title>{title ? `${title} | ${productName}` : productName}</title></svelte:head>
