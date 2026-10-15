<script lang="ts">
	import { onMount, setContext, type Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();
	let container: HTMLDivElement;
	let availableHeight = $state<number>();
	setContext('viewport-list-page', true);

	onMount(() => {
		let frame = 0;
		const parent = container.parentElement;
		const measure = () => {
			frame = 0;
			const bottomPadding = parent ? parseFloat(getComputedStyle(parent).paddingBottom) || 0 : 0;
			const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
			const top = container.getBoundingClientRect().top + window.scrollY;
			availableHeight = Math.max(0, Math.floor(viewportHeight - top - bottomPadding));
		};
		const schedule = () => { if (!frame) frame = requestAnimationFrame(measure); };
		const observer = new ResizeObserver(schedule);
		const observeLayout = () => {
			observer.disconnect();
			observer.observe(container);
			if (parent) {
				observer.observe(parent);
				for (const child of parent.children) observer.observe(child);
			}
			for (const child of container.children) observer.observe(child);
			schedule();
		};
		const mutations = new MutationObserver(observeLayout);
		mutations.observe(parent ?? container, { childList: true, subtree: true });
		window.addEventListener('resize', schedule);
		window.visualViewport?.addEventListener('resize', schedule);
		measure();
		observeLayout();
		return () => {
			observer.disconnect();
			mutations.disconnect();
			cancelAnimationFrame(frame);
			window.removeEventListener('resize', schedule);
			window.visualViewport?.removeEventListener('resize', schedule);
		};
	});
</script>

<div bind:this={container} class="viewport-list-page" style:height={availableHeight === undefined ? undefined : `${availableHeight}px`}>
	{@render children()}
</div>

<style>
	.viewport-list-page{display:flex;min-width:0;min-height:0;flex-direction:column;overflow:auto}
</style>
