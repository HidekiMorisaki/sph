<script lang="ts">
 import type { ComponentProps } from 'svelte';
 import ControlButton from './ControlButton.svelte';
 let { class: className = '', size = 'default', element = $bindable(), ...attributes }: ComponentProps<typeof ControlButton> & {size?:'default'|'small'} = $props();
</script>

<ControlButton {...attributes} bind:element class={['app-icon-action',`app-icon-action--${size}`,className]}/>

<style>
 :global(.app-icon-action){display:inline-grid;place-items:center;flex:none;width:34px;height:34px;min-height:34px;margin:0;padding:var(--sph-space-7px);background:transparent;color:var(--text-secondary);border:0;border-radius:var(--sph-radius-4px);cursor:pointer}
 :global(.app-icon-action:hover:not(:disabled)){background:var(--surface-hover)}
 :global(.app-icon-action:focus-visible){outline:2px solid var(--action-primary);outline-offset:2px}
 :global(.app-icon-action:disabled){opacity:.5;cursor:not-allowed}
 :global(.app-icon-action svg){width:18px;height:18px;flex:none}
 :global(.app-icon-action.app-icon-action--small){width:32px;min-width:32px;height:32px;min-height:32px}
 @media(max-width:700px),(min-width:701px) and (max-width:1024px) and (max-height:500px) and (any-pointer:coarse){:global(.app-icon-action.app-icon-action--small){min-width:44px;min-height:44px}}
</style>
