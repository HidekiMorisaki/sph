<script lang="ts">
	import { onMount } from 'svelte';
	import { apiData } from '$lib/api';
	import AssetManagementShell from '$lib/components/AssetManagementShell.svelte';
	import EmployeeMasterSection from '$lib/components/EmployeeMasterSection.svelte';
	import MasterPageHeader from '$lib/components/MasterPageHeader.svelte';
	import PageTabs from '$lib/components/PageTabs.svelte';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
	import StatusNotice from '$lib/components/StatusNotice.svelte';
	import { localeMessages } from '$lib/locale-messages';
	import { localization } from '$lib/localization';

	const sections = ['employment-types', 'positions', 'departments', 'employee-groups'] as const;
	let text = $derived(localeMessages[$localization.displayLanguage].masters);
	let common = $derived(localeMessages[$localization.displayLanguage].common);
	let title = $derived(localeMessages[$localization.displayLanguage].navigation.items.employment);
	let labels = $derived({ 'employment-types': text.employmentTypes, positions: text.positions, departments: text.departments, 'employee-groups': text.employeeGroups });
	let loading = $state(true);
	let accessDenied = $state(false);
	let loadError = $state(false);
	let errorDismissed = $state(false);
	let canManage = $state(false);
	let activeSection = $state('employment-types');
	onMount(() => {
		void (async () => {
			try {
				const response = await fetch('/v1/auth/session');
				if (response.status === 401) { window.location.assign('/'); return; }
				if (!response.ok) throw new Error();
				const session = await apiData<{ user: { capabilities: { canManageMasters: boolean } } }>(response);
				canManage = session.user.capabilities.canManageMasters;
				accessDenied = !canManage;
			} catch { loadError = true; }
			finally { loading = false; }
		})();

	});
</script>

<AssetManagementShell {title} active="">
	<MasterPageHeader {title} />
	{#if loading}<div class="page-state"><LoadingSpinner label={common.loading} /></div>
	{:else if accessDenied}{#if !errorDismissed}<StatusNotice message={text.employeeAccessDenied} tone="error" onDismiss={() => errorDismissed = true} />{/if}
	{:else if loadError}{#if !errorDismissed}<StatusNotice message={common.loadFailed} tone="error" onDismiss={() => errorDismissed = true} />{/if}
	{:else}
		<div class="settings-layout">
		<PageTabs bind:active={activeSection} label={title} panelPrefix="" idPrefix="employee-master" storageKey="employee-masters-tab" tabs={sections.map(section => ({id:section,label:labels[section]}))} />
			<div class="settings-content">
				{#each sections as section}
					<div id={section} data-section={section} class="settings-card" role="tabpanel" aria-labelledby={`employee-master-${section}-tab`} hidden={activeSection !== section} tabindex="0"><EmployeeMasterSection resource={section} {canManage} /></div>
				{/each}
			</div>
		</div>
	{/if}
</AssetManagementShell>

<style>
 .settings-layout,.settings-content,.settings-card{min-width:0}
 .settings-card{position:relative;min-height:0}
 [role='tabpanel']:focus-visible{outline:2px solid var(--primary);outline-offset:-2px}
 .page-state{padding:24px;background:var(--surface);border:1px solid var(--border);border-radius:6px;color:var(--muted)}
</style>
