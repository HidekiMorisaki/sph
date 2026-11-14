<script lang="ts">
 import { onMount,untrack } from 'svelte';
 import { scheduleRequest,ScheduleRequestError,type ScheduleItem } from '#lib/schedule.js';
 import { scheduleText } from '#lib/schedule-text.js';
 import { localization } from '#lib/localization.js';
 import DetailModal from './DetailModal.svelte';
 import ModalActionButton from './ModalActionButton.svelte';
 let {item,end,returnFocus,onClose,onSaved,onError}:{item:ScheduleItem;end:string;returnFocus:HTMLElement|null;onClose:()=>void;onSaved:()=>Promise<void>;onError:(message:string)=>void}=$props();
 let text=$derived(scheduleText[$localization.displayLanguage]);
 let phase=$state<'loading'|'scope'|'conflict'|'notification'|'saving'>('loading');
 let scope=$state<'single'|'all'>('single'),notifyRequired=$state(false),employeeConflict=$state(false);
 let revision=untrack(()=>item.revision);
 let disposed=false;
 function fail(error:unknown){
  if(disposed)return;
  const code=error instanceof ScheduleRequestError?error.code:'';
  onError(code==='STALE_REVISION'?text.conflict:code==='ROOM_CONFLICT'?text.roomConflict:code==='EMPLOYEE_CONFLICT_CONFIRMATION_REQUIRED'?text.employeeConflict:code==='NETWORK_ERROR'?text.failed:text.invalid);onClose();
 }
 async function preview(value:'single'|'all'){
  scope=value;phase='loading';
  try{
   const result=await scheduleRequest<{notifyRequired:boolean;employeeConflict:boolean}>(`/v1/schedule-occurrences/${item.key}`,'PATCH',{scope,expectedRevision:revision,resize:{end},preview:true});
   if(disposed)return;notifyRequired=result.data.notifyRequired;employeeConflict=result.data.employeeConflict;
   if(employeeConflict)phase='conflict';else await afterConflict();
  }catch(error){fail(error);}
 }
 async function afterConflict(){if(notifyRequired)phase='notification';else await save(false);}
 async function save(notifyParticipants:boolean){
  phase='saving';
  try{await scheduleRequest(`/v1/schedule-occurrences/${item.key}`,'PATCH',{scope,expectedRevision:revision,resize:{end},notifyParticipants,acceptEmployeeConflict:employeeConflict});if(!disposed)await onSaved();}catch(error){fail(error);}
 }
 onMount(()=>{
  void(async()=>{try{const result=await scheduleRequest<ScheduleItem>(`/v1/schedule-occurrences/${item.key}`);if(disposed)return;if(result.data.revision!==revision)throw new ScheduleRequestError('STALE_REVISION');if(!result.data.canEdit||result.data.canceled)throw new ScheduleRequestError('UNAVAILABLE');revision=result.data.revision;if(result.data.recurring)phase='scope';else await preview('single');}catch(error){fail(error);}})();
  return()=>{disposed=true;};
 });
</script>
{#if phase==='scope'||phase==='conflict'||phase==='notification'}
 <DetailModal title={text.resizeSchedule} titleId="schedule-resize-confirm" closeLabel={text.cancel} {returnFocus} compact onClose={onClose}>
  <p class="resize-question">{phase==='scope'?text.resizeScopeQuestion:phase==='notification'?text.notifyParticipantsQuestion:text.employeeConflict}</p>
  {#snippet actions()}
   <div class="resize-actions">
   <ModalActionButton label={text.cancel} variant="secondary" onclick={onClose}/>
   {#if phase==='scope'}<ModalActionButton label={text.single} onclick={()=>preview('single')}/><ModalActionButton label={text.all} onclick={()=>preview('all')}/>
   {:else if phase==='conflict'}<ModalActionButton label={text.continueResize} onclick={afterConflict}/>
   {:else}<ModalActionButton label={text.doNotNotify} variant="secondary" onclick={()=>save(false)}/><ModalActionButton label={text.notifyParticipants} onclick={()=>save(true)}/>{/if}
   </div>
  {/snippet}
 </DetailModal>
{:else}<span class="sr-only" role="status">{phase==='saving'?text.saving:text.loading}</span>{/if}
<style>.resize-question{margin:0;line-height:var(--sph-leading-1-7)}.resize-actions{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:var(--sph-space-8px);min-width:0;width:100%}.resize-actions :global(button){max-width:100%;white-space:normal}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}</style>
