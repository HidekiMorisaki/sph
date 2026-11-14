<script lang="ts">
 import ModalActionButton from '#lib/components/ModalActionButton.svelte';
 import {onMount,untrack} from 'svelte';
 import {apiData} from '#lib/api.js';
 import {employeeSaveError} from '#lib/employee-messages.js';
 import {localeMessages} from '#lib/locale-messages.js';
 import {localization} from '#lib/localization.js';
 import type {Employee} from '#lib/employees.js';
 import DetailModal from './DetailModal.svelte';
 import DatePicker from './DatePicker.svelte';
 import LoadingSpinner from './LoadingSpinner.svelte';
 import StatusNotice from './StatusNotice.svelte';
 export type ReturnConfirmation={confirmed:true;assignmentIds:number[];loanIds:number[];returnedOn:string};
 type Assets={assignments:{id:number;assetId:number;asset:{assetTag:string}}[];loans:{id:number;copy:{copyCode:string;title:{name:string}}}[]};
 let {employee,mode,retirementOn='',onClose,onComplete,onRetireConfirm,errorMessage=''}:{employee:Employee;mode:'retire'|'delete';retirementOn?:string;onClose:()=>void;onComplete?:()=>Promise<void>;onRetireConfirm?:(confirmation:ReturnConfirmation)=>Promise<boolean|void>;errorMessage?:string}=$props();
 const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo'}).format(new Date());
 let text=$derived(localeMessages[$localization.displayLanguage].employees.departure),common=$derived(localeMessages[$localization.displayLanguage].common);
 let assets=$state<Assets>({assignments:[],loans:[]}),loading=$state(true),ready=$state(false),busy=$state(false),error=$state(''),checked=$state(false),openDate=$state('');
 let departureOn=$state(untrack(()=>mode==='retire'?retirementOn:employee.deletionScheduledOn?.slice(0,10)??today()));
 let returnedOn=$state(today());
 let hasAssets=$derived(assets.assignments.length+assets.loans.length>0);
 const endpoint=()=>`/v1/employees/${employee.id}/deletion-reservation`;
 onMount(()=>{void(async()=>{try{const response=await fetch(`/v1/employees/${employee.id}/departure`);if(!response.ok){const p=await response.json();error=employeeSaveError(p.error?.code,response.status,$localization.displayLanguage);return;}assets=await apiData<Assets>(response);ready=true;}catch{error=localeMessages[$localization.displayLanguage].employees.saveFailed;}finally{loading=false;}})();});
 async function submit(){
  if(busy||loading||!ready||!checked||error)return;busy=true;
  try{
   const confirmation:ReturnConfirmation={confirmed:true,assignmentIds:assets.assignments.map(a=>a.id),loanIds:assets.loans.map(l=>l.id),returnedOn:hasAssets?returnedOn:(departureOn<today()?departureOn:today())};
   if(mode==='retire'){await onRetireConfirm?.(confirmation);return;}
   const response=await fetch(endpoint(),{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({deletionOn:departureOn,confirmation})});
   if(!response.ok){const p=await response.json();error=employeeSaveError(p.error?.code,response.status,$localization.displayLanguage);return;}
   await onComplete?.();onClose();
  }catch{error=localeMessages[$localization.displayLanguage].employees.saveFailed;}finally{busy=false;}
 }
 async function cancelReservation(){if(busy)return;busy=true;try{const response=await fetch(endpoint(),{method:'DELETE'});if(!response.ok){const p=await response.json();error=employeeSaveError(p.error?.code,response.status,$localization.displayLanguage);return;}await onComplete?.();onClose();}catch{error=localeMessages[$localization.displayLanguage].employees.saveFailed;}finally{busy=false;}}
</script>
<DetailModal title={mode==='retire'?text.retire:text.delete} titleId="employee-departure-title" dialogClass="employee-departure-modal" closeLabel={common.cancel} onClose={()=>{if(!busy)onClose();}}>
 {#if loading}<LoadingSpinner label={common.loading}/>{:else}
 {#if error||errorMessage}<StatusNotice message={error||errorMessage} tone="error" onDismiss={()=>{error='';}}/>{/if}
 <p>{text.notice}</p><p>{text.immediate}</p>
 <section class="app-detail-section"><h3>{text.assets} ({assets.assignments.length})</h3><ul>{#each assets.assignments as item}<li>{item.asset.assetTag}</li>{/each}</ul><h3>{text.books} ({assets.loans.length})</h3><ul>{#each assets.loans as item}<li>{item.copy.title.name} · {item.copy.copyCode}</li>{/each}</ul>{#if !hasAssets}<p>{text.empty}</p>{/if}</section>
 <form id="employee-departure-form" onsubmit={e=>{e.preventDefault();void submit();}}>
 {#if hasAssets}<DatePicker label={text.returnedOn} field="departure-return-on" value={returnedOn} max={today()} required disabled={busy} open={openDate==='return'} onToggle={()=>openDate=openDate==='return'?'':'return'} onSelect={value=>{returnedOn=value;openDate='';}}/>{/if}
 {#if mode==='delete'}<DatePicker label={text.deletionOn} field="departure-deletion-on" value={departureOn} min={employee.hiredAt.slice(0,10)} required disabled={busy} open={openDate==='departure'} onToggle={()=>openDate=openDate==='departure'?'':'departure'} onSelect={value=>{departureOn=value;openDate='';}}/><p>{text.scheduledHelp}</p>{:else}<p>{localeMessages[$localization.displayLanguage].employees.retiredAt}: {retirementOn}</p>{/if}
 <label class="confirm-returns"><input name="confirmReturns" type="checkbox" bind:checked disabled={busy||Boolean(error)}/><span>{hasAssets?text.confirm:text.confirmEmpty}</span></label>
 </form>
 {#if mode==='delete'&&employee.deletionScheduledOn}<p>{text.scheduled}: {employee.deletionScheduledOn.slice(0,10)}</p><p>{text.cancelHelp}</p>{/if}
 {/if}
 {#snippet actions()}{#if mode==='delete'&&employee.deletionScheduledOn}<ModalActionButton multiline type="button" class="app-danger-action" disabled={busy||loading} onclick={()=>void cancelReservation()} variant="danger" data-button-scope="button-ed42a7cf0c">{text.cancelReservation}</ModalActionButton>{/if}<ModalActionButton multiline class="secondary" type="button" disabled={busy} onclick={onClose} variant="secondary" data-button-scope="button-ed42a7cf0c">{common.cancel}</ModalActionButton><ModalActionButton multiline type="submit" form="employee-departure-form" class="app-primary-action" disabled={loading||!ready||busy||!checked||Boolean(error)} variant="primary" data-button-scope="button-ed42a7cf0c">{busy?common.saving:text.save}</ModalActionButton>{/snippet}
</DetailModal>
<style>form{display:grid;gap:var(--sph-space-16px)}.confirm-returns{display:flex;align-items:flex-start;gap:var(--sph-space-10px)}.confirm-returns input{flex:none;width:18px;height:18px;margin-top:var(--sph-space-3px)}ul{padding-left:var(--sph-space-24px);overflow-wrap:anywhere}p{margin:0;line-height:var(--sph-leading-1-7)}:global(.employee-departure-modal>.app-modal-footer){flex-wrap:wrap}:global(.employee-departure-modal>.app-modal-footer button){max-width:100%;height:auto;min-height:32px;white-space:normal;overflow-wrap:anywhere}</style>
