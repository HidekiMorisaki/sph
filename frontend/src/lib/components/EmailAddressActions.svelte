<script lang="ts">
	import { localization } from '$lib/localization';
	import { localeMessages, formatLocaleTemplate } from '$lib/locale-messages';
	import { mailtoHref } from '$lib/email';

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
	<button type="button" onclick={() => void copyEmailAddress()} aria-label={formatLocaleTemplate(commonText.copyEmailLabel, email)} title={commonText.copyEmail}>
		<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M15 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h3"/></svg>
		<span>{commonText.copy}</span>
	</button>
</div>
{#if copyMessage}<span class:error={copyFailed} class="copy-message" role={copyFailed ? 'alert' : 'status'}>{commonText[copyMessage]}</span>{/if}

<style>
	.email-address-actions{display:flex;min-width:0;align-items:center;gap:8px;flex-wrap:wrap}.email-address-actions a{min-width:0;color:var(--action-primary);overflow-wrap:anywhere;text-decoration:none}.email-address-actions a:hover{text-decoration:underline}.email-address-actions a:focus-visible,.email-address-actions button:focus-visible{outline:2px solid #1abb9c;outline-offset:2px}.email-address-actions button{display:inline-flex;align-items:center;gap:4px;min-height:26px;padding:3px 8px;border:1px solid var(--border);border-radius:4px;background:var(--surface-secondary);color:var(--text-secondary);font:inherit;cursor:pointer}.email-address-actions button:hover{border-color:var(--action-primary);color:var(--action-primary)}.email-address-actions svg{width:14px;height:14px}.copy-message{display:block;margin-top:4px;color:#169f85;font-size:11px}.copy-message.error{color:var(--danger)}
</style>
