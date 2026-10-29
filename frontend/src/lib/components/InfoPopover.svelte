<script lang="ts">
 import InfoIconButton from './InfoIconButton.svelte';
	import { onMount, type Snippet } from 'svelte';
	import { localization } from '$lib/localization';
	import { localeMessages } from '$lib/locale-messages';
	let { label, children, showHeading = true }: { label: string; children: Snippet; showHeading?: boolean } = $props();
	const id = $props.id();
	let trigger = $state<HTMLButtonElement>();
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

<InfoIconButton bind:element={trigger} class="info-trigger" label={label} aria-expanded={expanded} aria-controls={id} aria-haspopup="dialog" onclick={toggle} onkeydown={keydown}/>
<div bind:this={panel} {id} class="info-popover" popover="auto" role="dialog" aria-label={label} tabindex="-1" style:left={`${left}px`} style:top={`${top}px`} ontoggle={() => expanded = panel?.matches(':popover-open') ?? false} onkeydown={keydown}>
	{#if showHeading}<div class="info-heading"><strong>{label}</strong><button type="button" class="info-close" aria-label={localeMessages[$localization.displayLanguage].common.close} onclick={close}>×</button></div>{/if}
	{@render children()}
</div>

<style>
	.info-close:focus-visible{outline:2px solid var(--action-primary);outline-offset:2px}
	.info-popover{position:fixed;inset:auto;margin:0;width:360px;max-width:calc(100vw - 16px);max-height:calc(100dvh - 16px);overflow:auto;box-sizing:border-box;padding:var(--sph-space-12px);border:1px solid var(--border);border-radius:var(--sph-radius-6px);background:var(--surface);color:var(--text);box-shadow:var(--sph-shadow-popover);font-size:var(--font-size-support);font-weight:var(--sph-weight-400);line-height:var(--sph-leading-1-6);overflow-wrap:anywhere}
	.info-heading{display:flex;align-items:center;justify-content:space-between;gap:var(--sph-space-12px);margin-bottom:var(--sph-space-8px)}.info-close{display:grid;place-items:center;flex:none;width:28px;height:28px;margin:0;padding:0;border:0;border-radius:var(--sph-radius-4px);background:transparent;color:var(--muted);font-size:var(--sph-type-20px);cursor:pointer}
	.info-popover :global(p){margin:0}
	@media(max-width:700px){.info-close{width:44px;height:44px}}
</style>
