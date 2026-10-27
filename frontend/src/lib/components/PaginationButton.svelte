<script lang="ts">
 import type { ComponentProps } from 'svelte';
 import ControlButton from './ControlButton.svelte';
 let { class: className = '', element = $bindable(), ...attributes }: ComponentProps<typeof ControlButton> = $props();
</script>

<ControlButton {...attributes} bind:element class={['app-pagination-action', className]}/>

<style>
 :global(button.app-pagination-action){display:inline-flex;align-items:center;justify-content:center;flex:none;min-width:28px;height:28px;min-height:28px;margin:0;padding:0 8px;border:1px solid var(--border);border-radius:4px;background:var(--surface);color:var(--text-secondary);cursor:pointer}
 :global(button.app-pagination-action:hover:not(:disabled)){background:var(--surface-hover)}
 :global(button.app-pagination-action:focus-visible){outline:2px solid var(--action-primary);outline-offset:2px}
 :global(button.app-pagination-action:disabled){opacity:.5;cursor:not-allowed}
</style>
