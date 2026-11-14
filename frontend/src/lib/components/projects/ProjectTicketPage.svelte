<script lang="ts">
 import {notificationTargetRequest,confirmNotificationView} from '#lib/notification-view.js';
 import {onMount,tick,untrack} from 'svelte';
 import {page} from '$app/state';
 import {goto,beforeNavigate} from '$app/navigation';
 import {localization} from '#lib/localization.js';
 import {readSessionUser} from '#lib/client-session.js';
 import {canOperate,type SessionUser} from '#lib/auth.js';
 import {initialSearch,searchChoiceLabel,searchMessages,type SearchContext,type SearchState} from '#lib/search.js';
 import {ticketProjectCode,projectRequest,projectError,type Project,type Ticket,type TicketDetail,type Relation} from '#lib/projects.js';
 import AssetManagementShell from '../AssetManagementShell.svelte';
 import ListCardTitle from '../ListCardTitle.svelte';
 import MasterPageHeader from '../MasterPageHeader.svelte';
 import SearchSelect from '../SearchSelect.svelte';
 import SearchMultiSelect from '../SearchMultiSelect.svelte';
 import SearchOptionalSelection from '../SearchOptionalSelection.svelte';
 import {hierarchySelection,replaceHierarchySelection} from '#lib/project-ticket-hierarchy.js';
 import {unsetSelection} from '#lib/search-selection.js';
 import SearchPanel from '../SearchPanel.svelte';
 import ViewportListPage from '../ViewportListPage.svelte';
 import ActionButton from '../ActionButton.svelte';
 import StatusNotice from '../StatusNotice.svelte';
 import TicketList from './TicketList.svelte';
 import TicketModal from './TicketModal.svelte';
 import TicketCreation from './TicketCreation.svelte';
 import AddButton from '../AddButton.svelte';
 import ProjectViews from './ProjectViews.svelte';
 import GanttPeriodControls from './GanttPeriodControls.svelte';
 import type {GanttPeriod} from '#lib/project-gantt-period.js';
 import CrossProjectGantt from './CrossProjectGantt.svelte';
 import TicketColumnSettings from './TicketColumnSettings.svelte';
 import {defaultTicketColumns} from '#lib/project-ticket-columns.js';
 import {mergeById,retainPanelOrder,readAllProjectTickets,IncompleteTicketSearchError,type TicketSearchRequest,type TicketSearchPage} from '#lib/project-ticket-panel.js';
 let {view='tickets',projectId=null,embedded=false,oncreate,createDisabled=false}:{view?:string;projectId?:number|null;embedded?:boolean;oncreate?:(trigger:HTMLElement)=>void;createDisabled?:boolean}=$props();
 let user=$state<SessionUser|null>(null),searchState=$state<SearchState>(initialSearch('projectTickets')),tickets=$state<Ticket[]>([]),projects=$state<Project[]>([]),relations=$state<Relation[]>([]),total=$state(0),error=$state(''),busy=$state(false),loading=$state(false),ready=$state(false),restoreFilter=$state(true),columns=$state([...defaultTicketColumns]),columnsReady=$state(false),columnError=$state(false),columnOpen=$state(false),trigger=$state<HTMLElement|null>(null),selected=$state<TicketDetail|null>(null),selectedProject=$state<Project|null>(null),ticketOpen=$state(false);
 let ja=$derived($localization.displayLanguage==='ja');const tr=(j:string,e:string)=>ja?j:e;
 let ganttGrouping=$state('project'),ganttPeriod=$state<GanttPeriod|null>(null);
 let collapsedProjects=$state<number[]>([]);
 let panelOrder=$state<number[]>([]),needsReconcile=$state(false),savedMove=$state(false);
 let ticketById=$derived(new Map(tickets.map(ticket=>[ticket.id,ticket])));
 let panelTickets=$derived(panelOrder.map(id=>ticketById.get(id)).filter((t):t is Ticket=>!!t));
 let ganttGroupingOptions=$derived([{value:'project',label:tr('プロジェクト別','Project')},{value:'assignee',label:tr('担当者別','Assignee')},{value:'none',label:tr('グループ化なし（開始日順）','None (start date)')}]);
 let title=$derived(view==='ticket-panel'?tr('チケットパネル','Ticket panel'):view==='gantt'?tr('ガントチャート','Gantt chart'):tr('チケット','Tickets'));
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
 let customColumns=$state<Array<{key:string;label:{ja:string;en:string}}>>([]);
 async function loadColumns(){columnError=false;try{const p=await projectRequest<{employeeId:number;columns:string[];customColumns?:Array<{key:string;label:{ja:string;en:string}}>}>('/v1/personal-settings/project-ticket-columns');if(p.employeeId!==user?.id)throw Error();columns=p.columns;customColumns=p.customColumns??[];columnsReady=true;}catch{columnError=true;}}
 onMount(()=>{let disposed=false;void(async()=>{try{user=await readSessionUser();if(!user)return;try{const saved=sessionStorage.getItem(namespace+':'+user.id);if(saved){searchState={...initialSearch('projectTickets'),definition:JSON.parse(saved)};restoreFilter=false;draftOptions=searchState.definition.options;}}catch{/* default search */}if(!disposed){ready=true;await loadColumns();}}catch(e){error=projectError(e,ja);}})();return()=>{disposed=true;controller?.abort();generation++;};});
 beforeNavigate(n=>{remember();if(n.to?.url.pathname!==page.url.pathname){controller?.abort();generation++;}});
 function remember(){if(user&&!searchState.initializing)try{sessionStorage.setItem(namespace+':'+user.id,JSON.stringify(searchState.definition));}catch{/* optional storage */}}
 let searchVersion=$derived(searchState.initializing?undefined:searchState.version);
 $effect(()=>{const version=searchVersion;if(ready&&version!==undefined&&view!=='tickets'){untrack(()=>{remember();void load(true);});}});
 async function readPage(body:TicketSearchRequest,signal:AbortSignal):Promise<TicketSearchPage>{
  const r=await fetch('/v1/project-ticket-searches'+(projectId?'?projectId='+projectId:''),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal});
  const p=await r.json();if(!r.ok)throw Error(p.error?.code);return p;
 }
 function setPanelRows(rows:Ticket[],nextProjects:Project[],nextRelations:Relation[]){
  panelOrder=retainPanelOrder(tickets,panelOrder,rows);tickets=rows;
  const visibleProjects=new Set(rows.map(t=>t.projectId));
  projects=mergeById(projects,nextProjects).filter(p=>visibleProjects.has(p.id));
  relations=nextRelations;
 }
 async function load(newSearch=false){
  const id=++generation;controller?.abort();controller=new AbortController();const signal=controller.signal;
  const definition=structuredClone($state.snapshot(searchState.definition));loading=true;error='';
  if(newSearch){tickets=[];panelOrder=[];projects=[];relations=[];total=0;needsReconcile=false;savedMove=false;}
  searchState={...searchState,loading:true};
  try{
   const next=await readAllProjectTickets(body=>readPage(body,signal),definition);if(id!==generation)return;
   if(view==='ticket-panel')setPanelRows(next.rows,next.projects,next.relations);
   else{tickets=next.rows;projects=next.projects;relations=next.relations;}
   total=next.total;needsReconcile=false;savedMove=false;
   searchState={...searchState,loading:false,success:true,error:false,total};
  }catch(e){if(id!==generation)return;error=(savedMove?tr('状態は更新済みです。一覧の再取得に失敗しました。','The status was saved, but the tickets could not be refreshed. '):'')+(e instanceof IncompleteTicketSearchError?tr('取得中に検索結果が変わりました。再試行してください。','Search results changed while loading. Please retry.'):projectError(e,ja));if(view==='ticket-panel')needsReconcile=true;searchState={...searchState,loading:false,success:false,error:true};}
  finally{if(id===generation)loading=false;}
 }
 async function openTicket(t:Ticket,el:HTMLElement|null=null){trigger=el;const path=page.url.pathname;try{const pid=t.projectId??projectId;let p=pid?await projectRequest<Project>('/v1/projects/'+pid):null;
 if(!p)throw Error('Ticket project required');
 const detail=await projectRequest<TicketDetail>('/v1/projects/'+p!.id+'/tickets/'+t.id);if(page.url.pathname!==path)return;selectedProject=p;selected=detail;ticketOpen=true;if(page.url.searchParams.get('ticket')!==detail.code){const url=new URL(page.url.href);url.searchParams.set('ticket',detail.code);await goto(url.pathname+url.search,{replace:true,reset:false});}}
 catch(e){error=projectError(e,ja);}}
 async function openCode(code:string){const projectCode=ticketProjectCode(code);if(!projectCode){error=tr('チケットが見つかりません。','Ticket not found.');return;}try{const p=await projectRequest<Project>('/v1/projects/'+projectCode);if(projectId&&p.id!==projectId)throw Error();const t=await projectRequest<TicketDetail>('/v1/projects/'+p.id+'/tickets/'+code);await openTicket(t);}catch(e){error=projectError(e,ja);}}
 $effect(()=>{const id=page.url.searchParams.get('ticket');if(ready&&id&&opening!==id){opening=id;if(selected?.code!==id)untrack(()=>{void openCode(id);});}else if(!id){opening='';ticketOpen=false;selected=null;selectedProject=null;}});
 async function closeTicket(){const url=new URL(page.url.href);url.searchParams.delete('ticket');ticketOpen=false;selected=null;selectedProject=null;await goto(url.pathname+url.search,{replace:true,reset:false});await tick();trigger?.focus({preventScroll:true});}
 async function changed(t:TicketDetail|null){selected=t;if(!t)await closeTicket();else if(selectedProject)selectedProject=await projectRequest<Project>('/v1/projects/'+selectedProject.id);await refresh();}
 async function move(t:Ticket,statusId:number){
  if(busy||loading||needsReconcile||t.statusId===statusId)return;
  const version=searchState.version,path=page.url.pathname;busy=true;error='';
  try{
   const updated=await projectRequest<TicketDetail>('/v1/projects/'+t.projectId+'/tickets/'+t.id,'PATCH',{revision:t.revision,statusId});
   if(path!==page.url.pathname)return;
   if(version!==searchState.version){await load(true);return;}
   const rows=mergeById(tickets,[updated]);panelOrder=retainPanelOrder(tickets,panelOrder,rows);tickets=rows;
   needsReconcile=true;savedMove=true;await load();
  }catch(e){if(path===page.url.pathname&&version===searchState.version){error=projectError(e,ja);needsReconcile=true;}}
  finally{busy=false;}
 }
 $effect(()=>{if($notificationTargetRequest&&ticketOpen&&selected)confirmNotificationView('project-ticket',selected.code);});
</script>
{#snippet hierarchyHelp()}<p>{tr('直接の親・子チケットの有無で絞り込みます。孫以下は含めません。削除済みチケットは除外し、他の検索条件で非表示のチケットも判定に含めます。','Filter by direct parent or child tickets, excluding deleted tickets and deeper descendants. Tickets hidden by other search conditions still count.')}</p>{/snippet}
{#snippet quickFilters(conditions:import('#lib/search.js').SearchGroup,onConditionsChange:(value:import('#lib/search.js').SearchGroup)=>void)}
 {#each [['projectIds','project'],['assigneeIds','assignee'],['typeIds','type'],['statusIds','status'],['categories','category']] as [key,code]}
 {@const field=contexts[0]?.fields.find(f=>f.code===code)}
 {#if field}<div class="quick-field">{#if field.unsetMode}<SearchOptionalSelection label={field.label[ja?'ja':'en']} field={'ticket-quick-'+key} item={{context:'ticket',root:true,field}} {conditions} {onConditionsChange} values={optionValues(key).map(value=>value==='unassigned'?unsetSelection:value)} options={field.options??[]} onChange={values=>setOption(key,values)}/>{:else}<SearchMultiSelect label={field.label[ja?'ja':'en']} field={'ticket-quick-'+key} values={optionValues(key)} placeholder={searchMessages[ja?'ja':'en'].notSpecified} options={field.options??field.choices?.map(value=>({value,label:searchChoiceLabel(value,'ticket',ja?'ja':'en')}))??[]} onChange={values=>setOption(key,values)}/>{/if}</div>{/if}
 {/each}
 {#each ['parentPresence','childPresence'] as code}
 {@const field=contexts[0]?.fields.find(f=>f.code===code)}
 {#if field}{@const selection=hierarchySelection(conditions,field)}<div class="quick-field hierarchy-field"><SearchSelect label={field.label[ja?'ja':'en']} field={'ticket-quick-'+code} value={selection.value} help={hierarchyHelp} options={[{value:'',label:searchMessages[ja?'ja':'en'].notSpecified},...(field.choices??[]).map(value=>({value,label:searchChoiceLabel(value,'ticket',ja?'ja':'en')}))]} onSelect={value=>onConditionsChange(replaceHierarchySelection(conditions,field,value))}/>{#if selection.additional}<p class="hierarchy-additional">{tr('保存済みの追加条件も適用されています。','Additional saved conditions also apply.')}</p>{/if}</div>{/if}
 {/each}
{/snippet}
{#snippet createAction()}{#if ready&&user&&(embedded?Boolean(oncreate):canOperate(user,'projects.tickets.create'))}<AddButton iconOnly disabled={createDisabled} label={tr('チケットを作成','Create ticket')} onclick={e=>{createTrigger=e.currentTarget as HTMLElement;if(embedded)oncreate?.(createTrigger);else creating=true;}}/>{/if}{/snippet}
{#snippet columnActions()}<ActionButton label={tr('表示項目','Display columns')} disabled={!columnsReady||!canOperate(user,'projects.preferences.update')} onclick={e=>{trigger=e.currentTarget as HTMLElement;columnOpen=true;}}/>{@render createAction()}{/snippet}
{#snippet content()}
 <div class="ticket-page" aria-busy={busy||loading}><ViewportListPage>{#if !embedded}<MasterPageHeader {title}/>{/if}
 {#if error}<StatusNotice message={error} tone="error" onDismiss={()=>error=''}/>{/if}
 {#if ready&&user}<SearchPanel target="projectTickets" storageNamespace={namespace} userId={user.id} restoreSelectedFilter={restoreFilter} bind:searchState {draftOptions} onRestoreOptions={value=>draftOptions=value} onDefinitions={value=>contexts=value} filters={quickFilters}/>{/if}
 {#if columnError}<StatusNotice message={tr('表示項目設定を取得できませんでした。','Unable to load column preferences.')} tone="error" onDismiss={()=>columnError=false}/>{/if}
 {#if !columnsReady&&ready}<ActionButton label={tr('表示項目設定を再取得','Retry column preferences')} onclick={loadColumns}/>{/if}
 {#if view==='tickets'}
 <TicketList {customColumns} bind:this={list} bind:searchState {projects} {columns} onopen={openTicket} endpoint={'/v1/project-ticket-searches'+(projectId?'?projectId='+projectId:'')} headerActions={columnActions} onLoaded={receive}/>
 {:else}
 <section class="results" aria-label={title}>
 <div class="results-toolbar" class:gantt-toolbar={view==='gantt'}><ListCardTitle {title}/>{#if view==='ticket-panel'}<div class="panel-create-actions">{@render createAction()}</div>{/if}{#if view==='gantt'}<div class="gantt-controls"><GanttPeriodControls {tickets} onapply={period=>ganttPeriod=period}/><div class="gantt-grouping"><div class="gantt-grouping-sizer" aria-hidden="true">{#each ganttGroupingOptions as option}<span>{option.label}</span>{/each}</div><SearchSelect field="gantt-grouping" label={tr('グループ化','Group by')} showLabel={false} value={ganttGrouping} searchable={false} options={ganttGroupingOptions} onSelect={v=>ganttGrouping=v}/></div></div>{/if}</div>
 {#if loading}<p aria-live="polite">{tr('読み込み中…','Loading…')}</p>{/if}
 {#if view==='gantt'}<CrossProjectGantt {tickets} {projects} {relations} mode={ganttGrouping} period={ganttPeriod} widthStorageKey={'project-gantt-ticket-width-v1:'+user?.id} onopen={openTicket}/>
 {:else}{#each projects as project (project.id)}<section class="project-ticket-panel"><h3><button class="project-toggle" aria-expanded={!collapsedProjects.includes(project.id)} aria-controls={'ticket-panel-project-'+project.id} onclick={()=>collapsedProjects=collapsedProjects.includes(project.id)?collapsedProjects.filter(id=>id!==project.id):[...collapsedProjects,project.id]}><span aria-hidden="true">{collapsedProjects.includes(project.id)?'▸':'▾'}</span> {project.code} · {project.name}</button></h3><div id={'ticket-panel-project-'+project.id} hidden={collapsedProjects.includes(project.id)}><ProjectViews {project} tickets={panelTickets.filter(t=>t.projectId===project.id)} relations={relations.filter(r=>tickets.some(t=>t.id===r.fromId&&t.projectId===project.id))} view="ticket-panel" busy={busy||loading||needsReconcile} onopen={openTicket} onmove={move} onchild={()=>{}} onorder={()=>{}}/></div></section>{/each}{/if}
 {#if !loading&&!tickets.length&&!error}<p>{tr('条件に一致するチケットはありません。','No tickets match the conditions.')}</p>{/if}
 {#if error}<ActionButton label={tr('再試行','Retry')} disabled={loading||busy} onclick={()=>void load()}/>{/if}
 </section>{/if}</ViewportListPage></div>
{/snippet}
{#if embedded}{@render content()}{:else}<AssetManagementShell {title}>{@render content()}</AssetManagementShell>{/if}
{#if columnOpen&&user}<TicketColumnSettings {columns} {customColumns} userId={user.id} returnFocus={trigger} onclose={()=>columnOpen=false} onsaved={next=>{columns=next;columnOpen=false;}}/>{/if}
{#if creating&&user}<TicketCreation employeeId={user.id} returnFocus={createTrigger} onclose={()=>creating=false} oncreated={created}/>{/if}
{#if ticketOpen&&selectedProject&&user}{#key selected?.id}<TicketModal project={selectedProject} ticket={selected} tickets={tickets.filter(t=>t.projectId===selectedProject?.id)} relations={relations.filter(r=>tickets.some(t=>t.id===r.fromId&&t.projectId===selectedProject?.id))} employeeId={user.id} returnFocus={trigger} onclose={()=>void closeTicket()} onchanged={changed}/>{/key}{/if}
<style>
.hierarchy-field :global(.form-select-label){font-weight:var(--sph-weight-400);color:var(--text-secondary)}.hierarchy-additional{font-size:var(--font-size-support);color:var(--muted);margin:var(--sph-space-6px) 0 0}.panel-create-actions{margin-left:auto;display:flex;align-items:center}@media(max-width:700px),(min-width:701px) and (max-width:1024px) and (max-height:500px) and (any-pointer:coarse){.panel-create-actions :global(.app-add-icon){width:44px;height:44px}}.quick-field{flex:0 1 200px;width:200px;max-width:100%;min-width:0}.hierarchy-field{flex-basis:160px;width:160px}.ticket-page{min-width:0;max-width:100%}.results{background:var(--surface);border:1px solid var(--border);border-radius:8px;box-shadow:var(--shadow);padding:20px;display:grid;gap:16px;min-width:0}.results-toolbar{display:flex;gap:12px;align-items:center;flex-wrap:wrap}.results-toolbar.gantt-toolbar{display:grid;grid-template-columns:minmax(0,1fr) max-content max-content}.gantt-controls{display:contents}.gantt-controls :global(.period-controls){grid-column:2}.gantt-grouping{grid-column:3}.gantt-grouping{display:grid;grid-template-columns:minmax(0,1fr);width:max-content;max-width:100%;min-width:0}.gantt-grouping-sizer{display:grid;height:0;overflow:hidden;visibility:hidden;pointer-events:none;font-size:var(--font-size-body);font-weight:var(--sph-weight-400)}.gantt-grouping-sizer span{grid-area:1/1;white-space:nowrap;padding-right:44px}.project-ticket-panel{min-width:0}h3{font-size:var(--font-size-body)}.project-toggle{display:block;width:100%;min-height:48px;padding:8px;border:0;background:var(--surface-hover);color:var(--text);font:inherit;font-weight:600;text-align:left;overflow-wrap:anywhere;cursor:pointer}.project-toggle:focus-visible{outline:2px solid var(--action-primary);outline-offset:2px}@media(max-width:1200px){.results-toolbar.gantt-toolbar{grid-template-columns:max-content minmax(0,1fr)}.gantt-controls :global(.period-controls){grid-column:1/-1;grid-row:2;justify-self:end}.gantt-grouping{grid-column:2;grid-row:1;justify-self:end}}@media(max-width:700px){.results{padding:12px}}
</style>
