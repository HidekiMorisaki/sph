<script lang="ts">
 import type { ComponentProps } from 'svelte';
 import ControlButton from './ControlButton.svelte';
 type Props = Omit<ComponentProps<typeof ControlButton>, 'children' | 'type' | 'aria-label'> & { label: string };
 let { label, class: className = '', element = $bindable(), ...attributes }: Props = $props();
</script>

<ControlButton {...attributes} bind:element type="button" aria-label={label} class={['app-info-icon', className]}>
 <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="10" cy="10" r="8"/><path d="M10 9v5M10 6v1"/></svg>
</ControlButton>

<style>
 :global(button.app-info-icon){display:inline-flex;flex:none;align-items:center;justify-content:center;width:20px;height:20px;min-width:20px;min-height:20px;margin:0;padding:0;border:0;border-radius:50%;background:transparent;color:var(--muted);cursor:pointer;vertical-align:middle}
 :global(button.app-info-icon svg){width:18px;height:18px;flex:none}
 :global(button.app-info-icon:hover),:global(button.app-info-icon[aria-expanded='true']){color:var(--text);background:var(--surface-hover,var(--surface-secondary))}
 :global(button.app-info-icon:focus-visible){outline:2px solid var(--action-primary);outline-offset:2px}
 :global(button.app-info-icon:disabled){opacity:.55;cursor:not-allowed}
 @media(max-width:700px),(min-width:701px) and (max-width:1024px) and (max-height:500px) and (any-pointer:coarse){:global(button.app-info-icon){width:44px;height:44px;min-width:44px;min-height:44px}}
</style>
