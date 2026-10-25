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
 import DetailTabs from '$lib/components/DetailTabs.svelte';
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
 async function remove(){if(!selected)return;busy=true;try{const response=await fetch('/v1/'+kind+'/'+selected.id,{method:'DELETE'});if(!response.ok){const payload=await response.json().catch(()=>null);detailError=payload?.error?.code==='RESOURCE_IN_USE'?(kind==='clients'?text.clientInUse:text.inUse):text.failed;deleting=false;return;}deleting=false;formOpen=false;editing=null;close();message=text.removed;await list?.refresh();}catch{detailError=text.failed;deleting=false;}finally{busy=false;}}
</script>
{#snippet listActions()}{#if allowed('create')}<AddButton iconOnly label={text.add+' · '+text[kind]} onclick={event=>{formFocus=event.currentTarget as HTMLElement;editing=null;formOpen=true;}}/>{/if}{/snippet}
{#snippet mobileSkill(item:WorkforceMaster)}
 <div class="mobile-skill">
  <strong>{item.name}</strong>
  {#if kind==='skills' && item.category}<span class="mobile-skill-category">{item.category}</span>{/if}
  {#if kind==='clients'}<span class="mobile-skill-category">{item.companyName || '-'}</span><span class="mobile-skill-category">{item.contactName || '-'} · {item.contactEmail || '-'}</span>{/if}
  {#if kind==='projects'}<span class="mobile-skill-category">{item.client?.name || '-'}</span><span class="mobile-skill-category">{formatDate(item.contractStartsOn,$localization) || '-'} – {formatDate(item.contractEndsOn,$localization) || '-'}</span>{/if}
  {#if kind==='skills' && item.description}<p class="mobile-skill-description">{item.description}</p>{/if}
 </div>
{/snippet}
<AssetManagementShell title={text[kind]}><ViewportListPage><MasterPageHeader title={text[kind]}/>
 {#if message}<StatusNotice message={message} tone={message===text.failed?'error':'success'} onDismiss={()=>message=''}/>{/if}
 <MasterList bind:this={list} mobileItem={mobileSkill} endpoint={'/v1/'+kind} title={text[kind]} listHeading={text[kind]} headerActions={listActions} initialSortBy="name" minTableWidth={620} canDetail onDetail={(item,trigger)=>void open(item as WorkforceMaster,trigger)} columns={[
  {key:'name',label:text.name,width:30,value:(item:WorkforceMaster)=>item.name},
  ...(kind==='skills'?[{key:'category',label:text.category,width:25,value:(item:WorkforceMaster)=>item.category}]:[]),
  ...(kind==='clients'?[{key:'companyName',label:text.companyName,width:30,value:(item:WorkforceMaster)=>item.companyName},{key:'contactName',label:text.contactName,width:20,value:(item:WorkforceMaster)=>item.contactName},{key:'contactEmail',label:text.contactEmail,width:20,value:(item:WorkforceMaster)=>item.contactEmail}]:kind==='projects'?[{key:'clientName',label:text.clientId,width:30,sortable:false,value:(item:WorkforceMaster)=>item.client?.name},{key:'contractStartsOn',label:text.contractStartsOn,width:20,value:(item:WorkforceMaster)=>formatDate(item.contractStartsOn,$localization)},{key:'contractEndsOn',label:text.contractEndsOn,width:20,value:(item:WorkforceMaster)=>formatDate(item.contractEndsOn,$localization)}]:[{key:'description',label:text.description,width:45,value:(item:WorkforceMaster)=>item.description}])
 ]}/>
</ViewportListPage></AssetManagementShell>
{#if selected}<div hidden={formOpen||deleting} inert={formOpen||deleting}>
 <DetailModal title={text[kind]} titleId="workforce-master-detail-title" compact closeLabel={common.cancel} {returnFocus} onClose={close}>
  {#snippet headerActions()}<DetailActionButtons editing={false} editLabel={common.edit} deleteLabel={common.delete} onEdit={allowed('update')||allowed('delete')?trigger=>{formFocus=trigger;editing=selected;formOpen=true;}:undefined} onDelete={allowed('delete')?trigger=>{deleteFocus=trigger;deleting=true;}:undefined}/>{/snippet}
  {#if detailError}<StatusNotice message={detailError} tone="error" onDismiss={()=>detailError=''}/>{/if}
{#if kind==='clients'}
 {#snippet clientInformation()}{#if selected}<section class="app-detail-section"><h3>{text.information}</h3><dl class="app-detail-grid">
  <div><dt>{text.name}</dt><dd>{selected.name}</dd></div><div><dt>{text.companyName}</dt><dd>{selected.companyName??'-'}</dd></div>
  <div class="app-detail-wide"><dt>{text.notes}</dt><dd class="app-detail-notes">{selected.notes??'-'}</dd></div>
  <div><dt>{common.created}</dt><dd>{formatTimestamp(selected.createdAt,$localization)}</dd></div><div><dt>{common.updated}</dt><dd>{formatTimestamp(selected.updatedAt,$localization)}</dd></div>
 </dl></section>{/if}{/snippet}
 {#snippet clientContact()}{#if selected}<section class="app-detail-section"><h3>{common.detailContactInformation}</h3><dl class="app-detail-grid">
  {#each clientTextFields.filter(field=>field!=='companyName') as field}<div><dt>{field==='prefecture'?address.region:field==='postalCode'?address.postal:text[field]}</dt><dd>{selected[field]??'-'}</dd></div>{/each}
  <div><dt>{text.countryCode}</dt><dd>{selected.countryCode==='JP'?($localization.displayLanguage==='ja'?'日本':'Japan'):($localization.displayLanguage==='ja'?'米国':'United States')}</dd></div>
 </dl></section>{/if}{/snippet}
 {#snippet clientHistory()}{#if selected}{#key selected.updatedAt}<MasterHistorySection collapsible={false} endpoint="/v1/clients" itemId={selected.id} hiddenFields={removedClientFields} fieldLabels={historyLabels} dateFields={['openedOn','closedOn']}/>{/key}{/if}{/snippet}
 <DetailTabs label={text.clients} kind="client" tabs={[{id:'basic',label:text.information,content:clientInformation},{id:'contact',label:common.detailContactInformation,content:clientContact},{id:'history',label:common.history,content:clientHistory}]} />
{:else}
 {#snippet masterInformation()}{#if selected}  <section class="app-detail-section"><h3>{text.information}</h3><dl class="app-detail-grid">
   <div><dt>{text.name}</dt><dd>{selected.name}</dd></div>
   {#if kind==='skills'}<div><dt>{text.category}</dt><dd>{selected.category}</dd></div>{/if}
   <div class="app-detail-wide"><dt>{text.description}</dt><dd class="app-detail-notes">{selected.description}</dd></div>
   {#if kind==='projects'}<div><dt>{text.clientId}</dt><dd>{selected.client?.name??'-'}</dd></div><div><dt>{text.companyName}</dt><dd>{selected.client?.companyName??'-'}</dd></div>
    {#each ['contractStartsOn','contractEndsOn'] as field}<div><dt>{text[field as 'contractStartsOn'|'contractEndsOn']}</dt><dd>{formatDate(selected[field as 'contractStartsOn'|'contractEndsOn'],$localization)||'-'}</dd></div>{/each}
   {/if}

   <div><dt>{common.created}</dt><dd>{formatTimestamp(selected.createdAt,$localization)}</dd></div><div><dt>{common.updated}</dt><dd>{formatTimestamp(selected.updatedAt,$localization)}</dd></div>
  </dl></section>
{/if}{/snippet}
 {#snippet masterHistory()} {#if selected && kind!=='skills'}{#key selected.updatedAt}<MasterHistorySection collapsible={false} endpoint={'/v1/'+kind} itemId={selected.id}  fieldLabels={historyLabels} dateFields={['openedOn','closedOn','contractStartsOn','contractEndsOn']}/>{/key}{/if}{/snippet}
 {#if kind==='projects'}<DetailTabs label={text.projects} tabs={[{id:'basic',label:text.information,content:masterInformation},{id:'history',label:common.history,content:masterHistory}]} />{:else}{@render masterInformation()}{/if}
{/if}
 </DetailModal></div>{/if}
{#if formOpen}<div hidden={deleting} inert={deleting}><WorkforceMasterForm deleteError={detailError} onDelete={allowed('delete')?trigger=>{deleteFocus=trigger;deleting=true;}:undefined} {kind} item={editing} returnFocus={formFocus} onClose={()=>formOpen=false} onSaved={saved}/></div>{/if}
{#if deleting}<DetailModal title={text.deleteTitle} titleId="workforce-master-delete-title" closeLabel={common.cancel} returnFocus={deleteFocus} onClose={()=>{if(!busy)deleting=false;}}><p>{text.deleteHelp}</p>{#snippet actions()}<button class="secondary" disabled={busy} onclick={()=>deleting=false}>{common.cancel}</button><button class="app-danger-action" disabled={busy} onclick={()=>void remove()}>{common.delete}</button>{/snippet}</DetailModal>{/if}

<style>
 .mobile-skill{display:flex;min-width:0;flex-direction:column;gap:3px;overflow-wrap:anywhere}
 .mobile-skill strong{font-weight:600;color:var(--text)}
 .mobile-skill-category{color:var(--muted);font-size:var(--font-size-support)}
 .mobile-skill-description{display:-webkit-box;margin:0;overflow:hidden;-webkit-box-orient:vertical;-webkit-line-clamp:2;line-clamp:2;color:var(--text-secondary);font-size:var(--font-size-support);white-space:pre-line}
</style>
