<script lang="ts">
 import {localization} from '$lib/localization';
 import {localeMessages} from '$lib/locale-messages';
 import PageTabs from '../PageTabs.svelte';
 import FinancialPeriodSettingsSection from './FinancialPeriodSettingsSection.svelte';
 import FinancialRegistrationSection from './FinancialRegistrationSection.svelte';
 let text=$derived(localeMessages[$localization.displayLanguage].systemSettings);
 let active=$state('period'),registrationOpened=$state(false),periodVersion=$state(0);
 $effect(()=>{if(active==='registration')registrationOpened=true;});
</script>
<PageTabs bind:active label={text.financialTab} idPrefix="system-financial" storageKey="system-settings-financial-tab" tabs={[{id:'period',label:text.financialPeriodTab},{id:'registration',label:localeMessages[$localization.displayLanguage].navigation.items.businessOverview}]}/>
<div id="system-financial-period" role="tabpanel" aria-labelledby="system-financial-period-tab" hidden={active!=='period'} tabindex="0"><FinancialPeriodSettingsSection onSaved={()=>periodVersion++}/></div>
<div id="system-financial-registration" role="tabpanel" aria-labelledby="system-financial-registration-tab" hidden={active!=='registration'} tabindex="0">{#if registrationOpened}<FinancialRegistrationSection {periodVersion}/>{/if}</div>
<style>[role=tabpanel]{min-width:0}[role=tabpanel]:focus-visible{outline:2px solid var(--primary);outline-offset:-2px}</style>
