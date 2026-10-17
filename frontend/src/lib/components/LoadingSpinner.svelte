<script lang="ts">
	import { localeMessages } from '$lib/locale-messages';
	import { localization } from '$lib/localization';

	let { label, compact = false, inline = false }: { label?: string; compact?: boolean; inline?: boolean } = $props();
	let fallbackLabel = $derived(localeMessages[$localization.displayLanguage].common.loading);
</script>

<div class="loading-spinner" class:compact class:inline role="status" aria-label={label ?? fallbackLabel}>
	<span class="spinner" aria-hidden="true"></span>
</div>

<style>
	.loading-spinner{display:flex;align-items:center;justify-content:center;min-height:72px;padding:16px}
	.loading-spinner.compact{min-height:40px;padding:8px}
	.loading-spinner.inline{justify-content:flex-start;min-height:0;padding:0}
	.spinner{width:20px;height:20px;flex:none;border:2px solid color-mix(in srgb,var(--action-primary) 25%,transparent);border-top-color:var(--action-primary);border-radius:50%;animation:loading-spin .8s linear infinite}
	.compact .spinner,.inline .spinner{width:16px;height:16px}
	@keyframes loading-spin{to{transform:rotate(360deg)}}
	@media(prefers-reduced-motion:reduce){.spinner{animation:none}}
</style>
