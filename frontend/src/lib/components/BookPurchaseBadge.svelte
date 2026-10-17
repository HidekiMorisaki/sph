<script lang="ts">
	import { onMount } from 'svelte';
	let { titleId, count, label, onOpen }: { titleId: number; count: number; label: string; onOpen: (trigger: HTMLButtonElement) => void } = $props();
	let button: HTMLButtonElement;
	let tooltip: HTMLSpanElement;
	let hovered = false, focused = false;
	let left = $state(0), top = $state(0);
	const tooltipId = $derived(`book-purchase-tooltip-${titleId}`);
	function hideTooltip() { if (tooltip?.matches(':popover-open')) tooltip.hidePopover(); }
	function showTooltip() {
		if (!tooltip || !button) return;
		if (!tooltip.matches(':popover-open')) tooltip.showPopover();
		const anchor = button.getBoundingClientRect(), bounds = tooltip.getBoundingClientRect();
		left = Math.max(8, Math.min(innerWidth - bounds.width - 8, anchor.left + (anchor.width - bounds.width) / 2));
		const preferredTop = anchor.bottom + bounds.height + 14 <= innerHeight ? anchor.bottom + 6 : anchor.top - bounds.height - 6;
		top = Math.max(8, Math.min(innerHeight - bounds.height - 8, preferredTop));
	}
	function viewportChanged() {
		if (focused && tooltip?.matches(':popover-open')) showTooltip();
		else hideTooltip();
	}
	onMount(() => {
		window.addEventListener('scroll', viewportChanged, true);
		window.addEventListener('resize', viewportChanged);
		return () => { hideTooltip(); window.removeEventListener('scroll', viewportChanged, true); window.removeEventListener('resize', viewportChanged); };
	});
</script>

<button bind:this={button} type="button" class="book-purchase-badge" aria-label={label} aria-describedby={tooltipId} aria-haspopup="dialog"
	onpointerenter={() => { hovered = true; showTooltip(); }} onpointerleave={() => { hovered = false; if (!focused) hideTooltip(); }}
	onfocus={() => { focused = true; showTooltip(); }} onblur={() => { focused = false; if (!hovered) hideTooltip(); }}
	onkeydown={(event) => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); hideTooltip(); } }}
	onclick={() => { hideTooltip(); onOpen(button); }}>
	<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 3h2l2.4 10h9.4l2-7H4.7M6.4 13l-.4 2h10" /><circle cx="7.5" cy="17.5" r=".8" /><circle cx="14.5" cy="17.5" r=".8" /></svg>
	<span aria-hidden="true">{count}</span>
</button>
<span bind:this={tooltip} id={tooltipId} class="book-purchase-tooltip" popover="manual" role="tooltip" style:left={`${left}px`} style:top={`${top}px`}>{label}</span>

<style>
	.book-purchase-badge{display:inline-flex;align-items:center;justify-content:center;gap:4px;min-height:28px;margin:0 0 0 8px;padding:3px 6px;vertical-align:middle;border:1px solid color-mix(in srgb,var(--action-primary) 20%,transparent);border-radius:4px;background:color-mix(in srgb,var(--action-primary) 10%,var(--surface))!important;color:color-mix(in srgb,var(--action-primary) 70%,var(--text))!important;font-family:inherit;font-size:var(--font-size-support);font-weight:600;line-height:1;white-space:nowrap;cursor:pointer}
	.book-purchase-badge svg{width:20px;height:20px;flex:none}.book-purchase-badge:hover{background:var(--surface-hover,color-mix(in srgb,var(--action-primary) 18%,var(--surface)))!important}.book-purchase-badge:focus-visible{outline:2px solid var(--action-primary);outline-offset:2px}
	.book-purchase-tooltip{position:fixed;inset:auto;margin:0;box-sizing:border-box;width:max-content;max-width:calc(100vw - 16px);padding:8px 10px;border:1px solid var(--border);border-radius:6px;background:var(--surface);color:var(--text);box-shadow:0 8px 24px rgba(0,0,0,.16);font-family:inherit;font-size:var(--font-size-support);font-weight:400;line-height:1.6;white-space:normal;overflow-wrap:anywhere;pointer-events:none}
</style>
