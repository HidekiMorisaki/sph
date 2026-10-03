<script lang="ts">
	import { productName } from '$lib/brand';

	let { title = '' }: { title?: string } = $props();
</script>

<svelte:head><title>{title ? `${title} | ${productName}` : productName}</title></svelte:head>
