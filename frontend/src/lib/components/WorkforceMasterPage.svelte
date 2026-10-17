<script lang="ts">
 import { onMount,tick } from 'svelte';
 import { apiData } from '$lib/api';
 import type {SessionUser} from '$lib/auth';
 import {localeMessages} from '$lib/locale-messages';
 import {localization,formatTimestamp,formatDate} from '$lib/localization';
 import {addressLabels} from '$lib/postal-address';
 import MasterHistorySection from './MasterHistorySection.svelte';
 import {clientTextFields,removedClientFields,type WorkforceMaster} from '$lib/workforce';
 import AddButton from './AddButton.svelte';
 import AssetManagementShell from './AssetManagementShell.svelte';
 import MasterPageHeader from './MasterPageHeader.svelte';
 import ViewportListPage from './ViewportListPage.svelte';
 import MasterList from './MasterList.svelte';
 import DetailModal from './DetailModal.svelte';
 import DetailActionButtons from './DetailActionButtons.svelte';
 import StatusNotice from './StatusNotice.svelte';
 import WorkforceMasterForm from './WorkforceMasterForm.svelte';
 let {kind}:{kind:'skills'|'projects'|'clients'}=$props();
 let text=$derived(localeMessages[$localization.displayLanguage].workforce),common=$derived(localeMessages[$localization.displayLanguage].common);
 let user=$state<SessionUser|null>(null),list=$state<MasterList>(),selected=$state<WorkforceMaster|null>(null),editing=$state<WorkforceMaster|null>(null);
 let address=$derived(addressLabels(selected?.countryCode==='US'?'US':'JP',$localization.displayLanguage));
 let historyLabels=$derived({...Object.fromEntries(Object.entries(text).filter((entry):entry is [string,string]=>typeof entry[1]==='string')),...(kind==='clients'?{prefecture:address.region,postalCode:address.postal}:{})});
 let formOpen=$state(false),deleting=$state(false),busy=$state(false),message=$state(''),detailError=$state('');
 let returnFocus=$state<HTMLElement|null>(null),formFocus=$state<HTMLElement|null>(null),deleteFocus=$state<HTMLElement|null>(null);
 const allowed=(action:string)=>user?.capabilities.workforceOperations?.includes(kind+'.'+action)??false;
 onMount(()=>{void(async()=>{try{const response=await fetch('/v1/auth/session');if(!response.ok)throw new Error();user=(await apiData<{user:SessionUser}>(response)).user;}catch{message=text.failed;}})();});
 async function open(item:WorkforceMaster,trigger:HTMLElement|null){try{const response=await fetch('/v1/'+kind+'/'+item.id);if(!response.ok)throw new Error();selected=await apiData<WorkforceMaster>(response);returnFocus=trigger;detailError='';}catch{message=text.failed;}}
 function close(){selected=null;void tick().then(()=>returnFocus?.focus({preventScroll:true}));}
 async function saved(item:WorkforceMaster){if(editing)selected=item;else message=text.saved;await list?.refresh();}
 async function remove(){if(!selected)return;busy=true;try{const response=await fetch('/v1/'+kind+'/'+selected.id,{method:'DELETE'});if(!response.ok){const payload=await response.json().catch(()=>null);detailError=payload?.error?.code==='RESOURCE_IN_USE'?(kind==='clients'?text.clientInUse:text.inUse):text.failed;deleting=false;return;}deleting=false;close();message=text.removed;await list?.refresh();}catch{detailError=text.failed;deleting=false;}finally{busy=false;}}
</script>
{#snippet listActions()}{#if allowed('create')}<AddButton iconOnly label={text.add+' · '+text[kind]} onclick={event=>{formFocus=event.currentTarget as HTMLElement;editing=null;formOpen=true;}}/>{/if}{/snippet}
<AssetManagementShell title={text[kind]}><ViewportListPage><MasterPageHeader title={text[kind]}/>
 {#if message}<StatusNotice message={message} tone={message===text.failed?'error':'success'} onDismiss={()=>message=''}/>{/if}
 <MasterList bind:this={list} endpoint={'/v1/'+kind} title={text[kind]} listHeading={text[kind]} headerActions={listActions} initialSortBy="name" minTableWidth={620} canDetail onDetail={(item,trigger)=>void open(item as WorkforceMaster,trigger)} columns={[
  {key:'name',label:text.name,width:30,value:(item:WorkforceMaster)=>item.name},
  ...(kind==='skills'?[{key:'category',label:text.category,width:25,value:(item:WorkforceMaster)=>item.category}]:[]),
  ...(kind==='clients'?[{key:'companyName',label:text.companyName,width:30,value:(item:WorkforceMaster)=>item.companyName},{key:'contactName',label:text.contactName,width:20,value:(item:WorkforceMaster)=>item.contactName},{key:'contactEmail',label:text.contactEmail,width:20,value:(item:WorkforceMaster)=>item.contactEmail}]:kind==='projects'?[{key:'clientName',label:text.clientId,width:30,sortable:false,value:(item:WorkforceMaster)=>item.client?.name},{key:'contractStartsOn',label:text.contractStartsOn,width:20,value:(item:WorkforceMaster)=>formatDate(item.contractStartsOn,$localization)},{key:'contractEndsOn',label:text.contractEndsOn,width:20,value:(item:WorkforceMaster)=>formatDate(item.contractEndsOn,$localization)}]:[{key:'description',label:text.description,width:45,value:(item:WorkforceMaster)=>item.description}])
 ]}/>
</ViewportListPage></AssetManagementShell>
{#if selected}<div hidden={formOpen||deleting} inert={formOpen||deleting}>
 <DetailModal title={text[kind]} titleId="workforce-master-detail-title" compact closeLabel={common.cancel} {returnFocus} onClose={close}>
  {#snippet headerActions()}<DetailActionButtons editLabel={common.edit} deleteLabel={common.delete} onEdit={allowed('update')?trigger=>{formFocus=trigger;editing=selected;formOpen=true;}:undefined} onDelete={allowed('delete')?trigger=>{deleteFocus=trigger;deleting=true;}:undefined}/>{/snippet}
  {#if detailError}<StatusNotice message={detailError} tone="error" onDismiss={()=>detailError=''}/>{/if}
  <section class="app-detail-section"><h3>{text.information}</h3><dl class="app-detail-grid">
   <div><dt>{text.name}</dt><dd>{selected.name}</dd></div>
   {#if kind==='skills'}<div><dt>{text.category}</dt><dd>{selected.category}</dd></div>{/if}
   {#if kind!=='clients'}<div class="app-detail-wide"><dt>{text.description}</dt><dd class="app-detail-notes">{selected.description}</dd></div>{/if}
   {#if kind==='projects'}<div><dt>{text.clientId}</dt><dd>{selected.client?.name??'-'}</dd></div><div><dt>{text.companyName}</dt><dd>{selected.client?.companyName??'-'}</dd></div>
    {#each ['contractStartsOn','contractEndsOn'] as field}<div><dt>{text[field as 'contractStartsOn'|'contractEndsOn']}</dt><dd>{formatDate(selected[field as 'contractStartsOn'|'contractEndsOn'],$localization)||'-'}</dd></div>{/each}
   {/if}
   {#if kind==='clients'}
    {#each clientTextFields as field}<div><dt>{field==='prefecture'?address.region:field==='postalCode'?address.postal:text[field]}</dt><dd>{selected[field]??'-'}</dd></div>{/each}
    <div><dt>{text.countryCode}</dt><dd>{selected.countryCode==='JP'?($localization.displayLanguage==='ja'?'日本':'Japan'):($localization.displayLanguage==='ja'?'米国':'United States')}</dd></div>
    <div class="app-detail-wide"><dt>{text.notes}</dt><dd class="app-detail-notes">{selected.notes??'-'}</dd></div>
   {/if}
   <div><dt>{common.created}</dt><dd>{formatTimestamp(selected.createdAt,$localization)}</dd></div><div><dt>{common.updated}</dt><dd>{formatTimestamp(selected.updatedAt,$localization)}</dd></div>
  </dl></section>
 {#if kind!=='skills'}{#key selected.updatedAt}<MasterHistorySection endpoint={'/v1/'+kind} itemId={selected.id} hiddenFields={kind==='clients'?removedClientFields:[]} fieldLabels={historyLabels} dateFields={['openedOn','closedOn','contractStartsOn','contractEndsOn']}/>{/key}{/if}
 </DetailModal></div>{/if}
{#if formOpen}<WorkforceMasterForm {kind} item={editing} returnFocus={formFocus} onClose={()=>formOpen=false} onSaved={saved}/>{/if}
{#if deleting}<DetailModal title={text.deleteTitle} titleId="workforce-master-delete-title" closeLabel={common.cancel} returnFocus={deleteFocus} onClose={()=>{if(!busy)deleting=false;}}><p>{text.deleteHelp}</p>{#snippet actions()}<button class="secondary" disabled={busy} onclick={()=>deleting=false}>{common.cancel}</button><button class="app-danger-action" disabled={busy} onclick={()=>void remove()}>{common.delete}</button>{/snippet}</DetailModal>{/if}
