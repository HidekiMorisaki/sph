<script lang="ts">
 import type { ComponentProps } from 'svelte';
 import ModalActionButton from './ModalActionButton.svelte';
 let { size = 'field', variant = 'secondary', element = $bindable(), ...attributes }: ComponentProps<typeof ModalActionButton> = $props();
</script>

<ModalActionButton {...attributes} bind:element {size} {variant}/>
