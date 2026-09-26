<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		children,
		onDismiss,
		disabled = false,
		className = ''
	}: {
		children: Snippet;
		onDismiss: () => void;
		disabled?: boolean;
		className?: string;
	} = $props();

	function handleClick(event: MouseEvent) {
		if (!disabled && event.target === event.currentTarget) onDismiss();
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class={`app-modal-backdrop ${className}`.trim()} role="presentation" onclick={handleClick}>
	{@render children()}
</div>
