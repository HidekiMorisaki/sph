<script lang="ts">
	import { onMount } from 'svelte';
	import { apiData } from '$lib/api';
	import AssetManagementShell from '$lib/components/AssetManagementShell.svelte';
	import MasterPageHeader from '$lib/components/MasterPageHeader.svelte';
	import PageTabs from '$lib/components/PageTabs.svelte';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
	import StatusNotice from '$lib/components/StatusNotice.svelte';
	import SystemInformationSection from '$lib/components/system-settings/SystemInformationSection.svelte';
	import SystemMonitoringSection from '$lib/components/system-settings/SystemMonitoringSection.svelte';
	import { localeMessages } from '$lib/locale-messages';
	import { localization } from '$lib/localization';

	let text = $derived(localeMessages[$localization.displayLanguage].systemSettings);
	let loading = $state(true);
	let accessDenied = $state(false);
	let loadError = $state(false);
	let pageErrorDismissed = $state(false);
	const id = $props.id();
	type InformationTab = 'server' | 'about';
	const tabs: InformationTab[] = ['server', 'about'];
	let activeTab = $state('server');

	onMount(() => {
		async function initialize() {
			try {
				const response = await fetch('/v1/auth/session');
				if (response.status === 401) { window.location.assign('/'); return; }
				if (!response.ok) throw new Error();
				const user = (await apiData<{ user: { id: number; capabilities: { canManageSystemSettings: boolean } } }>(response)).user;
				accessDenied = !user.capabilities.canManageSystemSettings;

			} catch { loadError = true; }
			finally { loading = false; }
		}
		void initialize();
	});
</script>

<div class="system-information-page">
<AssetManagementShell title={text.information}>
	<MasterPageHeader title={text.information} />
	{#if loading}<div class="page-state"><LoadingSpinner label={text.informationLoading} /></div>
	{:else if accessDenied}{#if !pageErrorDismissed}<StatusNotice message={text.accessDenied} tone="error" onDismiss={() => pageErrorDismissed = true} />{/if}
	{:else if loadError}{#if !pageErrorDismissed}<StatusNotice message={text.informationFailed} tone="error" onDismiss={() => pageErrorDismissed = true} />{/if}
	{:else}
		<PageTabs bind:active={activeTab} label={text.information} idPrefix={id} storageKey="system-information-tab" tabs={[{id:'server',label:text.serverInformation},{id:'about',label:text.aboutSph}]} />
		{#each tabs as tab}
			<div role="tabpanel" id={`${id}-${tab}`} aria-labelledby={`${id}-${tab}-tab`} hidden={activeTab !== tab} tabindex="0">
				{#if activeTab === tab}{#if tab === 'server'}<SystemMonitoringSection />{:else}<SystemInformationSection />{/if}{/if}
			</div>
		{/each}
	{/if}
</AssetManagementShell>
</div>

<style>
	:global([data-theme='dark']) .system-information-page{--border:#2c3542;--border-light:#252e3c}
	.page-state{padding:24px;background:var(--surface);border:1px solid var(--border);border-radius:6px;color:var(--muted)}

	[role='tabpanel']:focus-visible{outline:2px solid var(--primary);outline-offset:-2px}
</style>
