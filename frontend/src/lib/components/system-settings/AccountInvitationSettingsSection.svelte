<script lang="ts">
	import { onMount } from 'svelte';
	import { apiData } from '#lib/api.js';
	import ActionButton from '#lib/components/ActionButton.svelte';
	import FormInput from '#lib/components/FormInput.svelte';
	import FormSection from '#lib/components/FormSection.svelte';
	import LoadingSpinner from '#lib/components/LoadingSpinner.svelte';
	import StatusNotice from '#lib/components/StatusNotice.svelte';
	import { localization } from '#lib/localization.js';
	import { localeMessages } from '#lib/locale-messages.js';
	let { canUpdate }: { canUpdate: boolean } = $props();
	let text = $derived(localeMessages[$localization.displayLanguage].systemSettings);
	let common = $derived(localeMessages[$localization.displayLanguage].common);
	let value = $state(''), saved = $state('');
	let loading = $state(true), loaded = $state(false), saving = $state(false), invalid = $state(false);
	let notice = $state<'loadFailed' | 'invitationSettingsSaved' | 'invitationSettingsSaveFailed' | ''>('');

	onMount(() => {
		void fetch('/v1/account-invitation-settings', { cache: 'no-store' }).then(async response => {
			if (!response.ok) throw new Error();
			const data = await apiData<{ validityMinutes: number }>(response);
			value = saved = String(data.validityMinutes); loaded = true;
		}).catch(() => { notice = 'loadFailed'; }).finally(() => loading = false);
	});
	async function save(event: SubmitEvent) {
		event.preventDefault();
		if (!loaded || saving || !canUpdate || value === saved) return;
		const validityMinutes = Number(value);
		invalid = !value.trim() || !Number.isInteger(validityMinutes) || validityMinutes < 1 || validityMinutes > 60;
		if (invalid) return;
		saving = true; notice = '';
		try {
			const response = await fetch('/v1/account-invitation-settings', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ validityMinutes }) });
			if (!response.ok) throw new Error();
			const data = await apiData<{ validityMinutes: number }>(response);
			value = saved = String(data.validityMinutes); notice = 'invitationSettingsSaved';
		} catch { notice = 'invitationSettingsSaveFailed'; }
		finally { saving = false; }
	}
</script>

<section id="account-invitations" class="app-detail-section invitation-settings-section"><FormSection title={text.accountInvitations}>
	<div class="invitation-settings">
		{#if notice}<StatusNotice message={text[notice]} tone={notice === 'invitationSettingsSaved' ? 'success' : 'error'} onDismiss={() => notice = ''} />{/if}
		{#if loading}<LoadingSpinner label={common.loading} compact />{:else if loaded}
			<form onsubmit={save} novalidate>
				{#snippet validityHelp()}<p>{text.invitationSettingsDescription}</p>{/snippet}
				<FormInput help={validityHelp} label={text.invitationValidityMinutes} field="invitation-validity-minutes" type="number" inputmode="numeric" min="1" max="60" step="1" required {value} disabled={saving || !canUpdate} error={invalid ? text.invitationSettingsInvalid : ''} onValueChange={next => { value = next; invalid = false; }} />
				<ActionButton type="submit" variant="primary" disabled={saving || !canUpdate || value === saved}>{saving ? common.saving : common.saveChanges}</ActionButton>
			</form>
		{/if}
	</div>
</FormSection></section>

<style>
	.invitation-settings{grid-column:1/-1;min-width:0}form{display:grid;gap:var(--sph-space-16px);max-width:24rem}form :global(button){justify-self:start}
</style>
