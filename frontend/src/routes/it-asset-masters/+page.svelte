<script lang="ts">
	import AssetManagementShell from '$lib/components/AssetManagementShell.svelte';
	import ItAssetMasterSection from '$lib/components/ItAssetMasterSection.svelte';
	import CpuTypesPage from '$lib/components/CpuTypesPage.svelte';
	import MasterPageHeader from '$lib/components/MasterPageHeader.svelte';
	import PageTabs from '$lib/components/PageTabs.svelte';
	import { localeMessages } from '$lib/locale-messages';
	import { localization } from '$lib/localization';

	const sections = ['it-asset-statuses', 'it-asset-types', 'manufacturers', 'cpu-types', 'operating-system-vendors', 'operating-systems'] as const;
	let text = $derived(localeMessages[$localization.displayLanguage].masters);
	let title = $derived(localeMessages[$localization.displayLanguage].navigation.items.itMasters);
	let labels = $derived({ 'it-asset-types': text.itAssetTypes, manufacturers: text.manufacturers, 'cpu-types': text.cpuTitle, 'operating-system-vendors': text.operatingSystemVendors, 'operating-systems': text.operatingSystems, 'it-asset-statuses': text.statuses });
	let activeSection = $state('it-asset-statuses');
</script>

<AssetManagementShell {title} active="">
	<MasterPageHeader {title} />
	<div class="settings-layout">
		<PageTabs bind:active={activeSection} label={title} panelPrefix="" idPrefix="it-master" storageKey="it-asset-masters-tab" tabs={sections.map(section => ({id:section,label:labels[section]}))} />
		<div class="settings-content">
			{#each sections as section}
				<div id={section} data-section={section} class="settings-card" role="tabpanel" aria-labelledby={`it-master-${section}-tab`} hidden={activeSection !== section} tabindex="0">
					{#if section === 'cpu-types'}<CpuTypesPage />{:else}<ItAssetMasterSection resource={section} />{/if}
				</div>
			{/each}
		</div>
	</div>
</AssetManagementShell>

<style>
 .settings-layout,.settings-content,.settings-card{min-width:0}
 .settings-card{position:relative;min-height:0}
 [role='tabpanel']:focus-visible{outline:2px solid var(--primary);outline-offset:-2px}
</style>
