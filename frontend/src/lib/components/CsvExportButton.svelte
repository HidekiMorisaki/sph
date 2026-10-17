<script lang="ts">
	import { localeMessages } from '$lib/locale-messages';
	import { localization } from '$lib/localization';
	let { exporting = false, disabled = false, onExport }: { exporting?: boolean; disabled?: boolean; onExport: () => void } = $props();
	let text = $derived(localeMessages[$localization.displayLanguage].common);
</script>

<button class="export-button" type="button" disabled={exporting || disabled} aria-busy={exporting} onclick={onExport}>{exporting ? text.exporting : text.exportCsv}</button>

<style>
	.export-button{display:inline-flex;align-items:center;justify-content:center;height:32px;padding:0 12px;background:var(--surface)!important;color:var(--text-secondary)!important;border:1px solid var(--border);border-radius:4px;box-shadow:var(--shadow);font-size:var(--font-size-body);font-weight:500;line-height:1;transition:background 120ms,border-color 120ms,color 120ms,box-shadow 120ms;white-space:nowrap;cursor:pointer}.export-button:hover:not(:disabled){background:var(--surface-hover,var(--surface-secondary))!important;color:var(--text)!important}.export-button:disabled{cursor:not-allowed;opacity:.5}.export-button:focus{outline:none}.export-button:focus-visible{outline:2px solid #1abb9c;outline-offset:2px}@media(max-width:700px){.export-button{width:100%}}
</style>
