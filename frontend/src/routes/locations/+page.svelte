<script lang="ts">
	import AssetManagementShell from '$lib/components/AssetManagementShell.svelte';
	import LocationMasterPage from '$lib/components/LocationMasterPage.svelte';
	import MasterPageHeader from '$lib/components/MasterPageHeader.svelte';
	import PageTabs from '$lib/components/PageTabs.svelte';
	import { localeMessages } from '$lib/locale-messages';
	import { localization } from '$lib/localization';

	const sections = ['branches', 'rooms', 'storages'] as const;
	let text = $derived(localeMessages[$localization.displayLanguage].masters);
	let title = $derived(localeMessages[$localization.displayLanguage].navigation.items.locations);
	let labels = $derived({ branches: text.branches, rooms: text.rooms, storages: text.storages });
	let activeSection = $state('branches');
</script>

<AssetManagementShell {title} active="">
	<MasterPageHeader {title} />
	<div class="settings-layout">
		<PageTabs bind:active={activeSection} label={title} panelPrefix="" idPrefix="location" storageKey="locations-tab" tabs={sections.map(section => ({id:section,label:labels[section]}))} />
		<div class="settings-content">
			{#each sections as section}
				<div id={section} data-section={section} class="settings-card" role="tabpanel" aria-labelledby={`location-${section}-tab`} hidden={activeSection !== section} tabindex="0"><LocationMasterPage kind={section === 'storages' ? 'locations' : section} /></div>
			{/each}
		</div>
	</div>
</AssetManagementShell>

<style>
 .settings-layout,.settings-content,.settings-card{min-width:0}
 .settings-card{position:relative;min-height:0}
 [role='tabpanel']:focus-visible{outline:2px solid var(--primary);outline-offset:-2px}
</style>
