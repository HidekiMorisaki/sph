<script lang="ts">
	import { onMount } from 'svelte';
	import { apiData } from '$lib/api';
	import AssetManagementShell from '$lib/components/AssetManagementShell.svelte';
	import MasterPageHeader from '$lib/components/MasterPageHeader.svelte';
	import StatusNotice from '$lib/components/StatusNotice.svelte';
	import SystemInformationSection from '$lib/components/system-settings/SystemInformationSection.svelte';
	import { localeMessages } from '$lib/locale-messages';
	import { localization } from '$lib/localization';

	let text = $derived(localeMessages[$localization.displayLanguage].systemSettings);
	let loading = $state(true);
	let accessDenied = $state(false);
	let loadError = $state(false);
	let pageErrorDismissed = $state(false);

	onMount(() => {
		async function initialize() {
			try {
				const response = await fetch('/v1/auth/session');
				if (response.status === 401) { window.location.assign('/'); return; }
				if (!response.ok) throw new Error();
				const user = (await apiData<{ user: { capabilities: { canManageSystemSettings: boolean } } }>(response)).user;
				accessDenied = !user.capabilities.canManageSystemSettings;
			} catch { loadError = true; }
			finally { loading = false; }
		}
		void initialize();
	});
</script>

<AssetManagementShell title={text.information}>
	<MasterPageHeader title={text.information} description={text.informationDescription} />
	{#if loading}<div class="page-state">{text.informationLoading}</div>
	{:else if accessDenied}{#if !pageErrorDismissed}<StatusNotice message={text.accessDenied} tone="error" onDismiss={() => pageErrorDismissed = true} />{/if}
	{:else if loadError}{#if !pageErrorDismissed}<StatusNotice message={text.informationFailed} tone="error" onDismiss={() => pageErrorDismissed = true} />{/if}
	{:else}<SystemInformationSection />{/if}
</AssetManagementShell>

<style>
	.page-state{padding:24px;background:var(--surface);border:1px solid var(--border);border-radius:6px;color:var(--muted)}
</style>
