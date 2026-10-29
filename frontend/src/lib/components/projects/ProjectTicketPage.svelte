<script lang="ts">
 import {notificationTargetRequest,confirmNotificationView} from '$lib/notification-view';
 import {onMount,untrack} from 'svelte';
 import {page} from '$app/state';
 import {goto,beforeNavigate} from '$app/navigation';
 import {localization} from '$lib/localization';
 import {readSessionUser} from '$lib/client-session';
 import {canOperate,type SessionUser} from '$lib/auth';
 import {initialSearch,searchChoiceLabel,searchMessages,type SearchContext,type SearchState} from '$lib/search';
 import {ticketProjectCode,projectRequest,projectError,type Project,type Ticket,type TicketDetail,type Relation} from '$lib/projects';
 import AssetManagementShell from '../AssetManagementShell.svelte';
 import ListCardTitle from '../ListCardTitle.svelte';
 import MasterPageHeader from '../MasterPageHeader.svelte';
 import SearchSelect from '../SearchSelect.svelte';
 import SearchMultiSelect from '../SearchMultiSelect.svelte';
 import SearchPanel from '../SearchPanel.svelte';
 import ActionButton from '../ActionButton.svelte';
 import StatusNotice from '../StatusNotice.svelte';
 import TicketList from './TicketList.svelte';
 import TicketModal from './TicketModal.svelte';
 import TicketCreation from './TicketCreation.svelte';
 import AddButton from '../AddButton.svelte';
 import ProjectViews from './ProjectViews.svelte';
 import GanttPeriodControls from './GanttPeriodControls.svelte';
 import type {GanttPeriod} from '$lib/project-gantt-period';
 import CrossProjectGantt from './CrossProjectGantt.svelte';
 import TicketColumnSettings from './TicketColumnSettings.svelte';
 import {defaultTicketColumns} from '$lib/project-ticket-columns';
 let {view='tickets',projectId=null,embedded=false}:{view?:string;projectId?:number|null;embedded?:boolean}=$props();
 let user=$state<SessionUser|null>(null),searchState=$state<SearchState>(initialSearch('projectTickets')),tickets=$state<Ticket[]>([]),projects=$state<Project[]>([]),relations=$state<Relation[]>([]),total=$state(0),error=$state(''),busy=$state(false),loading=$state(false),ready=$state(false),restoreFilter=$state(true),columns=$state([...defaultTicketColumns]),columnsReady=$state(false),columnError=$state(false),columnOpen=$state(false),trigger=$state<HTMLElement|null>(null),selected=$state<TicketDetail|null>(null),selectedProject=$state<Project|null>(null),ticketOpen=$state(false);
 let ja=$derived($localization.displayLanguage==='ja');const tr=(j:string,e:string)=>ja?j:e;
 let ganttGrouping=$state('project'),ganttPeriod=$state<GanttPeriod|null>(null);
 let ganttGroupingOptions=$derived([{value:'project',label:tr('プロジェクト別','Project')},{value:'assignee',label:tr('担当者別','Assignee')},{value:'none',label:tr('グループ化なし（開始日順）','None (start date)')}]);
 let title=$derived(view==='board'?tr('かんばん','Board'):view==='gantt'?tr('ガント','Gantt'):tr('チケット','Tickets'));
 let namespace=$derived('project-tickets-v1'+(projectId?':'+projectId:''));
 let contexts=$state<SearchContext[]>([]),draftOptions=$state<Record<string,string|boolean>>({});
 function optionValues(key:string){const value=draftOptions[key];return typeof value==='string'?value.split(','):[];}
 function setOption(key:string,values:string[]){const next={...draftOptions};if(values.length)next[key]=values.join(',');else delete next[key];draftOptions=next;}
 let list=$state<TicketList>();
 let creating=$state(false),createTrigger=$state<HTMLElement|null>(null);
 async function created(ticket:TicketDetail){creating=false;await refresh();await openTicket(ticket,createTrigger);}
 export async function refresh(){if(view==='tickets')await list?.refresh();else await load();}
 function receive(rows:Ticket[],meta:Record<string,any>){tickets=rows;projects=meta.projects??[];relations=meta.relations??[];total=meta.total??0;}
 let generation=0;let controller:AbortController|undefined;let opening='';
 async function loadColumns(){columnError=false;try{const p=await projectRequest<{employeeId:number;columns:string[]}>('/v1/personal-settings/project-ticket-columns');if(p.employeeId!==user?.id)throw Error();columns=p.columns;columnsReady=true;}catch{columnError=true;}}
 onMount(()=>{let disposed=false;void(async()=>{try{user=await readSessionUser();if(!user)return;try{const saved=sessionStorage.getItem(namespace+':'+user.id);if(saved){searchState={...initialSearch('projectTickets'),definition:JSON.parse(saved)};restoreFilter=false;draftOptions=searchState.definition.options;}}catch{/* default search */}if(!disposed){ready=true;await loadColumns();}}catch(e){error=projectError(e,ja);}})();return()=>{disposed=true;controller?.abort();generation++;};});
 beforeNavigate(()=>{remember();});
 function remember(){if(user&&!searchState.initializing)try{sessionStorage.setItem(namespace+':'+user.id,JSON.stringify(searchState.definition));}catch{/* optional storage */}}
 let searchVersion=$derived(searchState.initializing?undefined:searchState.version);
 $effect(()=>{const version=searchVersion;if(ready&&version!==undefined&&view!=='tickets'){untrack(()=>{remember();void load(false);});}});
 async function load(more=false){const id=++generation;controller?.abort();controller=new AbortController();loading=true;error='';searchState={...searchState,loading:true};try{const r=await fetch('/v1/project-ticket-searches'+(projectId?'?projectId='+projectId:''),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({definition:searchState.definition,offset:more?tickets.length:0}),signal:controller.signal});const p=await r.json();if(!r.ok)throw Error(p.error?.code);if(id!==generation)return;tickets=more?[...tickets,...p.data]:p.data;const mapped=new Map((more?projects:[]).map(p=>[p.id,p]));for(const project of p.meta.projects)mapped.set(project.id,project);projects=[...mapped.values()];relations=more?[...relations,...p.meta.relations.filter((r:Relation)=>!relations.some(x=>x.id===r.id))]:p.meta.relations;total=p.meta.total;searchState={...searchState,loading:false,success:true,error:false,total};}catch(e){if(id!==generation)return;error=projectError(e,ja);if(!more){tickets=[];projects=[];relations=[];total=0;}searchState={...searchState,loading:false,success:false,error:true};}finally{if(id===generation)loading=false;}}
 async function openTicket(t:Ticket,el:HTMLElement|null=null){trigger=el;const path=page.url.pathname;try{const pid=t.projectId??projectId;let p=pid?await projectRequest<Project>('/v1/projects/'+pid):null;
 if(!p)throw Error('Ticket project required');
 const detail=await projectRequest<TicketDetail>('/v1/projects/'+p!.id+'/tickets/'+t.id);if(page.url.pathname!==path)return;selectedProject=p;selected=detail;ticketOpen=true;if(page.url.searchParams.get('ticket')!==detail.code){const url=new URL(page.url);url.searchParams.set('ticket',detail.code);await goto(url.pathname+url.search,{replaceState:true,noScroll:true,keepFocus:true});}}
 catch(e){error=projectError(e,ja);}}
 async function openCode(code:string){const projectCode=ticketProjectCode(code);if(!projectCode){error=tr('チケットが見つかりません。','Ticket not found.');return;}try{const p=await projectRequest<Project>('/v1/projects/'+projectCode);if(projectId&&p.id!==projectId)throw Error();const t=await projectRequest<TicketDetail>('/v1/projects/'+p.id+'/tickets/'+code);await openTicket(t);}catch(e){error=projectError(e,ja);}}
 $effect(()=>{const id=page.url.searchParams.get('ticket');if(ready&&id&&opening!==id){opening=id;untrack(()=>{void openCode(id);});}else if(!id){opening='';ticketOpen=false;selected=null;selectedProject=null;}});
 async function closeTicket(){const url=new URL(page.url);url.searchParams.delete('ticket');ticketOpen=false;selected=null;selectedProject=null;await goto(url.pathname+url.search,{replaceState:true,noScroll:true,keepFocus:true});}
 async function changed(t:TicketDetail|null){selected=t;if(!t)await closeTicket();else if(selectedProject)selectedProject=await projectRequest<Project>('/v1/projects/'+selectedProject.id);await refresh();}
 async function move(t:Ticket,statusId:number){busy=true;try{await projectRequest('/v1/projects/'+t.projectId+'/tickets/'+t.id,'PATCH',{revision:t.revision,statusId});await refresh();}catch(e){error=projectError(e,ja);}finally{busy=false;}}
 $effect(()=>{if($notificationTargetRequest&&ticketOpen&&selected)confirmNotificationView('project-ticket',selected.code);});
</script>
{#snippet quickFilters()}
 {#each [['projectIds','project'],['assigneeIds','assignee'],['typeIds','type'],['statusIds','status'],['categories','category']] as [key,code]}
 {@const field=contexts[0]?.fields.find(f=>f.code===code)}
 {#if field}<div class="quick-field"><SearchMultiSelect label={field.label[ja?'ja':'en']} field={'ticket-quick-'+key} values={optionValues(key)} placeholder={searchMessages[ja?'ja':'en'].notSpecified} options={[...(key==='assigneeIds'?[{value:'unassigned',label:tr('未設定','Not set')}]:[]),...(field.options??field.choices?.map(value=>({value,label:searchChoiceLabel(value,'ticket',ja?'ja':'en')}))??[])]} onChange={values=>setOption(key,values)}/></div>{/if}
 {/each}
{/snippet}
{#snippet columnActions()}<ActionButton label={tr('表示項目','Display columns')} disabled={!columnsReady||!canOperate(user,'projects.preferences.update')} onclick={e=>{trigger=e.currentTarget as HTMLElement;columnOpen=true;}}/>{#if !embedded&&canOperate(user,'projects.tickets.create')}<AddButton iconOnly label={tr('チケットを作成','Create ticket')} onclick={e=>{createTrigger=e.currentTarget as HTMLElement;creating=true;}}/>{/if}{/snippet}
{#snippet content()}
 <div class="ticket-page">{#if !embedded}<MasterPageHeader {title}/>{/if}
 {#if error}<StatusNotice message={error} tone="error" onDismiss={()=>error=''}/>{/if}
 {#if ready&&user}<SearchPanel target="projectTickets" storageNamespace={namespace} userId={user.id} restoreSelectedFilter={restoreFilter} bind:searchState {draftOptions} onRestoreOptions={value=>draftOptions=value} onDefinitions={value=>contexts=value} filters={quickFilters}/>{/if}
 {#if columnError}<StatusNotice message={tr('表示項目設定を取得できませんでした。','Unable to load column preferences.')} tone="error" onDismiss={()=>columnError=false}/>{/if}
 {#if !columnsReady&&ready}<ActionButton label={tr('表示項目設定を再取得','Retry column preferences')} onclick={loadColumns}/>{/if}
 {#if view==='tickets'}
 <TicketList bind:this={list} bind:searchState {projects} {columns} onopen={openTicket} endpoint={'/v1/project-ticket-searches'+(projectId?'?projectId='+projectId:'')} headerActions={columnActions} onLoaded={receive}/>
 {:else}
 <section class="results" aria-label={title}>
 <div class="results-toolbar" class:gantt-toolbar={view==='gantt'}><ListCardTitle {title}/>{#if view==='gantt'}<div class="gantt-controls"><GanttPeriodControls {tickets} onapply={period=>ganttPeriod=period}/><div class="gantt-grouping"><div class="gantt-grouping-sizer" aria-hidden="true">{#each ganttGroupingOptions as option}<span>{option.label}</span>{/each}</div><SearchSelect field="gantt-grouping" label={tr('グループ化','Group by')} showLabel={false} value={ganttGrouping} searchable={false} options={ganttGroupingOptions} onSelect={v=>ganttGrouping=v}/></div></div>{/if}</div>
 <p class="count">{tr('読み込み済み','Loaded')}: {tickets.length} / {total}{#if tickets.length<total} · {tr('一部の検索結果を表示しています。','Showing partial results.')}{/if}</p>
 {#if loading}<p aria-live="polite">{tr('読み込み中…','Loading…')}</p>{/if}
 {#if view==='gantt'}<CrossProjectGantt {tickets} {projects} {relations} mode={ganttGrouping} period={ganttPeriod} onopen={openTicket}/>
 {:else}{#each projects as project (project.id)}<section class="project-board"><h3><a href={'/projects/'+project.code+'/overview'}>{project.code} · {project.name}</a></h3><ProjectViews {project} tickets={tickets.filter(t=>t.projectId===project.id)} relations={relations.filter(r=>tickets.some(t=>t.id===r.fromId&&t.projectId===project.id))} view="board" {busy} onopen={openTicket} onmove={move} onchild={()=>{}} onorder={()=>{}}/></section>{/each}{/if}
 {#if !loading&&!tickets.length&&!error}<p>{tr('条件に一致するチケットはありません。','No tickets match the conditions.')}</p>{/if}
 {#if tickets.length<total}<ActionButton label={tr('さらに読み込む','Load more')} disabled={loading} onclick={()=>void load(true)}/>{/if}
 {#if error}<ActionButton label={tr('再試行','Retry')} disabled={loading} onclick={()=>void load()}/>{/if}
 </section>{/if}</div>
{/snippet}
{#if embedded}{@render content()}{:else}<AssetManagementShell {title}>{@render content()}</AssetManagementShell>{/if}
{#if columnOpen&&user}<TicketColumnSettings {columns} userId={user.id} returnFocus={trigger} onclose={()=>columnOpen=false} onsaved={next=>{columns=next;columnOpen=false;}}/>{/if}
{#if creating&&user}<TicketCreation employeeId={user.id} returnFocus={createTrigger} onclose={()=>creating=false} oncreated={created}/>{/if}
{#if ticketOpen&&selectedProject&&user}{#key selected?.id}<TicketModal project={selectedProject} ticket={selected} tickets={tickets.filter(t=>t.projectId===selectedProject?.id)} relations={relations.filter(r=>tickets.some(t=>t.id===r.fromId&&t.projectId===selectedProject?.id))} employeeId={user.id} returnFocus={trigger} onclose={()=>void closeTicket()} onchanged={changed}/>{/key}{/if}
<style>.quick-field{flex:0 1 200px;width:200px;max-width:100%;min-width:0}.ticket-page{display:grid;gap:16px;min-width:0;max-width:100%}.results{background:var(--surface);border:1px solid var(--border);border-radius:8px;box-shadow:var(--shadow);padding:20px;display:grid;gap:16px;min-width:0}.results-toolbar{display:flex;gap:12px;align-items:center;flex-wrap:wrap}.results-toolbar.gantt-toolbar{display:grid;grid-template-columns:minmax(0,1fr) max-content max-content}.gantt-controls{display:contents}.gantt-controls :global(.period-controls){grid-column:2}.gantt-grouping{grid-column:3}.gantt-grouping{display:grid;grid-template-columns:minmax(0,1fr);width:max-content;max-width:100%;min-width:0}.gantt-grouping-sizer{display:grid;height:0;overflow:hidden;visibility:hidden;pointer-events:none;font-size:var(--font-size-body);font-weight:var(--sph-weight-400)}.gantt-grouping-sizer span{grid-area:1/1;white-space:nowrap;padding-right:44px}.count{color:var(--muted);font-size:var(--font-size-support);margin:0}.project-board{min-width:0}h3{font-size:var(--font-size-body)}h3 a{color:var(--text);text-decoration:none}@media(max-width:1200px){.results-toolbar.gantt-toolbar{grid-template-columns:max-content minmax(0,1fr)}.gantt-controls :global(.period-controls){grid-column:1/-1;grid-row:2;justify-self:end}.gantt-grouping{grid-column:2;grid-row:1;justify-self:end}}@media(max-width:700px){.results{padding:12px}}</style>
