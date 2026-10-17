<script lang="ts">
 import {localeMessages} from '$lib/locale-messages';
 import {localization,formatDate} from '$lib/localization';
 import {apiData} from '$lib/api';
 import type {ChangeHistoryEntry} from '$lib/change-history';
 import type {WorkforceRecord,RecordContext,RecordKind} from '$lib/workforce';
 import ChangeHistorySection from './ChangeHistorySection.svelte';
 import AddButton from './AddButton.svelte';
 import DetailActionButtons from './DetailActionButtons.svelte';
 let {employeeId,onEdit}:{employeeId:number;onEdit:(context:RecordContext)=>void}=$props();
 let text=$derived(localeMessages[$localization.displayLanguage].workforce),common=$derived(localeMessages[$localization.displayLanguage].common);
 let skills=$state<WorkforceRecord[]>([]),participations=$state<WorkforceRecord[]>([]),history=$state<ChangeHistoryEntry[]>([]);
 let editable=$state<Record<RecordKind,Record<string,boolean>>>({skills:{},participations:{}});
 let loading=$state(false),error=$state(false),requestId=0;
 const level=(value:number|undefined)=>value===1?text.level1:value===2?text.level2:text.level3;
 export async function refresh(){
  const current=++requestId,id=employeeId;loading=true;error=false;
  async function records(kind:RecordKind){
   const all:WorkforceRecord[]=[];let operations:Record<string,boolean>={};
   for(let offset=0;;offset+=500){const response=await fetch('/v1/employees/'+id+'/'+kind+'?limit=500&offset='+offset);if(!response.ok)throw new Error();const payload=await response.json();all.push(...payload.data);operations=payload.meta.editable;if(payload.data.length<500)break;}return{all,operations};
  }
  async function histories(){const all:ChangeHistoryEntry[]=[];for(let offset=0;;offset+=500){const response=await fetch('/v1/employees/'+id+'/workforce-history?limit=500&sortOrder=desc&offset='+offset);if(!response.ok)throw new Error();const items=await apiData<ChangeHistoryEntry[]>(response);all.push(...items);if(items.length<500)return all;}}
  try{const [s,p,h]=await Promise.all([records('skills'),records('participations'),histories()]);if(current!==requestId)return;skills=s.all;participations=p.all;history=h;editable={skills:s.operations,participations:p.operations};}catch{if(current===requestId)error=true;}finally{if(current===requestId)loading=false;}
 }
 $effect(()=>{employeeId;void refresh();return()=>{requestId++;};});
 let fields=$derived({skill:text.skill,project:text.project,proficiency:text.proficiency,experienceYears:text.experienceYears,notes:text.notes,startsOn:text.startsOn,endsOn:text.endsOn,responsibility:text.responsibility});
 const formatters={proficiency:(value:string)=>level(Number(value))};
</script>
{#each ['skills','participations'] as rawKind}{@const kind=rawKind as RecordKind}{@const items=kind==='skills'?skills:participations}
 <section class="app-detail-section workforce-section" data-workforce-kind={kind}>
  <div class="section-heading"><h3>{text[kind]}</h3>{#if editable[kind].create}<AddButton iconOnly label={text.add+' · '+text[kind]} onclick={event=>onEdit({kind,record:null,trigger:event.currentTarget as HTMLElement})}/>{/if}</div>
  {#if loading}<p>{common.loading}</p>{:else if error}<p role="alert">{text.loadFailed}</p>{:else if !items.length}<p>{text.noRecords}</p>{:else}
  <div class="record-list">{#each items as item}<article>
   <div class="record-heading"><strong>{item.skill?.name??item.project?.name}</strong><DetailActionButtons editLabel={text.edit} deleteLabel={common.delete} onEdit={editable[kind].update?trigger=>onEdit({kind,record:item,trigger}):undefined} onDelete={editable[kind].delete?trigger=>onEdit({kind,record:item,deleting:true,trigger}):undefined}/></div>
   <dl class="app-detail-grid">{#if kind==='skills'}<div><dt>{text.proficiency}</dt><dd>{level(item.proficiency)}</dd></div><div><dt>{text.experienceYears}</dt><dd>{item.experienceYears??'-'}</dd></div><div class="app-detail-wide"><dt>{text.notes}</dt><dd class="app-detail-notes">{item.notes}</dd></div>
   {:else}<div><dt>{text.participationStatus}</dt><dd>{item.participationStatus?text[item.participationStatus]:''}</dd></div><div><dt>{text.startsOn}</dt><dd>{formatDate(item.startsOn,$localization)}</dd></div><div><dt>{text.endsOn}</dt><dd>{item.endsOn?formatDate(item.endsOn,$localization):text.unknownEnd}</dd></div><div class="app-detail-wide"><dt>{text.responsibility}</dt><dd class="app-detail-notes">{item.responsibility}</dd></div>{/if}</dl>
  </article>{/each}</div>{/if}
 </section>
{/each}
<ChangeHistorySection collapsible entries={history} {loading} {error} title={text.history} fieldLabels={fields} dateFields={['startsOn','endsOn']} valueFormatters={formatters} actionLabels={{create:common.created,update:common.updated,delete:common.deleted}}/>
<style>.section-heading,.record-heading{display:flex;align-items:center;justify-content:space-between;gap:12px}.section-heading h3{margin:0}.section-heading{margin-bottom:12px}.record-list{display:grid;gap:12px}.record-list article{padding:12px;border:1px solid var(--border);border-radius:4px}.record-heading{margin-bottom:8px}.workforce-section p{color:var(--muted);font-size:var(--font-size-body)}strong{font-size:var(--font-size-body);overflow-wrap:anywhere}</style>
