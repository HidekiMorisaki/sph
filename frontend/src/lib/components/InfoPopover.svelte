<script lang="ts">
	import { onMount, type Snippet } from 'svelte';
	import { localization } from '$lib/localization';
	import { localeMessages } from '$lib/locale-messages';
	let { label, children }: { label: string; children: Snippet } = $props();
	const id = $props.id();
	let trigger: HTMLButtonElement;
	let panel: HTMLDivElement;
	let expanded = $state(false), left = $state(8), top = $state(8);
	function position() {
		if (!panel?.matches(':popover-open') || !trigger) return;
		const anchor = trigger.getBoundingClientRect(), bounds = panel.getBoundingClientRect();
		left = Math.max(8, Math.min(innerWidth - bounds.width - 8, anchor.left));
		top = Math.max(8, Math.min(innerHeight - bounds.height - 8, anchor.bottom + 6));
	}
	function close() { panel?.hidePopover(); trigger?.focus({ preventScroll: true }); }
	function toggle() {
		if (panel?.matches(':popover-open')) { close(); return; }
		panel?.showPopover(); position(); panel?.focus({ preventScroll: true });
	}
	function keydown(event: KeyboardEvent) {
		if (event.key === 'Escape' && panel?.matches(':popover-open')) {
			event.preventDefault(); event.stopPropagation(); close();
		}
	}
	onMount(() => {
		const resize = new ResizeObserver(position); resize.observe(panel);
		window.addEventListener('resize', position); window.addEventListener('scroll', position, true);
		return () => { resize.disconnect(); window.removeEventListener('resize', position); window.removeEventListener('scroll', position, true); panel?.hidePopover(); };
	});
</script>

<button bind:this={trigger} type="button" class="info-trigger" aria-label={label} aria-expanded={expanded} aria-controls={id} aria-haspopup="dialog" onclick={toggle} onkeydown={keydown}>
	<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="10" cy="10" r="8"/><path d="M10 9v5M10 6v1"/></svg>
</button>
<div bind:this={panel} {id} class="info-popover" popover="auto" role="dialog" aria-label={label} tabindex="-1" style:left={`${left}px`} style:top={`${top}px`} ontoggle={() => expanded = panel?.matches(':popover-open') ?? false} onkeydown={keydown}>
	<div class="info-heading"><strong>{label}</strong><button type="button" class="info-close" aria-label={localeMessages[$localization.displayLanguage].common.close} onclick={close}>×</button></div>
	{@render children()}
</div>

<style>
	.info-trigger{display:inline-flex;flex:none;align-items:center;justify-content:center;width:20px;height:20px;margin:0;padding:1px;border:0;border-radius:50%;background:transparent;color:var(--muted);cursor:pointer;vertical-align:middle}
	.info-trigger svg{width:18px;height:18px}.info-trigger:hover{color:var(--text);background:var(--surface-hover,var(--surface-secondary))}.info-trigger:focus-visible,.info-close:focus-visible{outline:2px solid var(--action-primary);outline-offset:2px}
	.info-popover{position:fixed;inset:auto;margin:0;width:360px;max-width:calc(100vw - 16px);max-height:calc(100dvh - 16px);overflow:auto;box-sizing:border-box;padding:12px;border:1px solid var(--border);border-radius:6px;background:var(--surface);color:var(--text);box-shadow:0 8px 24px #0003;font-size:var(--font-size-support);font-weight:400;line-height:1.6;overflow-wrap:anywhere}
	.info-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:8px}.info-close{display:grid;place-items:center;flex:none;width:28px;height:28px;margin:0;padding:0;border:0;border-radius:4px;background:transparent;color:var(--muted);font-size:20px;cursor:pointer}
	.info-popover :global(p){margin:0}
	@media(max-width:700px){.info-trigger{width:44px;height:44px}.info-close{width:44px;height:44px}}
</style>
