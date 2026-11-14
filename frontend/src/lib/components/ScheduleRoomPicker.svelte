<script lang="ts">
 import { onMount } from 'svelte';
 import { localization } from '#lib/localization.js';
 import { scheduleText } from '#lib/schedule-text.js';
 import { allSchedulePages,type RoomChoice } from '#lib/schedule.js';
 import SearchSelect from './SearchSelect.svelte';
 let {value=null,disabled=false,onSelect}:{value?:number|null;disabled?:boolean;onSelect:(room:RoomChoice|null)=>void}=$props();
 let text=$derived(scheduleText[$localization.displayLanguage]);
 let rooms=$state<RoomChoice[]>([]),branchId=$state(''),loading=$state(true),failed=$state(false);
 let controller:AbortController|undefined,disposed=false;
 let branches=$derived.by(()=>{const values=new Map(rooms.map(room=>[room.room.branch.id,room.room.branch]));return [...values.values()].sort((a,b)=>a.name.localeCompare(b.name,$localization.displayLanguage));});
 let choices=$derived(rooms.filter(room=>String(room.room.branch.id)===branchId).sort((a,b)=>a.room.name.localeCompare(b.room.name,$localization.displayLanguage)));
 async function load(){controller?.abort();controller=new AbortController();loading=true;failed=false;try{const result=await allSchedulePages<RoomChoice>('/v1/schedule-resources',controller.signal);if(disposed)return;rooms=result;const selected=rooms.find(room=>room.id===value);if(selected)branchId=String(selected.room.branch.id);}catch(error){if(!disposed&&!(error instanceof DOMException&&error.name==='AbortError'))failed=true;}finally{if(!disposed)loading=false;}}
 onMount(()=>{void load();return()=>{disposed=true;controller?.abort();};});
</script>
<div class="room-picker">
 <SearchSelect label={text.branch} field="schedule-booking-branch" value={branchId} options={[{value:'',label:'-'},...branches.map(branch=>({value:String(branch.id),label:branch.name}))]} disabled={disabled||loading||failed} onSelect={selected=>{if(branchId===selected)return;branchId=selected;onSelect(null);}}/>
 <SearchSelect label={text.room} field="schedule-booking-room" value={value===null?'':String(value)} options={[{value:'',label:text.none},...choices.map(room=>({value:String(room.id),label:room.room.name}))]} disabled={disabled||loading||failed||!branchId} onSelect={selected=>onSelect(rooms.find(room=>String(room.id)===selected)??null)}/>
 {#if loading}<p role="status">{text.loading}</p>{:else if failed}<p role="alert">{text.failed} <button type="button" onclick={load}>{text.retry}</button></p>{:else if !rooms.length}<p>{text.noBookableRooms}</p>{/if}
</div>
<style>.room-picker{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:var(--sph-space-12px)}.room-picker p{grid-column:1/-1;margin:0;color:var(--muted)}@media(max-width:700px){.room-picker{grid-template-columns:minmax(0,1fr)}}</style>
