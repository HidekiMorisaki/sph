<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';
	import { setContext, untrack } from 'svelte';
	import { initializeLocalization, LOCALIZATION_CONTEXT } from '$lib/localization';
	import '../app.css';

	let { children, data } = $props();
	// Initialize before child rendering; later changes use the applied client store.
	setContext(LOCALIZATION_CONTEXT, untrack(() => initializeLocalization(data.initialLocalization)));
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{@render children()}
