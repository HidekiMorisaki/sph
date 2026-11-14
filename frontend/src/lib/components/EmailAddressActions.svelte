<script lang="ts">
	import { localization } from '#lib/localization.js';
	import { localeMessages, formatLocaleTemplate } from '#lib/locale-messages.js';
	import { mailtoHref } from '#lib/email.js';
	import StatusNotice from '#lib/components/StatusNotice.svelte';
	import CopyIconButton from '#lib/components/CopyIconButton.svelte';

	let commonText = $derived(localeMessages[$localization.displayLanguage].common);

	let { email, subject }: { email: string; subject?: string } = $props();
	let copyMessage = $state<'emailCopied' | 'emailCopyFailed' | ''>('');
	let copyFailed = $state(false);

	async function copyEmailAddress() {
		try {
			await navigator.clipboard.writeText(email);
			copyMessage = 'emailCopied';
			copyFailed = false;
		} catch {
			copyMessage = 'emailCopyFailed';
			copyFailed = true;
		}
	}
</script>

<div class="email-address-actions">
	<a href={mailtoHref(email, subject)} aria-label={formatLocaleTemplate(commonText.composeEmail, email)}>{email}</a>
	<CopyIconButton onclick={() => void copyEmailAddress()} label={formatLocaleTemplate(commonText.copyEmailLabel, email)}/>
</div>
{#if copyMessage}<StatusNotice message={commonText[copyMessage]} tone={copyFailed ? 'error' : 'success'} onDismiss={() => copyMessage = ''} />{/if}

<style>
	.email-address-actions{display:flex;min-width:0;align-items:center;gap:var(--sph-space-8px);flex-wrap:wrap}.email-address-actions a{flex:0 0 auto;max-width:100%;min-width:0;color:var(--action-primary);overflow-wrap:anywhere;text-decoration:none}.email-address-actions a:hover{text-decoration:underline}.email-address-actions a:focus-visible{outline:2px solid var(--sph-color-accent);outline-offset:2px}
</style>
