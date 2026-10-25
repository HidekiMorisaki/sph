<script lang="ts">
 import {localization} from '$lib/localization';
 import {localeMessages} from '$lib/locale-messages';
 import type {SessionUser} from '$lib/auth';
 import PageTabs from '../PageTabs.svelte';
 import EmployeeMasterSection from '../EmployeeMasterSection.svelte';
 import LocationMasterPage from '../LocationMasterPage.svelte';
 import ItAssetMasterSection from '../ItAssetMasterSection.svelte';
 import CpuTypesPage from '../CpuTypesPage.svelte';
 let {user}:{user:SessionUser}=$props();
 let text=$derived(localeMessages[$localization.displayLanguage].masters),navigation=$derived(localeMessages[$localization.displayLanguage].navigation);
 let active=$state('employment'),employment=$state('employment-types'),location=$state('branches'),it=$state('it-asset-statuses');
 let visited=$state<Record<string,boolean>>({employment:true});
 $effect(()=>{visited[active]=true;});
 const employmentSections=['employment-types','positions','departments','employee-groups'] as const;
 const locationSections=['branches','rooms','storages'] as const;
 const itSections=['it-asset-statuses','it-asset-types','manufacturers','cpu-types','operating-system-vendors','operating-systems'] as const;
 let labels=$derived({'employment-types':text.employmentTypes,positions:text.positions,departments:text.departments,'employee-groups':text.employeeGroups,branches:text.branches,rooms:text.rooms,storages:text.storages,'it-asset-statuses':text.statuses,'it-asset-types':text.itAssetTypes,manufacturers:text.manufacturers,'cpu-types':text.cpuTitle,'operating-system-vendors':text.operatingSystemVendors,'operating-systems':text.operatingSystems});
</script>
<PageTabs bind:active label={navigation.groups.masterManagement} idPrefix="system-master" storageKey="system-settings-masters-tab" tabs={[{id:'employment',label:navigation.items.employment},{id:'locations',label:navigation.items.locations},{id:'it-assets',label:navigation.items.itMasters}]}/>
<div id="system-master-employment" role="tabpanel" aria-labelledby="system-master-employment-tab" hidden={active!=='employment'} tabindex="0">{#if visited.employment}
 <PageTabs bind:active={employment} label={navigation.items.employment} idPrefix="system-employment" storageKey="employee-masters-tab" tabs={employmentSections.map(id=>({id,label:labels[id]}))}/>
 {#each employmentSections as resource}<div id={`system-employment-${resource}`} role="tabpanel" aria-labelledby={`system-employment-${resource}-tab`} hidden={employment!==resource} tabindex="0"><EmployeeMasterSection {resource} canManage={user.capabilities.canManageMasters}/></div>{/each}
{/if}</div>
<div id="system-master-locations" role="tabpanel" aria-labelledby="system-master-locations-tab" hidden={active!=='locations'} tabindex="0">{#if visited.locations}
 <PageTabs bind:active={location} label={navigation.items.locations} idPrefix="system-location" storageKey="locations-tab" tabs={locationSections.map(id=>({id,label:labels[id]}))}/>
 {#each locationSections as resource}<div id={`system-location-${resource}`} role="tabpanel" aria-labelledby={`system-location-${resource}-tab`} hidden={location!==resource} tabindex="0"><LocationMasterPage kind={resource==='storages'?'locations':resource}/></div>{/each}
{/if}</div>
<div id="system-master-it-assets" role="tabpanel" aria-labelledby="system-master-it-assets-tab" hidden={active!=='it-assets'} tabindex="0">{#if visited['it-assets']}
 <PageTabs bind:active={it} label={navigation.items.itMasters} idPrefix="system-it-master" storageKey="it-asset-masters-tab" tabs={itSections.map(id=>({id,label:labels[id]}))}/>
 {#each itSections as resource}<div id={`system-it-master-${resource}`} role="tabpanel" aria-labelledby={`system-it-master-${resource}-tab`} hidden={it!==resource} tabindex="0">{#if resource==='cpu-types'}<CpuTypesPage/>{:else}<ItAssetMasterSection {resource}/>{/if}</div>{/each}
{/if}</div>
<style>[role=tabpanel]{min-width:0}[role=tabpanel]:focus-visible{outline:2px solid var(--primary);outline-offset:-2px}</style>
