<script lang="ts">
 import type {HTMLButtonAttributes} from 'svelte/elements';
 import IconActionButton from './IconActionButton.svelte';
 import MenuItemIcon from './MenuItemIcon.svelte';
 let {label,...attributes}:{label:string}&Omit<HTMLButtonAttributes,'children'>=$props();
</script>
<IconActionButton {...attributes} size="small" class="delete-icon-button" aria-label={label} title={label}><MenuItemIcon name="delete"/></IconActionButton>
<style>:global(.delete-icon-button.app-icon-action){color:var(--danger)}</style>
