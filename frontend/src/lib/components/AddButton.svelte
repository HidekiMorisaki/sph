<script lang="ts">
	let {
		label,
		onclick,
		disabled = false,
		ariaLabel,
		element = $bindable()
	}: {
		label: string;
		onclick: (event: MouseEvent) => void;
		disabled?: boolean;
		ariaLabel?: string;
		element?: HTMLButtonElement;
	} = $props();
</script>

<button bind:this={element} class="app-primary-action app-add-button" type="button" {disabled} aria-label={ariaLabel} {onclick}>
	<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
		<path d="M4 8h8M8 4v8" />
	</svg>
	{label}
</button>
