<script lang="ts">
 import type { ComponentProps } from 'svelte';
 import ControlButton from './ControlButton.svelte';

 type Props = Omit<ComponentProps<typeof ControlButton>, 'children' | 'type' | 'role' | 'aria-checked' | 'aria-label'> & {
  checked: boolean;
  width?: number;
  onText?: string;
  offText?: string;
  label: string;
 };
 let { checked, width = 52, onText, offText, label, class: className = '', style = '', element = $bindable(), ...attributes }: Props = $props();
 let text = $derived(checked ? onText : offText);
</script>

<ControlButton {...attributes} bind:element type="button" role="switch" aria-checked={checked} aria-label={label} class={['app-status-switch', checked ? 'is-on' : '', className]} style={`${style ?? ''};--app-status-switch-width:${width}px`}>
 {#if text}<span class="app-status-switch__text">{text}</span>{/if}
 <span class="app-status-switch__knob" aria-hidden="true"></span>
</ControlButton>
