<script lang="ts">
 import { onMount } from 'svelte';
 import { canOperate,type SessionUser } from '$lib/auth';
 import { localization } from '$lib/localization';
 import { scheduleText } from '$lib/schedule-text';
 import { allSchedulePages,scheduleRequest,ScheduleRequestError } from '$lib/schedule';
 import DetailModal from './DetailModal.svelte';
 import ModalActionButton from './ModalActionButton.svelte';
 import SearchSelect from './SearchSelect.svelte';
 import FormCheckbox from './FormCheckbox.svelte';
 import FormTextarea from './FormTextarea.svelte';
 import FormSection from './FormSection.svelte';
 import DiscardChangesDialog from './DiscardChangesDialog.svelte';
 let {user,onClose,returnFocus=null}:{user:SessionUser;onClose:()=>void;returnFocus?:HTMLElement|null}=$props();
 let text=$derived(scheduleText[$localization.displayLanguage]);
 let rooms=$state<{id:number;name:string;branch?:{name:string}}[]>([]),roomId=$state(0),timeZone=$state(''),isBookable=$state(false),revision=$state(0),busy=$state(false),error=$state(''),reservations=$state<{id:number;startsAt:string;endsAt:string}[]>([]),release=$state(0),reason=$state('');
 let loadedRoomId=$state(0);
 let original=$state(''),discard=$state(false),nextRoomId=$state<number|null>(null);
 let dirty=$derived(!!loadedRoomId&&JSON.stringify([isBookable,timeZone])!==original);
 function close(){if(busy)return;nextRoomId=null;if(dirty)discard=true;else onClose();}
 function selectRoom(id:number){if(busy)return;if(dirty){nextRoomId=id;discard=true;}else{roomId=id;void load();}}
 function discardChanges(){discard=false;if(nextRoomId===null)onClose();else{roomId=nextRoomId;nextRoomId=null;void load();}}
 let zoneOptions=$derived([...new Set([...Intl.supportedValuesOf('timeZone'),'UTC',...(timeZone?[timeZone]:[])])].sort().map(value=>({value,label:value})));
 onMount(()=>{void(async()=>{try{rooms=await allSchedulePages('/v1/rooms');}catch{error=text.failed;}})();});
 async function load(){loadedRoomId=0;reservations=[];timeZone='';if(!roomId)return;busy=true;error='';try{const r=await scheduleRequest<{timeZone:string;isBookable:boolean;revision:number}>(`/v1/rooms/${roomId}/booking-settings`);timeZone=r.data.timeZone;isBookable=r.data.isBookable;revision=r.data.revision;reservations=await allSchedulePages(`/v1/rooms/${roomId}/reservations`);original=JSON.stringify([isBookable,timeZone]);loadedRoomId=roomId;}catch{error=text.failed;}finally{busy=false;}}
 async function save(){if(!loadedRoomId||loadedRoomId!==roomId)return;busy=true;error='';try{const result=await scheduleRequest<{revision:number}>(`/v1/rooms/${roomId}/booking-settings`,'PUT',{timeZone,isBookable,expectedRevision:revision});revision=result.data.revision;original=JSON.stringify([isBookable,timeZone]);}catch(e){error=e instanceof ScheduleRequestError&&e.code==='FUTURE_RESERVATIONS'?text.roomConflict:text.failed;}finally{busy=false;}}
 async function releaseReservation(){busy=true;error='';try{await scheduleRequest(`/v1/resource-reservations/${release}/release`,'PUT',{reason});release=0;reason='';await load();}catch{error=text.failed;}finally{busy=false;}}
 const stamp=(v:string)=>new Intl.DateTimeFormat($localization.displayLanguage,{dateStyle:'short',timeStyle:'short',timeZone:$localization.timeZone}).format(new Date(v));
</script>
<DetailModal title={text.bookingSettings} titleId="room-booking-settings" closeLabel={text.close} {returnFocus} onClose={close}>
 {#if error}<p class="error" role="alert">{error}</p>{/if}
 <div class="settings"><FormSection title={text.bookingSettings} framed columns={2}><SearchSelect label={text.room} field="booking-room" value={String(roomId||'')} options={[{value:'',label:'-'},...rooms.filter(r=>canOperate(user,'rooms.update',user.branchId)).map(r=>({value:String(r.id),label:r.name+(r.branch?` · ${r.branch.name}`:'')}))]} disabled={busy} onSelect={value=>selectRoom(Number(value))}/>{#if roomId&&loadedRoomId===roomId}<SearchSelect label={text.timeZone} field="booking-zone" value={timeZone} options={zoneOptions} required disabled={busy} onSelect={value=>timeZone=value}/><FormCheckbox label={text.bookable} field="booking-bookable" checked={isBookable} disabled={busy} onChange={value=>isBookable=value}/>{/if}</FormSection>{#if loadedRoomId}<section class="app-detail-section"><h3>{text.room}</h3>{#each reservations as r}<div class="reservation"><span>{stamp(r.startsAt)} – {stamp(r.endsAt)} · {text.busy}</span>{#if user.capabilities.canManageSystemSettings}<ModalActionButton label={text.release} variant="danger" disabled={busy} onclick={()=>{release=r.id;reason='';}}/>{/if}</div>{:else}<p>{text.empty}</p>{/each}</section>{/if}</div>
 {#snippet actions()}<ModalActionButton label={text.cancel} variant="secondary" disabled={busy} onclick={close}/><ModalActionButton label={text.save} disabled={busy||!roomId||loadedRoomId!==roomId||!timeZone} onclick={save}/>{/snippet}
</DetailModal>
{#if release}<DetailModal title={text.release} titleId="room-release" closeLabel={text.close} compact onClose={()=>{if(!busy)release=0;}}><p>{text.releaseConfirm}</p><FormTextarea label={text.releaseReason} field="booking-release-reason" value={reason} required disabled={busy} placeholder={$localization.displayLanguage==='ja'?'例：会議室の設備点検のため':'Example: Meeting room maintenance'} maxlength={1000} rows={3} onValueChange={value=>reason=value}/>{#if error}<p class="error" role="alert">{error}</p>{/if}{#snippet actions()}<ModalActionButton label={text.cancel} variant="secondary" disabled={busy} onclick={()=>release=0}/><ModalActionButton label={text.release} variant="danger" disabled={busy||!reason.trim()} onclick={releaseReservation}/>{/snippet}</DetailModal>{/if}
{#if discard}<DiscardChangesDialog onContinue={()=>{discard=false;nextRoomId=null;}} onDiscard={discardChanges}/>{/if}
<style>.settings{display:grid;gap:var(--sph-space-16px)}.reservation{display:flex;align-items:center;justify-content:space-between;gap:var(--sph-space-12px);padding:var(--sph-space-12px) 0;border-bottom:1px solid var(--border)}.reservation span{font-size:var(--font-size-support)}.error{color:var(--danger)}</style>
