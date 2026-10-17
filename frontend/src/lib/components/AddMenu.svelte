<script lang="ts">
	import AddButton from './AddButton.svelte';
	let { label, items }: { label: string; items: Array<{ label: string; action: (trigger: HTMLButtonElement) => void }> } = $props();
	const id = $props.id();
	let trigger = $state<HTMLButtonElement>();
	let menu = $state<HTMLDivElement>();
	let expanded = $state(false);
	let left = $state(0), top = $state(0);
	function position() {
		if (!trigger || !menu) return;
		const anchor = trigger.getBoundingClientRect(), bounds = menu.getBoundingClientRect();
		left = Math.max(8, Math.min(innerWidth - bounds.width - 8, anchor.right - bounds.width));
		top = Math.max(8, Math.min(innerHeight - bounds.height - 8, anchor.bottom + 6));
	}
	function open(last = false) {
		menu?.showPopover(); position();
		const buttons = menu?.querySelectorAll<HTMLButtonElement>('button');
		(last ? buttons?.[buttons.length - 1] : buttons?.[0])?.focus();
	}
	function close(restore = false) { menu?.hidePopover(); if (restore) trigger?.focus({ preventScroll: true }); }
	function handleKey(event: KeyboardEvent) {
		const buttons = [...menu!.querySelectorAll<HTMLButtonElement>('button')];
		const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
		if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
			event.preventDefault();
			buttons[event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus();
		} else if (event.key === 'Escape') { event.preventDefault(); close(true); }
		else if (event.key === 'Tab') { close(true); }
	}
</script>

<svelte:window onresize={() => close()} onscroll={() => { if (expanded) position(); }} />
<AddButton {label} bind:element={trigger} ariaExpanded={expanded} ariaControls={id} ariaHaspopup="menu"
	onclick={() => expanded ? close(true) : open()}
	onkeydown={(event) => { if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); open(event.key === 'ArrowUp'); } }} />
<div bind:this={menu} {id} class="add-menu" popover="auto" role="menu" tabindex="-1" aria-label={label} style:left={`${left}px`} style:top={`${top}px`}
	ontoggle={() => expanded = menu?.matches(':popover-open') ?? false} onkeydown={handleKey}>
	{#each items as item}
		<button type="button" role="menuitem" tabindex="-1" onclick={() => { close(true); item.action(trigger!); }}>{item.label}</button>
	{/each}
</div>

<style>
	.add-menu{position:fixed;inset:auto;margin:0;min-width:180px;max-width:calc(100vw - 16px);padding:6px;background:var(--surface);color:var(--text);border:1px solid var(--border);border-radius:6px;box-shadow:var(--shadow)}
	button{display:block;width:100%;margin:0;padding:10px 12px;border:0;border-radius:4px;background:transparent;color:var(--text);text-align:left;font:inherit;cursor:pointer}
	button:hover,button:focus-visible{background:var(--bg);outline:2px solid var(--action-primary);outline-offset:-2px}
	button:hover{background:var(--surface-hover,var(--bg));outline:2px solid var(--action-primary);outline-offset:-2px}
</style>
