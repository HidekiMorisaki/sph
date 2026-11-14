<script lang="ts">
 import MasterList from '#lib/components/MasterList.svelte';
 import AddButton from '#lib/components/AddButton.svelte';
 import {localization} from '#lib/localization.js';
 import {personName,type Project,type Ticket} from '#lib/projects.js';
 let {project,parentId,canCreate,disabled=false,onadd,onopen}:{project:Project;parentId:number;canCreate:boolean;disabled?:boolean;onadd:(trigger:HTMLElement)=>void;onopen?:(ticket:Ticket,trigger:HTMLElement|null)=>void}=$props();
 let list=$state<MasterList>();
 let trigger=$state<HTMLButtonElement>();
 let ja=$derived($localization.displayLanguage==='ja');
 const assignee=(row:Ticket)=>{const member=project.members.find(member=>member.employeeId===row.assigneeId);return member?personName(member.employee):ja?'未割当':'Unassigned';};
 export async function refresh(){await list?.refresh();}
</script>
{#snippet actions()}{#if canCreate}<AddButton bind:element={trigger} label={ja?'子チケットを追加':'Add child ticket'} {disabled} onclick={()=>{if(trigger)onadd(trigger);}}/>{/if}{/snippet}
{#snippet mobileTicket(row:Ticket)}<div class="mobile-ticket"><strong>{row.code}</strong><p>{row.title}</p><p><span>{ja?'状態':'Status'}</span>{project.statuses.find(status=>status.id===row.statusId)?.name??''}</p><p><span>{ja?'担当者':'Assignee'}</span>{assignee(row)}</p></div>{/snippet}
<section data-ticket-card="children">
 <MasterList bind:this={list} endpoint={`/v1/projects/${project.id}/tickets`} queryParams={{parentId}} title={ja?'子チケット':'Child tickets'} listHeading={ja?'子チケット':'Child tickets'} description={ja?'直接の子チケットを表示します。':'Direct child tickets.'} initialSortBy="number" minTableWidth={480} mobileItem={mobileTicket} headerActions={actions} emptyLabel={ja?'子チケットはありません。':'No child tickets.'} onDetail={onopen?(row,trigger)=>{if(!disabled)onopen?.(row as Ticket,trigger);}:undefined} canDetail={!disabled} columns={[
  {key:'number',label:ja?'チケットID':'Ticket ID',value:row=>row.code},
  {key:'title',label:ja?'件名':'Title',value:row=>row.title},
  {key:'statusId',label:ja?'状態':'Status',sortable:false,value:row=>project.statuses.find(status=>status.id===row.statusId)?.name??''},
  {key:'assigneeId',label:ja?'担当者':'Assignee',sortable:false,value:row=>assignee(row as Ticket)}
 ]}/>
</section>
<style>.mobile-ticket{display:grid;gap:6px;overflow-wrap:anywhere}.mobile-ticket p{display:flex;gap:12px;margin:0;font-size:var(--font-size-body);color:var(--text)}.mobile-ticket p span{flex:0 0 80px;font-size:var(--font-size-support);color:var(--muted)}</style>
