<script lang="ts">
 import type { Snippet } from 'svelte';
 import type { HTMLButtonAttributes } from 'svelte/elements';
 let {
  label, children, variant = 'primary', size = 'default', multiline = false, type = 'button',
  ariaLabel, class: className = '', element = $bindable(), ...attributes
 }: Omit<HTMLButtonAttributes, 'children'> & {
  label?: string; children?: Snippet; variant?: 'primary' | 'secondary' | 'danger';
  size?: 'default' | 'field' | 'touch'; multiline?: boolean; ariaLabel?: string; element?: HTMLButtonElement;
 } = $props();
 const variantClass = { primary: 'app-primary-action', secondary: 'secondary', danger: 'app-danger-action' };
</script>

<button {...attributes} bind:this={element} class={['app-modal-action', `app-modal-action--${size}`, variantClass[variant], {'app-modal-action--multiline':multiline}, className]} {type} aria-label={ariaLabel ?? attributes['aria-label']}>
 {#if children}{@render children()}{:else}{label}{/if}
</button>

<style>
	.app-modal-action{display:inline-flex;align-items:center;justify-content:center;justify-self:start;line-height:1}
	.app-modal-action.app-modal-action{margin:0;padding:0 12px;border-radius:4px;font-family:inherit;font-size:var(--font-size-body);font-weight:500;line-height:1}
	.app-modal-action.app-modal-action--default{height:32px;min-height:32px}
	.app-modal-action.secondary{height:32px;min-height:32px;padding:0 12px;border:1px solid var(--border);border-radius:4px;background:var(--surface)!important;color:var(--text-secondary)!important;font-family:inherit;font-size:var(--font-size-body);font-weight:500;box-shadow:var(--shadow)}
	.app-modal-action.app-modal-action--field{height:36px;min-height:36px}
	.app-modal-action.app-modal-action--touch{height:44px;min-height:44px}
	.app-modal-action.app-modal-action--multiline{height:auto;min-height:32px;padding-block:6px;white-space:normal;overflow-wrap:anywhere}
	.app-modal-action:disabled{cursor:not-allowed;opacity:.65}
	.app-modal-action.secondary:hover:not(:disabled){background:var(--surface-hover)!important}
	.app-modal-action.secondary:focus-visible{outline:2px solid var(--action-primary);outline-offset:2px}
	@media(max-width:700px),(min-width:701px) and (max-width:1024px) and (max-height:500px) and (any-pointer:coarse){.app-modal-action.app-modal-action--field{height:44px;min-height:44px}}
</style>
