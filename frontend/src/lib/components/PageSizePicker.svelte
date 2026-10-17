<script lang="ts">
	import { tick } from 'svelte';
	import '$lib/styles/page-size-picker.css';

	let { value, options, label, onChange }: {
		value: number; options: number[]; label: string; onChange: (value: number) => void;
	} = $props();
	let open = $state(false);
	let panelStyle = $state('');
	let root: HTMLDivElement;
	let trigger: HTMLButtonElement;
	let panel = $state<HTMLDivElement>();

	function close(focus = false) {
		if (panel?.matches(':popover-open')) panel.hidePopover();
		open = false;
		if (focus) trigger.focus({ preventScroll: true });
	}
	function positionPanel() {
		if (!panel) return;
		const rect = trigger.getBoundingClientRect();
		const edge = 8;
		const height = panel.offsetHeight;
		const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
		const below = viewportHeight - edge - rect.bottom;
		const above = rect.top - edge;
		const top = below < height && above > below ? rect.top - height - 4 : rect.bottom + 4;
		const left = Math.max(edge, Math.min(rect.left, window.innerWidth - edge - rect.width));
		panelStyle = `position:fixed;top:${Math.max(edge, Math.min(top, viewportHeight - edge - height))}px;left:${left}px;right:auto;bottom:auto;margin:0;width:${rect.width}px;max-height:${Math.max(28, viewportHeight - 2 * edge)}px;overflow:auto;visibility:visible`;
	}
	function focusOption(index: number) {
		panel?.querySelectorAll<HTMLButtonElement>('[role="option"]')[Math.max(0, Math.min(index, options.length - 1))]?.focus({ preventScroll: true });
	}
	async function show() {
		panelStyle = 'position:fixed;top:0;left:0;right:auto;bottom:auto;margin:0;visibility:hidden';
		open = true;
		await tick();
		panel?.showPopover();
		positionPanel();
		await tick();
		focusOption(options.indexOf(value));
	}
	function triggerKeydown(event: KeyboardEvent) {
		if (['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(event.key)) {
			event.preventDefault();
			void show();
		}
	}
	function optionKeydown(event: KeyboardEvent, index: number) {
		if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
			event.preventDefault();
			focusOption(event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : index + (event.key === 'ArrowDown' ? 1 : -1));
		} else if (event.key === 'Escape') { event.preventDefault(); close(true); }
		else if (event.key === 'Tab') close();
	}
	$effect(() => {
		if (!open) return;
		const outside = (event: MouseEvent) => { if (event.target instanceof Node && !root.contains(event.target)) close(); };
		const resize = () => positionPanel();
		document.addEventListener('click', outside);
		window.addEventListener('resize', resize);
		window.addEventListener('scroll', resize, true);
		window.visualViewport?.addEventListener('resize', resize);
		return () => {
			document.removeEventListener('click', outside);
			window.removeEventListener('resize', resize);
			window.removeEventListener('scroll', resize, true);
			window.visualViewport?.removeEventListener('resize', resize);
		};
	});
</script>

<div bind:this={root} class="page-size-picker">
	<button bind:this={trigger} class="page-size-trigger" type="button" aria-haspopup="listbox" aria-expanded={open} onclick={() => open ? close(true) : void show()} onkeydown={triggerKeydown}><span>{value}</span><svg viewBox="0 0 10 6" aria-hidden="true"><path d="M1 1l4 4 4-4" /></svg></button>
	{#if open}<div bind:this={panel} class="page-size-options" popover="manual" role="listbox" aria-label={label} style={panelStyle}>
		{#each options as option, index}<button type="button" role="option" aria-selected={value === option} class:selected={value === option} onclick={() => { close(true); onChange(option); }} onkeydown={(event) => optionKeydown(event, index)}>{option}</button>{/each}
	</div>{/if}
</div>
