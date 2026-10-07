<script lang="ts">
	import { onMount } from 'svelte';
	import AssetManagementShell from '$lib/components/AssetManagementShell.svelte';
	import ItAssetMasterSection from '$lib/components/ItAssetMasterSection.svelte';
	import CpuTypesPage from '$lib/components/CpuTypesPage.svelte';
	import MasterPageHeader from '$lib/components/MasterPageHeader.svelte';
	import { localeMessages } from '$lib/locale-messages';
	import { localization } from '$lib/localization';

	const sections = ['it-asset-statuses', 'it-asset-types', 'manufacturers', 'cpu-types', 'operating-system-vendors', 'operating-systems'] as const;
	type Section = (typeof sections)[number];
	let text = $derived(localeMessages[$localization.displayLanguage].masters);
	let title = $derived(localeMessages[$localization.displayLanguage].navigation.items.itMasters);
	let labels = $derived({ 'it-asset-types': text.itAssetTypes, manufacturers: text.manufacturers, 'cpu-types': text.cpuTitle, 'operating-system-vendors': text.operatingSystemVendors, 'operating-systems': text.operatingSystems, 'it-asset-statuses': text.statuses });
	let activeSection = $state<Section>('it-asset-statuses');
	let scrollFrame: number | null = null;
	let navigationLockUntil = 0;

	function updateActiveSection() {
		scrollFrame = null;
		if (window.performance.now() < navigationLockUntil) return;
		let next: Section = sections[0];
		let nextTop = -Infinity;
		for (const section of sections) {
			const top = document.getElementById(section)?.getBoundingClientRect().top;
			if (top !== undefined && top <= 104) {
				if (top > nextTop + 2) { next = section; nextTop = top; }
				else if (Math.abs(top - nextTop) <= 2 && section === activeSection) next = section;
			}
		}
		activeSection = next;
	}
	function scheduleActiveSectionUpdate() {
		if (scrollFrame === null) scrollFrame = window.requestAnimationFrame(updateActiveSection);
	}
	function selectSection(event: MouseEvent, section: Section) {
		event.preventDefault();
		activeSection = section;
		navigationLockUntil = window.performance.now() + 1200;
		document.getElementById(section)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	}
	onMount(() => {
		window.addEventListener('scroll', scheduleActiveSectionUpdate, { passive: true });
		window.addEventListener('resize', scheduleActiveSectionUpdate);
		updateActiveSection();
		return () => {
			window.removeEventListener('scroll', scheduleActiveSectionUpdate);
			window.removeEventListener('resize', scheduleActiveSectionUpdate);
			if (scrollFrame !== null) window.cancelAnimationFrame(scrollFrame);
		};
	});
</script>

<AssetManagementShell {title} active="">
	<MasterPageHeader {title} description={text.itDescription} />
	<div class="settings-layout">
		<nav class="settings-nav" aria-label={title}>
			{#each sections as section}
				<a class:active={activeSection === section} href={`#${section}`} aria-current={activeSection === section ? 'location' : undefined} onclick={(event) => selectSection(event, section)}>{labels[section]}</a>
			{/each}
		</nav>
		<div class="settings-content">
			{#each sections as section}
				<section id={section} class="settings-card" aria-label={labels[section]}>
					{#if section === 'cpu-types'}<CpuTypesPage />{:else}<ItAssetMasterSection resource={section} />{/if}
				</section>
			{/each}
		</div>
	</div>
</AssetManagementShell>

<style>
	.settings-layout{display:grid;grid-template-columns:220px minmax(0,1fr);gap:20px;align-items:start}
	.settings-nav{position:sticky;top:72px;z-index:2;display:flex;align-self:start;flex-direction:column;gap:1px;padding:6px;background:var(--surface);border:1px solid var(--border);border-radius:6px;box-shadow:var(--shadow);isolation:isolate}
	.settings-nav a{display:flex;align-items:center;min-height:32px;padding:7px 10px;color:var(--text-secondary);border-radius:4px;font-size:var(--font-size-body);font-weight:500;text-decoration:none;transition:background 120ms,color 120ms}
	.settings-nav a:hover,.settings-nav a:focus-visible{background:var(--surface-secondary);color:var(--text)}
	.settings-nav a:focus-visible{outline:2px solid #1abb9c;outline-offset:1px}
	.settings-nav a.active{background:rgba(51,122,183,.14);color:var(--action-primary)}
	.settings-content{display:grid;min-width:0;grid-template-columns:minmax(0,1fr);gap:16px;isolation:isolate}
	.settings-card{position:relative;min-width:0;min-height:0;scroll-margin-top:72px}
	@media(max-width:900px){.settings-layout{grid-template-columns:1fr}.settings-nav{position:static;display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}.settings-nav a{justify-content:center;text-align:center}}
	@media(max-width:700px){.settings-layout{gap:16px}.settings-nav{grid-template-columns:1fr}.settings-nav a{justify-content:flex-start;text-align:left}}
</style>
