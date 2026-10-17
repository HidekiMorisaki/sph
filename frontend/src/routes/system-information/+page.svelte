<script lang="ts">
	import { onMount } from 'svelte';
	import { apiData } from '$lib/api';
	import AssetManagementShell from '$lib/components/AssetManagementShell.svelte';
	import MasterPageHeader from '$lib/components/MasterPageHeader.svelte';
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
	let activeTab = $state<InformationTab>('server');
	function tabKeydown(event: KeyboardEvent) {
		if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
		event.preventDefault();
		activeTab = event.key === 'Home' ? 'server' : event.key === 'End' ? 'about' : tabs[(tabs.indexOf(activeTab) + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
		document.getElementById(`${id}-${activeTab}-tab`)?.focus();
	}

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

<div class="system-information-page">
<AssetManagementShell title={text.information}>
	<MasterPageHeader title={text.information} />
	{#if loading}<div class="page-state"><LoadingSpinner label={text.informationLoading} /></div>
	{:else if accessDenied}{#if !pageErrorDismissed}<StatusNotice message={text.accessDenied} tone="error" onDismiss={() => pageErrorDismissed = true} />{/if}
	{:else if loadError}{#if !pageErrorDismissed}<StatusNotice message={text.informationFailed} tone="error" onDismiss={() => pageErrorDismissed = true} />{/if}
	{:else}
		<div class="information-tabs" role="tablist" aria-label={text.information}>
			{#each tabs as tab}
				<button type="button" role="tab" id={`${id}-${tab}-tab`} data-information-tab={tab} aria-controls={`${id}-${tab}-panel`} aria-selected={activeTab === tab} tabindex={activeTab === tab ? 0 : -1} onclick={() => activeTab = tab} onkeydown={tabKeydown}>{tab === 'server' ? text.serverInformation : text.aboutSph}</button>
			{/each}
		</div>
		{#each tabs as tab}
			<div role="tabpanel" id={`${id}-${tab}-panel`} aria-labelledby={`${id}-${tab}-tab`} hidden={activeTab !== tab} tabindex="0">
				{#if activeTab === tab}{#if tab === 'server'}<SystemMonitoringSection />{:else}<SystemInformationSection />{/if}{/if}
			</div>
		{/each}
	{/if}
</AssetManagementShell>
</div>

<style>
	:global([data-theme='dark']) .system-information-page{--border:#2c3542;--border-light:#252e3c}
	.page-state{padding:24px;background:var(--surface);border:1px solid var(--border);border-radius:6px;color:var(--muted)}
	.information-tabs{display:flex;gap:12px;overflow-x:auto;margin-bottom:16px;padding:0 16px;background:var(--surface);border:1px solid var(--border);border-radius:6px}
	.information-tabs button{flex:none;min-height:44px;margin:0;padding:10px 8px;background:transparent;border:0;border-bottom:2px solid transparent;border-radius:0;color:var(--text-secondary,var(--muted));font:inherit;white-space:nowrap;cursor:pointer}
	.information-tabs button[aria-selected='true']{border-bottom-color:var(--primary);color:var(--primary);font-weight:600}
	.information-tabs button:hover{background:var(--surface-hover,var(--surface-secondary))}
	.information-tabs button:focus-visible,[role='tabpanel']:focus-visible{outline:2px solid var(--primary);outline-offset:-2px}
</style>
