<script lang="ts">
 import {customValueLabel} from '#lib/project-custom-fields.js';
 import {formatHours} from '#lib/project-time.js';
 import type {Snippet} from 'svelte';
 import type {SearchState} from '#lib/search.js';
 import MasterList from '../MasterList.svelte';
 import {formatEmployeeName,localization} from '#lib/localization.js';
 import {apiData} from '#lib/api.js';
 import type {Employee} from '#lib/employees.js';
 import EmployeeDetailModal from '../EmployeeDetailModal.svelte';
 import TextActionButton from '../TextActionButton.svelte';
 import StatusNotice from '../StatusNotice.svelte';
 import {ticketColumns} from '#lib/project-ticket-columns.js';
 import {day,personName,type Ticket,type Project,type Person} from '#lib/projects.js';
 type Row=Ticket&{parentNumber?:number|null;author?:Person;assignee?:Person|null;createdAt?:string;updatedAt?:string};
 let {projects,columns,customColumns=[],onopen,searchState=$bindable(),endpoint,headerActions,onLoaded}:{projects:Project[];columns:string[];customColumns?:Array<{key:string;label:{ja:string;en:string}}>;onopen:(t:Ticket,el:HTMLElement|null)=>void;searchState:SearchState;endpoint:string;headerActions:Snippet;onLoaded:(tickets:Ticket[],meta:Record<string,any>)=>void}=$props();
 let list=$state<MasterList>();
 let employee=$state<Employee|null>(null),employeeFocus=$state<HTMLElement|null>(null),employeeLoading=$state(false),employeeError=$state('');
 export async function refresh(){await list?.refresh();}
 let ja=$derived($localization.displayLanguage==='ja');const tr=(j:string,e:string)=>ja?j:e;
 const label=(key:string)=>(({project:tr('プロジェクトID','Project ID'),projectName:tr('プロジェクト名','Project name'),ticket:tr('チケットID','Ticket ID'),title:tr('チケット名','Ticket name')} as Record<string,string>)[key]??ticketColumns.find(c=>c[0]===key)?.[ja?1:2]??customColumns.find(c=>c.key===key)?.label[ja?'ja':'en']??projects.flatMap(p=>(p.customFields??[]).map(f=>({key:'custom.'+f.id,label:p.name+'／'+f.name}))).find(f=>f.key===key)?.label??key);
 const sorts:Record<string,string>={projectName:'project',ticket:'code',title:'title',type:'type',status:'status',assignee:'assignee',priority:'priority',startsOn:'startsOn',dueOn:'dueOn',createdAt:'createdAt',updatedAt:'updatedAt'};
 function assignee(t:Row){return t.assignee??projects.find(p=>p.id===t.projectId)?.members.find(m=>m.employeeId===t.assigneeId)?.employee;}
 async function openEmployee(person:Person,trigger:HTMLElement){if(employeeLoading)return;employeeFocus=trigger;employeeLoading=true;employeeError='';try{const r=await fetch('/v1/employees/'+person.id,{cache:'no-store'});if(!r.ok)throw Error();employee=await apiData<Employee>(r);}catch{employeeError=tr('従業員詳細を表示できませんでした。','Unable to load employee details.');}finally{employeeLoading=false;}}
 function value(t:Row,key:string){const p=projects.find(p=>p.id===t.projectId);if(key.startsWith('custom.')){const f=p?.customFields?.find(f=>'custom.'+f.id===key);return f?customValueLabel(f,t.customFields?.[f.id],ja):'—';}switch(key){
 case 'project':return p?.code??'';case 'projectName':return p?.name??'';case 'ticket':return t.code;case 'title':return t.title;
 case 'type':return p?.types.find(x=>x.id===t.typeId)?.name??'';case 'status':return p?.statuses.find(x=>x.id===t.statusId)?.name??'';
 case 'assignee':{const person=assignee(t);return person?formatEmployeeName({...person,middleName:null},$localization):'';}
 case 'author':return t.author?personName(t.author):'';case 'startsOn':case 'dueOn':return day(t[key])||'';
 case 'estimatedMinutes':case 'actualMinutes':return t[key]===null||t[key]===undefined?'':formatHours(t[key]);case 'labels':return t.labels.join(', ')||'';case 'parent':return t.parentCode??'';
 case 'createdAt':case 'updatedAt':return t[key]?new Intl.DateTimeFormat(ja?'ja-JP':'en-US',{dateStyle:'medium',timeStyle:'short',timeZone:$localization.timeZone}).format(new Date(t[key]!)):'';
 case 'priority':return ({low:tr('低','Low'),normal:tr('通常','Normal'),high:tr('高','High'),urgent:tr('緊急','Urgent')} as Record<string,string>)[t.priority]??t.priority;default:return '';}}
 let visibleColumns=$derived(columns);
 const columnWidth=(key:string)=>key==='title'?240:key==='projectName'?200:key==='ticket'?180:['createdAt','updatedAt'].includes(key)?200:['estimatedMinutes','actualMinutes','parent'].includes(key)?190:140;
 let tableWidth=$derived(visibleColumns.reduce((total,key)=>total+columnWidth(key),0));
 let displayColumns=$derived(visibleColumns.map(key=>({key:key==='project'?'projectCode':sorts[key]??key,label:label(key),sortable:Boolean(sorts[key]),value:(t:Row)=>value(t,key),...(key==='project'?{cell:projectCell}:key==='projectName'?{cell:projectNameCell}:key==='assignee'?{cell:assigneeCell}:{}),width:columnWidth(key)/tableWidth*100})));
</script>
{#snippet projectCell(ticket:Row)}<a class="project-link" href={'/projects/'+projects.find(p=>p.id===ticket.projectId)?.code+'/overview'}>{value(ticket,'project')}</a>{/snippet}
{#snippet projectNameCell(ticket:Row)}<a class="project-link" href={'/projects/'+projects.find(p=>p.id===ticket.projectId)?.code+'/overview'}>{value(ticket,'projectName')}</a>{/snippet}
{#snippet assigneeCell(ticket:Row)}{@const person=assignee(ticket)}{#if person}<TextActionButton class="assignee-link" disabled={employeeLoading} onclick={e=>void openEmployee(person,e.currentTarget)}>{value(ticket,'assignee')}</TextActionButton>{/if}{/snippet}
{#snippet mobileTicket(ticket:Row)}<div class="mobile-ticket">{#each columns as key}<p><span>{label(key)}</span>{#if key==='assignee'}{@render assigneeCell(ticket)}{:else if key==='project'}{@render projectCell(ticket)}{:else if key==='projectName'}{@render projectNameCell(ticket)}{:else}{value(ticket,key)}{/if}</p>{/each}</div>{/snippet}
{#if employeeError}<StatusNotice message={employeeError} tone="error" onDismiss={()=>employeeError=''}/>{/if}
<MasterList bind:this={list} bind:searchState {endpoint} columns={displayColumns} title={tr('チケット','Tickets')} listHeading={tr('チケット','Tickets')} description="" initialSortBy="updatedAt" pageSizeStorageKey="project-tickets-v1:list:size" sortStorageKey="project-tickets-v1:list:sort" minTableWidth={Math.max(720,tableWidth)} mobileItem={mobileTicket} {headerActions} canDetail actionLabel={item=>item.code+' '+item.title} onDetail={(item,trigger)=>onopen(item as Ticket,trigger)} onLoaded={(rows,meta)=>onLoaded(rows as Ticket[],meta)}/>
{#if employee}<EmployeeDetailModal {employee} titleId="ticket-assignee-detail-title" returnFocus={employeeFocus} onClose={()=>employee=null}/>{/if}
<style>:global(.master-list .assignee-link){color:var(--action-primary)!important;background:transparent!important}.project-link,.mobile-ticket a{color:var(--action-primary);text-decoration:none}.mobile-ticket{display:grid;gap:6px;overflow-wrap:anywhere}.mobile-ticket p{display:flex;gap:12px;margin:0;font-size:var(--font-size-body);color:var(--text)}.mobile-ticket p span{flex:0 0 110px;font-size:var(--font-size-support);color:var(--muted)}</style>
