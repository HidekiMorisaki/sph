<script lang="ts">
 import ModalActionButton from '#lib/components/ModalActionButton.svelte';
 import {onMount,untrack,tick} from 'svelte';
 import {apiData} from '#lib/api.js';
 import {localeMessages} from '#lib/locale-messages.js';
 import {localization} from '#lib/localization.js';
 import {workforceOptions,type WorkforceMaster,type WorkforceRecord,type RecordContext} from '#lib/workforce.js';
 import DetailModal from './DetailModal.svelte';
 import DiscardChangesDialog from './DiscardChangesDialog.svelte';
 import FormSection from './FormSection.svelte';
 import SearchSelect from './SearchSelect.svelte';
 import DatePicker from './DatePicker.svelte';
 import StatusNotice from './StatusNotice.svelte';
 let {employeeId,context,onClose,onSaved}:{employeeId:number;context:RecordContext;onClose:()=>void;onSaved:()=>Promise<void>}=$props();
 let text=$derived(localeMessages[$localization.displayLanguage].workforce),common=$derived(localeMessages[$localization.displayLanguage].common);
 const record=untrack(()=>context.record),kind=untrack(()=>context.kind),deleting=untrack(()=>Boolean(context.deleting));
 const returnFocus=untrack(()=>context.trigger);
 let reference=$state(untrack(()=>String(record?.skillId??record?.engagementId??'')));
 let proficiency=$state(untrack(()=>String(record?.proficiency??2)));
 let experience=$state<number|undefined>(untrack(()=>record?.experienceYears??undefined));
 let notes=$state(untrack(()=>record?.notes??record?.responsibility??''));
 let start=$state(untrack(()=>record?.startsOn?.slice(0,10)??'')),end=$state(untrack(()=>record?.endsOn?.slice(0,10)??''));
 let initial=$state(untrack(()=>JSON.stringify([reference,proficiency,experience??null,notes,start,end])));
 let dirty=$derived(JSON.stringify([reference,proficiency,experience??null,notes,start,end])!==initial);
 let options=$state<WorkforceMaster[]>([]),busy=$state(false),loading=$state(true),discard=$state(false),saved=$state(false),error=$state(''),openDate=$state('');
 $effect(()=>{if(dirty)saved=false;});
 onMount(()=>{void(async()=>{if(deleting){loading=false;return;}try{options=await workforceOptions(kind==='skills'?'skills':'engagements');if(record){const existing=record.skill??record.engagement;if(existing&&!options.some(item=>item.id===existing.id))options.push(existing);}}catch{error=text.loadFailed;}finally{loading=false;}})();});
 function closeNow(){onClose();void tick().then(()=>returnFocus?.focus({preventScroll:true}));}
 function close(){if(busy)return;if(dirty&&!deleting)discard=true;else closeNow();}
 async function save(event?:SubmitEvent){
  event?.preventDefault();error='';saved=false;
  if(!deleting&&(!reference||(kind==='participations'&&(!start||(end&&end<start)))||(kind==='skills'&&experience!==undefined&&(!Number.isFinite(experience)||experience<0||experience>80)))){error=text.invalid;return;}
  busy=true;
  try{
   const body=kind==='skills'?{skillId:Number(reference),proficiency:Number(proficiency),experienceYears:experience??null,notes}:{engagementId:Number(reference),startsOn:start,endsOn:end||null,responsibility:notes};
   const response=await fetch('/v1/employees/'+employeeId+'/'+kind+(record?'/'+record.id:''),{method:deleting?'DELETE':record?'PATCH':'POST',headers:{'content-type':'application/json'},...(deleting?{}:{body:JSON.stringify(body)})});
   if(!response.ok){const payload=await response.json().catch(()=>null);error=payload?.error?.code==='PERIOD_OVERLAP'?text.overlap:payload?.error?.code==='DUPLICATE_VALUE'?text.duplicate:response.status===422?text.invalid:text.failed;return;}
   if(!deleting){const result=await apiData<WorkforceRecord>(response);reference=String(result.skillId??result.engagementId);proficiency=String(result.proficiency??2);experience=result.experienceYears??undefined;notes=result.notes??result.responsibility??'';start=result.startsOn?.slice(0,10)??'';end=result.endsOn?.slice(0,10)??'';initial=JSON.stringify([reference,proficiency,experience??null,notes,start,end]);}
   await onSaved();
   if(deleting||!record)closeNow();else saved=true;
  }catch{error=text.failed;}finally{busy=false;}
 }
</script>
<DetailModal title={deleting?text.deleteTitle:(record?text.edit:text.add)+' · '+text[kind]} titleId="workforce-record-form-title" closeLabel={common.cancel} {returnFocus} onClose={close}>
 {#if deleting}<p>{text.deleteHelp}</p>{#if error}<StatusNotice message={error} tone="error" onDismiss={()=>error=''}/>{/if}
 {:else}
 <form id="workforce-record-form" class="app-modal-form app-modal-form--stacked" onsubmit={save}>
  {#if error}<StatusNotice message={error} tone="error" onDismiss={()=>error=''}/>{/if}
  {#if saved}<StatusNotice message={text.saved} tone="success" onDismiss={()=>saved=false}/>{/if}
  <FormSection title={text.information} framed columns={2}>
   <SearchSelect label={kind==='skills'?text.skill:text.engagement} field="workforceReference" value={reference} required disabled={busy||loading||Boolean(record)} options={options.map(item=>({value:String(item.id),label:item.name,searchTerms:[item.category??'']}))} onSelect={value=>reference=value}/>
   {#if kind==='skills'}
    <SearchSelect label={text.proficiency} field="workforceProficiency" value={proficiency} options={[{value:'1',label:text.level1},{value:'2',label:text.level2},{value:'3',label:text.level3}]} searchable={false} required disabled={busy} onSelect={value=>proficiency=value}/>
    <label><span>{text.experienceYears}</span><input name="experienceYears" type="number" min="0" max="80" step="0.1" bind:value={experience} placeholder={text.examples.experienceYears} disabled={busy}/><small>{text.experienceHelp}</small></label>
   {:else}
    <DatePicker label={text.startsOn} field="participationStartsOn" value={start} required disabled={busy} open={openDate==='start'} onToggle={()=>openDate=openDate==='start'?'':'start'} onSelect={value=>{start=value;openDate='';}}/>
    <DatePicker label={text.endsOn} field="participationEndsOn" value={end} disabled={busy} open={openDate==='end'} min={start} onToggle={()=>openDate=openDate==='end'?'':'end'} onSelect={value=>{end=value;openDate='';}}/>
    <p class="wide help">{text.periodHelp}</p>
   {/if}
   <label class="wide"><span>{kind==='skills'?text.notes:text.responsibility}</span><textarea name="workforceNotes" bind:value={notes} placeholder={kind==='skills'?text.examples.notes:text.examples.responsibility} maxlength="5000" disabled={busy}></textarea></label>
  </FormSection>
 </form>{/if}
 {#snippet actions()}<ModalActionButton type="button" class="secondary" disabled={busy} onclick={close} variant="secondary" data-button-scope="button-b89fbecfa4">{common.cancel}</ModalActionButton>{#if deleting}<ModalActionButton type="button" class="app-danger-action" disabled={busy} onclick={()=>void save()} variant="danger" data-button-scope="button-b89fbecfa4">{common.delete}</ModalActionButton>{:else}<ModalActionButton type="submit" form="workforce-record-form" class="app-primary-action" disabled={busy||loading||(Boolean(record)&&!dirty)} variant="primary" data-button-scope="button-b89fbecfa4">{busy?common.saving:record?common.saveChanges:text.add}</ModalActionButton>{/if}{/snippet}
</DetailModal>
{#if discard}<DiscardChangesDialog onContinue={()=>discard=false} onDiscard={closeNow}/>{/if}
<style>.wide{grid-column:1/-1}.help,small{font-size:var(--font-size-support);color:var(--muted)}.help{margin:0}</style>
