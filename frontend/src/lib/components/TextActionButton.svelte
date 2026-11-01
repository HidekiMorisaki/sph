<script lang="ts">
 import type { ComponentProps } from 'svelte';
 import ControlButton from './ControlButton.svelte';
 let { class: className = '', element = $bindable(), ...attributes }: ComponentProps<typeof ControlButton> = $props();
</script>

<ControlButton {...attributes} bind:element class={['app-text-action', className]}/>

<style>
 :global(.app-text-action){display:inline;padding:0;margin:0;min-height:0;height:auto;border:0;border-radius:0;background:transparent;color:var(--action-primary);font:inherit;text-align:left;cursor:pointer}
 :global(.app-text-action:focus-visible){outline:2px solid var(--action-primary);outline-offset:2px}
 :global(.app-text-action:disabled){opacity:.5;cursor:not-allowed}
</style>
