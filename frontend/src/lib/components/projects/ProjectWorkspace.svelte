<script lang="ts">
 import EvmDashboard from './EvmDashboard.svelte';
 import {formatHours} from '#lib/project-time.js';
 import {onMount,tick} from 'svelte';
 import ProjectTicketPage from './ProjectTicketPage.svelte';
 let {view='overview'}:{view?:string}=$props();
 import {page} from '$app/state';
 import {goto,beforeNavigate} from '$app/navigation';
 import {localization} from '#lib/localization.js';
 import {historyTitle,historyLines} from '#lib/project-history.js';
 import {readSessionUser} from '#lib/client-session.js';
 import {canOperate,type SessionUser} from '#lib/auth.js';
 import {canProject,personName,projectRequest,projectError,type Project,type Ticket,type TicketDetail,type Person,type Relation,type History} from '#lib/projects.js';
 import AssetManagementShell from '#lib/components/AssetManagementShell.svelte';
 import MasterPageHeader from '#lib/components/MasterPageHeader.svelte';
 import ActionButton from '#lib/components/ActionButton.svelte';
 import DeleteIconButton from '#lib/components/DeleteIconButton.svelte';
 import FormInput from '#lib/components/FormInput.svelte';
 import SearchSelect from '#lib/components/SearchSelect.svelte';
 import StatusNotice from '#lib/components/StatusNotice.svelte';
 import MarkdownBody from './MarkdownBody.svelte';
 import InfoPopover from '#lib/components/InfoPopover.svelte';
 import ProjectDescriptionEditor from './ProjectDescriptionEditor.svelte';
 import TicketModal from './TicketModal.svelte';
 import ProjectMembers from './ProjectMembers.svelte';
 import ProjectSettings from './ProjectSettings.svelte';
 let project=$state<Project|null>(null),user=$state<SessionUser|null>(null),tickets=$state<Ticket[]>([]),relations=$state<Relation[]>([]),loading=$state(true),busy=$state(false),error=$state(''),notice=$state(''),tab=$derived(view),archivedNoticeHidden=$state(false),selected=$state<TicketDetail|null>(null),ticketOpen=$state(false),parentId=$state<number|null>(null),trigger=$state<HTMLElement|null>(null),settingsDirty=$state(false),history=$state<History[]>([]),historyTotal=$state(0),engagements=$state<Array<{id:number;name:string}>>([]);
 let ja=$derived($localization.displayLanguage==='ja');const tr=(j:string,e:string)=>ja?j:e;
 let engagementsAvailable=$state(false);
 let ticketPage=$state<ProjectTicketPage>();
 let deleteProjectCode=$state('');
 let editingDescription=$state(false),descriptionEditButton=$state<HTMLButtonElement>();
 async function closeDescription(){editingDescription=false;await tick();descriptionEditButton?.focus({preventScroll:true});}
 $effect(()=>{if(tab!=='overview')editingDescription=false;});
 $effect(()=>{void tab;deleteProjectCode='';});
 const root=()=>'/v1/projects/'+page.params.id;
 let tabs=$derived([{id:'overview',label:tr('概要','Overview')},{id:'tickets',label:tr('チケット','Tickets')},{id:'ticket-panel',label:tr('チケットパネル','Ticket panel')},{id:'gantt',label:tr('ガントチャート','Gantt chart')},...(canOperate(user,'projects.financial.read')?[{id:'evm',label:'EVM'}]:[]),{id:'history',label:tr('履歴','History')},{id:'members',label:tr('参加者','Members')},...(project&&(canProject(project,'update',true)||canProject(project,'settings.manage',true)||canProject(project,'delete',true))?[{id:'settings',label:tr('設定','Settings')}]:[])]);
 $effect(()=>{if(tab==='history'&&project)void loadHistory();});
 beforeNavigate(n=>{if(settingsDirty&&!confirm(tr('設定変更を破棄しますか？','Discard settings changes?')))n.cancel();});
 async function load(){project=await projectRequest<Project>(root());}
 async function loadTickets(more=false){const offset=more?tickets.length:0;const r=await fetch(root()+`/tickets?limit=500&offset=${offset}&sortBy=position&sortOrder=asc`);const payload=await r.json();if(!r.ok)throw new Error(payload.error?.code);tickets=more?[...tickets,...payload.data]:payload.data;relations=payload.meta.relations;}
 async function loadHistory(more=false){try{const r=await fetch(root()+`/history?limit=100&offset=${more?history.length:0}&sortOrder=desc`),payload=await r.json();if(!r.ok)throw new Error();history=more?[...history,...payload.data]:payload.data;historyTotal=payload.meta.total;}catch(e){error=projectError(e,ja);}}
 async function openTicket(t:Ticket,el:HTMLElement|null=null){try{await loadTickets();selected=await projectRequest<TicketDetail>(root()+'/tickets/'+t.id);trigger=el;ticketOpen=true;parentId=null;const url=new URL(page.url.href);url.searchParams.set('ticket',selected.code);await goto(url.pathname+url.search,{replace:true,reset:false});}catch(e){error=projectError(e,ja);}}
 async function newTicket(parent:Ticket|null=null){try{await loadTickets();selected=null;parentId=parent?.id??null;ticketOpen=true;}catch(e){error=projectError(e,ja);}}
 async function closeTicket(){ticketOpen=false;selected=null;const url=new URL(page.url.href);url.searchParams.delete('ticket');await goto(url.pathname+url.search,{replace:true,reset:false});await tick();trigger?.focus({preventScroll:true});}
 async function changed(t:TicketDetail|null){if(t)selected=t;await load();await ticketPage?.refresh();if(tab==='history')await loadHistory();}
 async function remove(){if(!project||tab!=='settings'||busy||settingsDirty||deleteProjectCode!==project.code||!canProject(project,'delete',true)||!confirm(tr('このプロジェクトに所属しているすべての情報が削除されます。本当に削除してよろしいですか？','All information belonging to this project will be deleted. Are you sure you want to delete it?')))return;busy=true;error='';try{await projectRequest(root()+'?revision='+project.revision,'DELETE');await goto('/projects');}catch(e){error=projectError(e,ja);}finally{busy=false;}}
 onMount(()=>{void(async()=>{try{user=await readSessionUser();await load();if(canOperate(user,'engagements.read')){let offset=0;while(true){const rows=await projectRequest<Array<{id:number;name:string}>>('/v1/engagements?limit=500&offset='+offset);engagements.push(...rows);if(rows.length<500)break;offset+=500;}engagementsAvailable=true;}}catch(e){error=projectError(e,ja);}finally{loading=false;}})();});
</script>
<AssetManagementShell title={project?.name??tr('プロジェクト','Projects')}><div class="workspace"><MasterPageHeader title={project?.name??tr('プロジェクト','Projects')}/>
 <div class="toolbar"><ActionButton label={tr('プロジェクト一覧','All projects')} onclick={()=>void goto('/projects')}/>{#if project}<span>{project.code} · {project.name}</span>{/if}</div>
 {#if error}<StatusNotice message={error} tone="error" onDismiss={()=>error=''}/>{/if}{#if notice}<StatusNotice message={notice} tone="success" onDismiss={()=>notice=''}/>{/if}
 {#if loading}<p>{tr('読み込み中…','Loading…')}</p>{:else if project}
 {#if project.status==='archived'&&!archivedNoticeHidden}<StatusNotice tone="info" onDismiss={()=>archivedNoticeHidden=true} message={tr('このプロジェクトはアーカイブされています。','This project is archived.')}/>{/if}
 <nav class="project-nav" aria-label={tr('プロジェクト内の機能','Project navigation')}>{#each tabs as item}<a id={`project-${item.id}-tab`} href={'/projects/'+project.code+'/'+item.id} aria-current={tab===item.id?'page':undefined}>{item.label}</a>{/each}</nav>
 {#if ['tickets','ticket-panel','gantt'].includes(tab)}<ProjectTicketPage bind:this={ticketPage} view={tab} projectId={project.id} embedded oncreate={project.status!=='archived'&&canProject(project,'tickets.create')?el=>{trigger=el;void newTicket();}:undefined} createDisabled={settingsDirty||busy}/>{:else}
 <div class="content-card" class:overview-panel={tab==='overview'} class:settings-panel={tab==='settings'} class:members-panel={tab==='members'} role="tabpanel" id={`project-${tab}-panel`} aria-labelledby={`project-${tab}-tab`}>
 {#if tab==='overview'}
 <dl class="overview-summary">
  <div class="summary-item"><dt><span>{tr('進捗','Progress')}</span><InfoPopover label={tr('進捗の説明','Progress help')}><p>{tr('完了チケット／全チケット','Completed / total tickets')}</p></InfoPopover></dt><dd>{project.counts.filter(c=>project?.statuses.some(s=>s.id===c.statusId&&s.category==='done')).reduce((n,c)=>n+c._count,0)} / {project.counts.reduce((n,c)=>n+c._count,0)}</dd></div>
  <div class="summary-item"><dt><span>{tr('工数（時間）','Time (hours)')}</span><InfoPopover label={tr('工数の説明','Time help')}><p>{tr('実績／見積。各チケットの直接分を合計。','Actual / estimated. Sum of direct entries.')}</p></InfoPopover></dt><dd>{formatHours(project.actualMinutes)} / {formatHours(project.estimatedMinutes)}</dd></div>
  <div class="summary-item"><dt>{tr('公開範囲','Visibility')}</dt><dd>{project.visibility==='private'?tr('参加者限定','Members only'):tr('社内公開','Internal')}</dd></div>
  <div class="summary-item"><dt>{tr('状態','Status')}</dt><dd>{({active:tr('進行中','Active'),on_hold:tr('保留','On hold'),completed:tr('完了','Completed'),archived:tr('アーカイブ','Archived')} as Record<string,string>)[project.status]}</dd></div>
 </dl>
 <section class="overview-description" aria-labelledby="project-description-heading">
  <div class="description-heading"><h2 id="project-description-heading">{tr('説明','Description')}</h2>{#if !editingDescription&&canProject(project,'update',true)}<ActionButton bind:element={descriptionEditButton} class="description-edit" ariaLabel={tr('説明を編集','Edit description')} title={tr('説明を編集','Edit description')} onclick={()=>editingDescription=true}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m14 5 5 5M4 20l5-1L20 8a2.1 2.1 0 0 0-5-5L4 14z"/></svg></ActionButton>{/if}</div>
  {#if editingDescription}<ProjectDescriptionEditor {project} onclose={()=>void closeDescription()} onsaved={updated=>{project=updated;notice=tr('保存しました。','Saved.');void closeDescription();}}/>{:else}<MarkdownBody source={project.description}/>{/if}
 </section>
 {#if project.engagement}<div class="overview-engagement"><span>{tr('関連する案件','Engagement')}</span><a href="/engagements">{project.engagement.code} · {project.engagement.name}</a></div>{/if}
 {:else if tab==='evm'}
 <EvmDashboard {project}/>
 {:else if tab==='members'}
 <ProjectMembers {project} userId={user?.id??null} onchanged={p=>{project=p;notice=tr('参加者を更新しました。','Members updated.');}}/>
 {:else if tab==='settings'}
 {#if canProject(project,'update',true)||canProject(project,'settings.manage',true)}<ProjectSettings {project} {engagements} engagementsAvailable={engagementsAvailable} ondirty={v=>settingsDirty=v} onsaved={p=>{project=p;}}/>{/if}
 {#if canProject(project,'delete',true)}
 <section class="danger-zone" aria-labelledby="project-danger-zone-title">
  <header class="danger-zone-heading"><h2 id="project-danger-zone-title">{tr('デンジャーゾーン','Danger zone')}</h2></header>
  <div class="danger-zone-body">
  <p>{tr('このプロジェクトに所属しているすべての情報が削除されます。','All information belonging to this project will be deleted.')}</p>
  <p>{tr('削除するには、次のプロジェクトIDを正確に入力してください：','To delete this project, enter the following project ID exactly:')} <strong class="project-delete-code">{project.code}</strong></p>
  <div class="delete-project-form"><FormInput label={tr('プロジェクトID','Project ID')} field="delete-project-code" value={deleteProjectCode} disabled={busy} maxlength={64} onValueChange={value=>deleteProjectCode=value}/>
  <ActionButton label={tr('プロジェクトを削除','Delete project')} variant="danger" disabled={busy||settingsDirty||deleteProjectCode!==project.code} onclick={remove}/></div>
  {#if settingsDirty}<p>{tr('削除する前に、設定の変更を保存するか破棄してください。','Save or discard your settings changes before deleting this project.')}</p>{/if}
  </div>
 </section>
 {/if}
 {:else if tab==='history'}
 {#each history as h}<article class="history-entry"><strong>{historyTitle(h.kind,ja)}</strong><small>{h.createdAt.slice(0,19).replace('T',' ')} · {personName(h.actor)}</small>{#if h.ticketId}<button class="history-ticket" onclick={()=>void openTicket({id:h.ticketId} as Ticket)}>{h.ticketCode??tr('削除済みチケット','Deleted ticket')}</button>{/if}<div><ul>{#each historyLines(h.detail,project,ja) as line}<li class="text">{line}</li>{/each}</ul></div></article>{/each}{#if history.length<historyTotal}<ActionButton label={tr('さらに読み込む','Load more')} onclick={()=>void loadHistory(true)}/>{/if}
 {/if}
 </div>{/if}{/if}
</div></AssetManagementShell>
{#if project&&user&&ticketOpen}{#key selected?.id}<TicketModal {project} ticket={selected} {tickets} {relations} employeeId={user.id} {parentId} returnFocus={trigger} onclose={()=>void closeTicket()} onchanged={changed}/>{/key}{/if}
<style>
 .overview-panel.content-card{padding:0;border:0;background:transparent;box-shadow:none}.overview-description .description-heading{min-height:36px;padding-bottom:10px;margin-bottom:12px;border-bottom:1px solid var(--border)}.overview-description .description-heading h2{margin:0}@media(max-width:700px){.overview-description{padding:12px}.overview-description .description-heading{min-height:44px}}
 .description-heading{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px}.description-heading h2{margin:0}:global(.description-edit.app-modal-action){width:36px;min-width:36px;padding:0}.description-heading svg{display:block}@media(max-width:700px){:global(.description-edit.app-modal-action){width:44px;min-width:44px}}
 .overview-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:0}.summary-item{min-width:0;display:grid;align-content:start;gap:6px;padding:12px;background:var(--surface-hover);border:1px solid var(--border);border-radius:var(--sph-radius-4px)}.summary-item dt{display:flex;align-items:center;gap:6px;min-height:28px;font-size:var(--font-size-support);color:var(--muted)}.summary-item dd{font-size:var(--font-size-body);font-weight:600;line-height:1.6;color:var(--text);margin:0}.overview-description{box-sizing:border-box;min-width:0;width:100%;padding:16px;border:1px solid var(--border);border-radius:var(--sph-radius-8px);background:var(--surface);box-shadow:var(--shadow)}.overview-engagement{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap}.overview-engagement>span{font-size:var(--font-size-support);color:var(--muted)}@media(max-width:900px){.overview-summary{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:700px){.overview-summary{gap:8px}.summary-item{padding:10px}.summary-item dt{min-height:44px}}
 .danger-zone{min-width:0;border:1px solid var(--danger);border-radius:var(--sph-radius-8px);background:color-mix(in srgb,var(--danger) 6%,var(--surface))}:global(html[data-theme="dark"]) .danger-zone{background:color-mix(in srgb,var(--danger) 10%,var(--surface))}.danger-zone-heading{padding:16px 20px;border-bottom:1px solid var(--border)}.danger-zone-body{padding:20px;display:grid;gap:16px}.danger-zone h2{color:var(--danger);margin:0}.danger-zone p{margin:0;font-size:var(--font-size-body)}.project-delete-code{color:var(--text);overflow-wrap:anywhere}.delete-project-form{display:flex;align-items:end;flex-wrap:wrap;gap:12px}.delete-project-form>:global(:first-child){width:320px;max-width:100%;min-width:0}@media(max-width:700px){.danger-zone-heading{padding:14px 12px}.danger-zone-body{padding:16px 12px}.delete-project-form>:global(:first-child){width:100%}}
 .project-nav{display:flex;gap:12px;flex-wrap:wrap;background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:0 16px}.project-nav a{padding:12px 8px;min-height:44px;color:var(--muted);font-size:var(--font-size-body);text-decoration:none;border-bottom:2px solid transparent}.project-nav a[aria-current='page']{color:var(--action-primary);border-color:var(--action-primary)}
 .members-panel.content-card,.settings-panel.content-card{padding:0;border:0;background:transparent;box-shadow:none}.workspace{display:grid;gap:16px;min-width:0;max-width:100%}.toolbar{display:flex;align-items:center;gap:12px;flex-wrap:wrap}.toolbar>span{font-size:var(--font-size-body);font-weight:500;overflow-wrap:anywhere}.content-card{min-width:0;border:1px solid var(--border);background:var(--surface);border-radius:var(--sph-radius-8px);box-shadow:var(--shadow);padding:20px;display:grid;gap:16px}h2{font-size:var(--font-size-body);margin:0 0 12px}p,small,dt{font-size:var(--font-size-support);color:var(--muted)}dd{margin:0;overflow-wrap:anywhere}.text{white-space:pre-wrap}.history-entry{border-bottom:1px solid var(--border);padding:12px 0;display:grid;gap:8px}.history-ticket{background:none;border:0;color:var(--action-primary);text-align:left;cursor:pointer}@media(max-width:700px){.content-card{padding:12px}}
</style>

