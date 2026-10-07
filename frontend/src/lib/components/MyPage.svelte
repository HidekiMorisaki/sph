<script lang="ts">
	import { localeMessages, formatLocaleTemplate } from '$lib/locale-messages';
	import { roleNames, type SessionUser } from '$lib/auth';
	import { formatEmployeeName, localization } from '$lib/localization';
	import MasterPageHeader from './MasterPageHeader.svelte';
	import StatusNotice from './StatusNotice.svelte';

	let { user }: { user: SessionUser } = $props();
	let pageText = $derived(localeMessages[$localization.displayLanguage].myPage);
	let noticeDismissed = $state(false);
</script>

<div aria-labelledby="my-page-title"><MasterPageHeader title={pageText.title} titleId="my-page-title" description={formatLocaleTemplate(pageText.welcome, formatEmployeeName(user, $localization) || user.username)} />
{#if !noticeDismissed}<StatusNotice message={pageText.underDevelopment} tone="info" onDismiss={() => noticeDismissed = true} />{/if}
<div class="cards"><article><small>{pageText.assetOverview}</small><b>{pageText.ready}</b><span>{pageText.inventory}</span></article><article><small>{pageText.attention}</small><b>{pageText.noAlerts}</b><span>{pageText.assignments}</span></article><article><small>{pageText.account}</small><b>{roleNames(user)}</b><span>{user.email ?? pageText.emailUnset}</span></article></div><section class="panel"><h2>{pageText.management}</h2><p>{pageText.sidebarHelp}</p></section></div>

<style>
  h2,p{margin:0}
  .cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;margin:2px 0 26px}
  .cards article,.panel{padding:18px;background:var(--surface);border:1px solid var(--border);border-radius:7px;box-shadow:var(--shadow)}
  .cards small{color:var(--muted);font-size:var(--font-size-support);font-weight:700;letter-spacing:.07em}.cards b{display:block;margin:8px 0 4px;font-size:20px}.cards span,.panel p{color:var(--muted);font-size:var(--font-size-body)}.panel h2{margin-bottom:7px;font-size:var(--font-size-section)}
	@media(max-width:760px){.cards{grid-template-columns:1fr}}
</style>
