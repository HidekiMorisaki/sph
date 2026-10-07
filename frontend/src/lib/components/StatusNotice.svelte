<script lang="ts">
	import { localeMessages } from '$lib/locale-messages';
	import { localization } from '$lib/localization';

	let {
		message,
		tone = 'info',
		title = '',
		onDismiss
	}: {
		message: string;
		tone?: 'info' | 'success' | 'warning' | 'error';
		title?: string;
		onDismiss: () => void;
	} = $props();
	let closeLabel = $derived(localeMessages[$localization.displayLanguage].common.close);
</script>

<div class="status-notice" class:info={tone === 'info'} class:success={tone === 'success'} class:warning={tone === 'warning'} class:error={tone === 'error'} role={tone === 'error' || tone === 'warning' ? 'alert' : 'status'}>
	<div class="status-notice-copy">
		{#if title}<strong>{title}</strong>{/if}
		<span>{message}</span>
	</div>
	<button class="status-notice-close" type="button" aria-label={closeLabel} title={closeLabel} onclick={onDismiss}>×</button>
</div>

<style>
	.status-notice{display:flex;grid-column:1/-1;align-items:flex-start;justify-content:space-between;gap:12px;min-width:0;margin:0 0 16px;padding:10px 12px;border:1px solid;border-radius:5px;font-size:var(--font-size-support);line-height:1.6}
	.status-notice-copy{display:grid;gap:2px;min-width:0;overflow-wrap:anywhere}
	.status-notice-copy strong{font-weight:700}
	.info{color:var(--action-primary);background:color-mix(in srgb,var(--action-primary) 9%,var(--surface));border-color:color-mix(in srgb,var(--action-primary) 34%,var(--border))}
	.success{color:#168b76;background:color-mix(in srgb,#1abb9c 9%,var(--surface));border-color:color-mix(in srgb,#1abb9c 38%,var(--border))}
	.warning{color:#9a6700;background:color-mix(in srgb,#f0ad4e 13%,var(--surface));border-color:color-mix(in srgb,#f0ad4e 52%,var(--border))}
	.error{color:var(--danger);background:color-mix(in srgb,var(--danger) 9%,var(--surface));border-color:color-mix(in srgb,var(--danger) 38%,var(--border))}
	:global([data-theme='dark']) .info{color:#8dc6f5}
	:global([data-theme='dark']) .success{color:#65d5be}
	:global([data-theme='dark']) .warning{color:#ffd075}
	:global([data-theme='dark']) .error{color:#ff8d8d}
	.status-notice-close{display:grid;place-items:center;flex:none;width:28px;height:28px;margin:-4px -6px -4px 0;padding:0;background:transparent!important;color:inherit!important;border:0;border-radius:4px;font:inherit;font-size:22px;line-height:1;cursor:pointer}
	.status-notice-close:hover{background:color-mix(in srgb,currentColor 10%,transparent)!important}
	.status-notice-close:focus-visible{outline:2px solid currentColor;outline-offset:2px}
</style>
