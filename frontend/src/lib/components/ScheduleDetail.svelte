<script lang="ts">
 import { canOperate,type SessionUser } from '$lib/auth';
 import { localization } from '$lib/localization';
 import { scheduleText } from '$lib/schedule-text';
 import { scheduleRequest,ScheduleRequestError,type ScheduleItem } from '$lib/schedule';
 import DetailModal from './DetailModal.svelte';
 import SearchSelect from './SearchSelect.svelte';
 import FormCheckbox from './FormCheckbox.svelte';
 import ModalActionButton from './ModalActionButton.svelte';
 let {item,user,onEdit,onCopy,onChanged,onClose,returnFocus=null}:{item:ScheduleItem;user:SessionUser;onEdit:()=>void;onCopy:()=>void;onChanged:()=>void|Promise<void>;onClose:()=>void;returnFocus?:HTMLElement|null}=$props();
 let text=$derived(scheduleText[$localization.displayLanguage]);
 let busy=$state(false),error=$state(''),cancelOpen=$state(false),scope=$state<'single'|'following'|'all'>('single'),preserve=$state(true);
 const stamp=(value:string,allDay:boolean)=>allDay?value:new Intl.DateTimeFormat($localization.displayLanguage,{dateStyle:'medium',timeStyle:'short',timeZone:$localization.timeZone}).format(new Date(value));
 async function respond(response:string){busy=true;error='';try{await scheduleRequest(`/v1/schedule-occurrences/${item.key}/response`,'PUT',{response,expectedRevision:item.revision});await onChanged();}catch{error=text.conflict;}finally{busy=false;}}
 async function cancel(){busy=true;error='';try{await scheduleRequest(`/v1/schedule-occurrences/${item.key}`,'DELETE',{scope:item.recurring?scope:'single',expectedRevision:item.revision,preserveExceptions:preserve});cancelOpen=false;await onChanged();}catch(e){error=e instanceof ScheduleRequestError&&e.code==='STALE_REVISION'?text.conflict:text.failed;}finally{busy=false;}}
</script>
<DetailModal title={item.title??text.busy} titleId="schedule-detail-title" closeLabel={text.close} {returnFocus} onClose={onClose}>
 {#if error}<p role="alert" class="error">{error}</p>{/if}
 {#if item.canceled}<p class="error">{text.canceled}</p>{/if}
 <section class="app-detail-section" aria-labelledby="schedule-basic-heading">
  <h3 id="schedule-basic-heading">{text.basicInformation}</h3>
  <dl class="app-detail-grid schedule-detail-grid">
   <div><dt>{text.start}</dt><dd>{stamp(item.start,item.allDay)}</dd></div>
   <div><dt>{text.end}</dt><dd>{stamp(item.end,item.allDay)}</dd></div>
   {#if item.detailAvailable}
    <div><dt>{text.timeZone}</dt><dd>{item.timeZone}</dd></div>
    <div><dt>{text.visibility}</dt><dd>{item.visibility==='private'?text.private:text.public}</dd></div>
   {/if}
  </dl>
 </section>
 {#if item.detailAvailable}
  {#if item.location||item.resources?.length}
   <section class="app-detail-section" aria-labelledby="schedule-place-heading">
    <h3 id="schedule-place-heading">{text.placeAndRoom}</h3>
    <dl class="app-detail-grid schedule-detail-grid">
     {#if item.location}<div><dt>{text.location}</dt><dd>{item.location}</dd></div>{/if}
     {#if item.resources?.length}<div><dt>{text.room}</dt><dd>{item.resources.map(r=>r.name).join(', ')}</dd></div>{/if}
    </dl>
   </section>
  {/if}
  {#if item.description}
   <section class="app-detail-section" aria-labelledby="schedule-description-heading">
    <h3 id="schedule-description-heading">{text.description}</h3>
    <p class="app-detail-notes description">{item.description}</p>
   </section>
  {/if}
  {#if item.participants?.length}
   <section class="app-detail-section" aria-labelledby="schedule-attendees-heading">
    <h3 id="schedule-attendees-heading">{text.attendees}</h3>
    <ul class="participants">{#each item.participants as p}<li><span class="participant-name">{p.name}</span><span class="participant-response">{text[p.response as 'pending']??p.response}</span></li>{/each}</ul>
    {#if !item.canceled&&item.participants.some(p=>p.employeeId===user.id)&&canOperate(user,'schedule.respond')}
     <div class="response-field"><SearchSelect label={text.respond} field="schedule-response" value={item.participants.find(p=>p.employeeId===user.id)?.response??'pending'} options={[(item.participants.find(p=>p.employeeId===user.id)?.response==='pending'?'pending':null),'accepted','tentative','declined'].filter((value):value is string=>value!==null).map(value=>({value,label:text[value as 'pending']}))} disabled={busy} onSelect={value=>{if(value!=='pending')void respond(value);}}/></div>
    {/if}
   </section>
  {/if}
 {:else}<p>{text.busy}</p>{/if}
 {#snippet actions()}{#if item.detailAvailable&&canOperate(user,'schedule.create')}<ModalActionButton label={text.copy} variant="secondary" disabled={busy} onclick={onCopy}/>{/if}{#if item.canEdit&&!item.canceled}{#if canOperate(user,'schedule.cancel')}<ModalActionButton label={text.cancelEvent} variant="danger" disabled={busy} onclick={()=>cancelOpen=true}/>{/if}{#if canOperate(user,'schedule.update')}<ModalActionButton label={item.recurring?text.editDay:text.edit} disabled={busy} onclick={onEdit}/>{/if}{/if}{/snippet}
</DetailModal>
{#if cancelOpen}<DetailModal title={text.cancelEvent} titleId="schedule-cancel-title" closeLabel={text.close} compact onClose={()=>{if(!busy)cancelOpen=false;}}><p>{item.recurring?text.confirmScope:text.cancelSingleQuestion}</p>{#if item.recurring}<SearchSelect label={text.scope} field="schedule-cancel-scope" value={scope} options={["single","following","all"].map(value=>({value,label:text[value as "single"]}))} disabled={busy} onSelect={value=>scope=value as typeof scope}/>{#if scope!=='single'}<FormCheckbox label={text.preserve} field="schedule-cancel-preserve" checked={preserve} disabled={busy} onChange={value=>preserve=value}/>{/if}{/if}{#if error}<p role="alert" class="error">{error}</p>{/if}{#snippet actions()}<ModalActionButton label={text.close} variant="secondary" disabled={busy} onclick={()=>cancelOpen=false}/><ModalActionButton label={text.cancelEvent} variant="danger" disabled={busy} onclick={cancel}/>{/snippet}</DetailModal>{/if}
<style>
 .schedule-detail-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
 .description{margin:0;overflow-wrap:anywhere;color:var(--text-secondary);font-size:var(--font-size-body);line-height:var(--sph-leading-1-6)}
 .participants{list-style:none;padding:0;margin:0}.participants li{display:flex;justify-content:space-between;align-items:baseline;gap:var(--sph-space-12px);padding:var(--sph-space-8px) 0;border-bottom:1px solid var(--border);color:var(--text-secondary)}.participants li:first-child{padding-top:0}.participants li:last-child{padding-bottom:0;border-bottom:0}.participant-name{min-width:0;overflow-wrap:anywhere}.participant-response{flex:none}.response-field{margin-top:var(--sph-space-16px);min-width:0}.error{color:var(--danger)}
 @media(max-width:700px),(min-width:701px) and (max-width:1024px) and (max-height:500px) and (any-pointer:coarse){.schedule-detail-grid{grid-template-columns:1fr}}
</style>
