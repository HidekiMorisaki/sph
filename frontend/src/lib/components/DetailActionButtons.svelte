<script lang="ts">
	import MenuItemIcon from './MenuItemIcon.svelte';

	let { editLabel, deleteLabel, onEdit, onDelete, disabled = false }: {
		editLabel: string;
		deleteLabel: string;
		onEdit?: (trigger: HTMLButtonElement) => void;
		onDelete?: (trigger: HTMLButtonElement) => void;
		disabled?: boolean;
	} = $props();
</script>

<div class="detail-action-buttons">
	{#if onEdit}<button class="detail-header-edit" type="button" aria-label={editLabel} title={editLabel} {disabled} onclick={(event) => onEdit?.(event.currentTarget)}><MenuItemIcon name="edit" /></button>{/if}
	{#if onDelete}<button class="detail-header-delete" type="button" aria-label={deleteLabel} title={deleteLabel} {disabled} onclick={(event) => onDelete?.(event.currentTarget)}><MenuItemIcon name="delete" /></button>{/if}
</div>

<style>
	.detail-action-buttons{display:flex;align-items:center;gap:4px}
	button{display:grid;place-items:center;width:34px;height:34px;padding:7px;border:0;border-radius:4px;background:transparent;color:var(--text-secondary);cursor:pointer}
	button:hover:not(:disabled){background:var(--surface-hover,var(--bg))}
	button:focus-visible{outline:2px solid var(--action-primary);outline-offset:2px}
	button:disabled{opacity:.5;cursor:not-allowed}
	.detail-header-delete{color:var(--danger)}
	button :global(svg){width:18px;height:18px}
</style>
