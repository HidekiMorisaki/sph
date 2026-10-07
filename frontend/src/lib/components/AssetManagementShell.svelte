<script lang="ts">
	import { getContext } from 'svelte';
	import type { Snippet } from 'svelte';
	import PageTitle from './PageTitle.svelte';

	let { title, children }: { title: string; active?: string; children: Snippet } = $props();
	const setShellTitle = getContext<((title: string) => void) | undefined>('asset-shell-title');
	$effect(() => { setShellTitle?.(title); });
</script>

<PageTitle {title} />
{@render children()}
