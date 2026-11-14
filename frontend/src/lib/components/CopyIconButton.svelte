<script lang="ts">
 import type {ComponentProps} from 'svelte';
 import IconActionButton from './IconActionButton.svelte';
 type Props=Omit<ComponentProps<typeof IconActionButton>,'children'|'size'|'aria-label'|'title'|'type'> & {label:string};
 let {label,class:className='',element=$bindable(),...attributes}:Props=$props();
</script>

<IconActionButton {...attributes} bind:element type="button" size="small" class={['copy-icon-button',className]} aria-label={label} title={label}>
 <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M15 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h3"/></svg>
</IconActionButton>
