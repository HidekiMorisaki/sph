<script lang="ts">
	let {
		label,
		onclick,
		disabled = false,
		ariaLabel,
		iconOnly = true,
		element = $bindable(),
		ariaExpanded,
		ariaControls,
		ariaHaspopup,
		onkeydown
	}: {
		label: string;
		onclick: (event: MouseEvent) => void;
		disabled?: boolean;
		ariaLabel?: string;
		iconOnly?: boolean;
		element?: HTMLButtonElement;
		ariaExpanded?: boolean;
		ariaControls?: string;
		ariaHaspopup?: 'menu';
		onkeydown?: (event: KeyboardEvent) => void;
	} = $props();
</script>

<button bind:this={element} class={iconOnly ? 'app-add-icon' : 'app-primary-action app-add-button'} type="button" {disabled} aria-label={ariaLabel ?? (iconOnly ? label : undefined)} title={iconOnly ? ariaLabel ?? label : undefined} aria-expanded={ariaExpanded} aria-controls={ariaControls} aria-haspopup={ariaHaspopup} {onclick} {onkeydown}>
	{#if iconOnly}<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>{:else}
	<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
		<path d="M4 8h8M8 4v8" />
	</svg>
	{label}
	{/if}
</button>

<style>
	.app-add-icon{display:grid;place-items:center;flex:none;width:34px;height:34px;margin:0;padding:7px;border:0;border-radius:4px;background:transparent;color:var(--text-secondary);cursor:pointer}
	.app-add-icon:hover:not(:disabled){background:var(--surface-hover,var(--bg))}
	.app-add-icon:focus-visible{outline:2px solid var(--action-primary);outline-offset:2px}
	.app-add-icon:disabled{opacity:.5;cursor:not-allowed}
	.app-add-icon svg{width:18px;height:18px}
</style>
