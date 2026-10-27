<script lang="ts">
 import type { Snippet } from 'svelte';
 import type { HTMLButtonAttributes } from 'svelte/elements';
 // Visual controls (calendar cells, switches, drag handles) keep their domain geometry.
 let { children, element = $bindable(), type = 'button', ...attributes }:
  Omit<HTMLButtonAttributes, 'children'> & { children?: Snippet; element?: HTMLButtonElement } = $props();
</script>

<button {...attributes} bind:this={element} {type}>{#if children}{@render children()}{/if}</button>
