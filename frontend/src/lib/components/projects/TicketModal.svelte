<script lang="ts">
 import TicketHistory from './TicketHistory.svelte';
 import CustomFieldControl from './CustomFieldControl.svelte';
 import {applies,customPayload,customValueLabel,type CustomValues} from '#lib/project-custom-fields.js';
 import {tick,untrack} from 'svelte';
 import TicketModal from './TicketModal.svelte';
 import TicketChildren from './TicketChildren.svelte';
 import {formatHours,hoursToMinutes,sumMinutes} from '#lib/project-time.js';
 import {beforeNavigate} from '$app/navigation';
 import {localization} from '#lib/localization.js';
 import {canProject,day,personName,projectRequest,projectError,type Project,type Ticket,type TicketDetail,type Relation} from '#lib/projects.js';
 import IconActionButton from '#lib/components/IconActionButton.svelte';
 import DetailActionButtons from '#lib/components/DetailActionButtons.svelte';
 import {initialEditorTab} from '#lib/modal-tabs.js';
 import FormSection from '#lib/components/FormSection.svelte';
 import DetailModal from '#lib/components/DetailModal.svelte';
 import FormInput from '#lib/components/FormInput.svelte';
 import FormTextarea from '#lib/components/FormTextarea.svelte';
 import FormCheckbox from '#lib/components/FormCheckbox.svelte';
 import SearchMultiSelect from '#lib/components/SearchMultiSelect.svelte';
 import SearchSelect from '#lib/components/SearchSelect.svelte';
 import ActionButton from '#lib/components/ActionButton.svelte';
 import DeleteIconButton from '#lib/components/DeleteIconButton.svelte';
 import SortableList from '#lib/components/SortableList.svelte';
 import StatusNotice from '#lib/components/StatusNotice.svelte';
 import DetailTabs from '#lib/components/DetailTabs.svelte';
 import DiscardChangesDialog from '#lib/components/DiscardChangesDialog.svelte';
 import ProjectDate from './ProjectDate.svelte';
 import MarkdownBody from './MarkdownBody.svelte';
 import MarkdownEditor from './MarkdownEditor.svelte';
 let {project,ticket=null,tickets,relations,employeeId,parentId=null,fixedParent=null,oncreated,modalDepth=0,titleId="ticket-modal-title",onclose,onchanged,returnFocus=null}:{project:Project;ticket?:TicketDetail|null;tickets:Ticket[];relations:Relation[];employeeId:number;parentId?:number|null;fixedParent?:Pick<Ticket,'id'|'code'|'title'>|null;oncreated?:(t:TicketDetail)=>Promise<void>;modalDepth?:number;titleId?:string;onclose:()=>void;onchanged:(t:TicketDetail|null)=>Promise<void>;returnFocus?:HTMLElement|null}=$props();
 let childProject=$state<Project|null>(null),childTrigger=$state<HTMLElement|null>(null),openingChild=$state(false),pendingChild=$state<{ticket:Ticket;trigger:HTMLElement|null}|null>(null);
 let childTicket=$state<TicketDetail|null>(null);
 let modalHost=$state<HTMLDivElement>();
 let childReturnScroll:{top:number;left:number}|null=null;
 let modalPrefix=$derived(modalDepth?'ticket-child-'+modalDepth:'ticket');
 const fieldId=(name:string)=>modalDepth?modalPrefix+'-'+name:name;
 let children=$state<TicketChildren>();
 let ja=$derived($localization.displayLanguage==='ja');const tr=(j:string,e:string)=>ja?j:e;
 let current=$state<TicketDetail|null>(untrack(()=>ticket)),editing=$state(!untrack(()=>ticket)),tab=$state('details'),busy=$state(false),error=$state(''),notice=$state(''),discard=$state(false),pendingEdit=$state(false);
 let title=$state(untrack(()=>ticket?.title??'')),description=$state(untrack(()=>ticket?.description??'')),typeId=$state(untrack(()=>String(ticket?.typeId??project.types[0]?.id??''))),statusId=$state(untrack(()=>String(ticket?.statusId??project.typeStatuses.find(l=>l.typeId===project.types[0]?.id&&l.initial)?.statusId??''))),parent=$state(untrack(()=>String(ticket?.parentId??parentId??''))),assignee=$state(untrack(()=>String(ticket?.assigneeId??''))),priority=$state(untrack(()=>ticket?.priority??'normal')),startsOn=$state(untrack(()=>day(ticket?.startsOn))),dueOn=$state(untrack(()=>day(ticket?.dueOn))),estimate=$state(untrack(()=>formatHours(ticket?.estimatedMinutes??0))),labels=$state(untrack(()=>ticket?.labels.join(', ')??'')),position=$state(untrack(()=>String(ticket?.position??0)));
 let custom=$state<CustomValues>(untrack(()=>JSON.parse(JSON.stringify(ticket?.customFields??Object.fromEntries((project.customFields??[]).filter(f=>applies(f,Number(typeId))).map(f=>[f.id,f.defaultValue??null]))))));
 let ticketMentions=$state<string[]>([]);
 let notificationOptions=$derived(project.members.filter(m=>m.canReceiveNotifications&&m.employeeId!==employeeId).map(m=>({value:String(m.employeeId),label:personName(m.employee)+' ('+m.employee.employeeCode+')',searchTerms:[m.employee.firstName+m.employee.lastName,m.employee.lastName+m.employee.firstName]})));
 const form=()=>({customFields:customPayload(project.customFields??[],custom,Number(typeId)),title,description,typeId:Number(typeId),statusId:Number(statusId),parentId:parent?Number(parent):null,assigneeId:assignee?Number(assignee):null,priority,startsOn:startsOn||null,dueOn:dueOn||null,estimatedMinutes:estimateChanged?hoursToMinutes(estimate,100000000):Number(current?.estimatedMinutes??0),position:Number(position),labels:labels.split(',').map(s=>s.trim()).filter(Boolean)});
 let estimateChanged=$state(false);
 let baseline=$state(JSON.stringify(form())),dirty=$derived(editing&&(ticketMentions.length>0||JSON.stringify(form())!==baseline));
 let canEdit=$derived(project.status!=='archived'&&canProject(project,current?'tickets.update':'tickets.create'));
 let choices=$derived(project.typeStatuses.filter(l=>l.typeId===Number(typeId)).sort((a,b)=>a.position-b.position).map(l=>({value:String(l.statusId),label:project.statuses.find(s=>s.id===l.statusId)?.name??''})));
 let note=$state(''),commentId=$state<number|null>(null),mentions=$state<string[]>([]),check=$state(''),workDate=$state(new Date().toISOString().slice(0,10)),minutes=$state('1.00'),timeChanged=$state(false),workNote=$state(''),timeId=$state<number|null>(null),toId=$state(''),kind=$state('finish_start');
 let descriptionUploading=$state(false),commentUploading=$state(false);
 let commentDirty=$derived(mentions.length>0||note!==(commentId?current?.comments.find(c=>c.id===commentId)?.body??'':''));
 let watching=$derived(current?.watchers.some(w=>w.employeeId===employeeId)??false);
 const priorityName=(value:string)=>({low:tr('低','Low'),normal:tr('通常','Normal'),high:tr('高','High'),urgent:tr('緊急','Urgent')} as Record<string,string>)[value]??value;
 const editable=(op:string)=>project.status!=='archived'&&canProject(project,op);
 function typeChange(v:string){typeId=v;if(!current)for(const f of project.customFields??[])if(applies(f,Number(v))&&!Object.hasOwn(custom,String(f.id)))custom[f.id]=f.defaultValue??null;if(!project.typeStatuses.some(l=>l.typeId===Number(v)&&String(l.statusId)===statusId))statusId='';}
 function close(){pendingChild=null;if(busy||descriptionUploading||commentUploading)return;if(dirty||commentDirty){pendingEdit=false;discard=true;}else onclose();}
 function cancelEdit(){pendingChild=null;if(dirty){pendingEdit=true;discard=true;}else editing=false;}
 function reset(t:TicketDetail){ticketMentions=[];custom=JSON.parse(JSON.stringify(t.customFields??{}));title=t.title;description=t.description;typeId=String(t.typeId);statusId=String(t.statusId);parent=String(t.parentId??'');assignee=String(t.assigneeId??'');priority=t.priority;startsOn=day(t.startsOn);dueOn=day(t.dueOn);estimate=formatHours(t.estimatedMinutes);estimateChanged=false;position=String(t.position);labels=t.labels.join(', ');baseline=JSON.stringify(form());}
 beforeNavigate(n=>{if(!childProject&&(dirty||commentDirty)&&!confirm(tr('入力を破棄して移動しますか？','Discard changes and leave?')))n.cancel();});
 async function save(){if(busy||descriptionUploading||commentUploading)return;if(estimateChanged&&hoursToMinutes(estimate,100000000)===null){error=tr('見積工数は0以上の時間を小数点以下2桁までで入力してください。','Enter a non-negative estimate in hours with at most two decimal places.');return;}busy=true;error='';try{const saved=await projectRequest<TicketDetail>(`/v1/projects/${project.id}/tickets`+(current?'/'+current.id:''),current?'PATCH':'POST',{...form(),mentionIds:ticketMentions.map(Number),...(current?{revision:current.revision}:{})});if(!current&&oncreated){ticketMentions=[];baseline=JSON.stringify(form());await oncreated(saved);return;}current=saved;reset(current);editing=false;notice=tr('保存しました。','Saved.');await onchanged(current);}catch(e){error=projectError(e,ja);}finally{busy=false;}}
 async function action(path:string,method:string,data:Record<string,unknown>={}){if(!current||dirty||descriptionUploading||commentUploading)return;busy=true;error='';try{const url=`/v1/projects/${project.id}/tickets/${current.id}`+path;current=await projectRequest<TicketDetail|null>(url+(method==='DELETE'?`?revision=${current.revision}`:''),method,method==='DELETE'?undefined:{...data,revision:current.revision});if(current)reset(current);await onchanged(current);notice=tr('更新しました。','Updated.');if(!current)onclose();}catch(e){error=projectError(e,ja);}finally{busy=false;}}
 async function upload(file:File|undefined){if(!file||!current||dirty)return;busy=true;error='';try{const f=new FormData();f.set('file',file);current=await projectRequest<TicketDetail>(`/v1/projects/${project.id}/tickets/${current.id}/attachments?revision=${current.revision}`,'POST',f);await onchanged(current);notice=tr('添付しました。','Attached.');}catch(e){error=projectError(e,ja);}finally{busy=false;}}
 async function reorderChecklist(ids:number[]){for(const [position,id] of ids.entries()){await action('/checklists/'+id,'PATCH',{position});if(error)break;}}
 function rememberChildScroll(){const body=modalHost?.querySelector<HTMLElement>('.app-detail-body');childReturnScroll=body?{top:body.scrollTop,left:body.scrollLeft}:null;}
 async function addChild(trigger:HTMLElement){if(!current||openingChild||busy||descriptionUploading||commentUploading)return;rememberChildScroll();openingChild=true;error='';try{const fresh=await projectRequest<Project>(`/v1/projects/${project.id}`);if(fresh.status==='archived'||!canProject(fresh,'tickets.create'))throw Error(tr('子チケットを追加する権限がありません。','You cannot add child tickets.'));childTrigger=trigger;childTicket=null;childProject=fresh;}catch(e){error=projectError(e,ja);}finally{openingChild=false;}}
 function restoreChildFocus(){const target=childTrigger?.isConnected&&childTrigger.getAttribute('aria-disabled')!=='true'?childTrigger:modalHost?.querySelector<HTMLElement>('[data-page-tab="children"]');target?.focus({preventScroll:true});}
 async function closeChild(){
  openingChild=true;childProject=null;childTicket=null;await tick();
  await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
  const body=modalHost?.querySelector<HTMLElement>('.app-detail-body');
  if(body&&childReturnScroll){body.scrollTop=childReturnScroll.top;body.scrollLeft=childReturnScroll.left;}
  openingChild=false;await tick();restoreChildFocus();
 }
 async function childCreated(saved:TicketDetail){await closeChild();notice=tr('子チケットを追加しました：','Child ticket added: ')+saved.code;busy=true;try{if(current){current=await projectRequest<TicketDetail>(`/v1/projects/${project.id}/tickets/${current.id}`);await onchanged(current);await children?.refresh();}}catch(e){error=tr('追加は完了しましたが、表示の更新に失敗しました。再読み込みしてください。','The child ticket was created, but refreshing failed. Reload this view.');}finally{busy=false;}}
 async function openChild(ticket:Ticket,trigger:HTMLElement|null){
  if(!current||busy||openingChild||descriptionUploading||commentUploading)return;
  if(dirty||commentDirty){pendingChild={ticket,trigger};pendingEdit=false;discard=true;return;}
  rememberChildScroll();openingChild=true;error='';
  try{
   const [fresh,detail]=await Promise.all([projectRequest<Project>(`/v1/projects/${project.id}`),projectRequest<TicketDetail>(`/v1/projects/${project.id}/tickets/${ticket.id}`)]);
   childTrigger=trigger;childTicket=detail;childProject=fresh;
  }catch(e){error=projectError(e,ja);}finally{openingChild=false;}
 }
 async function childUpdated(updated:TicketDetail|null){
  childTicket=updated;
  busy=true;
  try{
   if(!updated)await closeChild();
   if(current){
    current=await projectRequest<TicketDetail>(`/v1/projects/${project.id}/tickets/${current.id}`);
    await onchanged(current);await children?.refresh();
   }
  }finally{busy=false;if(!updated){await tick();restoreChildFocus();}}
 }
 async function discardChanges(){discard=false;if(pendingChild){const target=pendingChild;pendingChild=null;mentions=[];note=commentId?current?.comments.find(c=>c.id===commentId)?.body??'':'';if(current)reset(current);editing=false;await openChild(target.ticket,target.trigger);}else if(pendingEdit&&current){reset(current);editing=false;}else onclose();}
 const stateName=(id:number)=>project.statuses.find(s=>s.id===id)?.name??'';
</script>
{#snippet watchAction()}
 <IconActionButton class={'ticket-watch-toggle'+(watching?' watching':'')} data-watch-toggle data-watch-action={watching?'stop':'start'} aria-pressed={watching} aria-label={watching?tr('ウォッチをやめる','Stop watching'):tr('ウォッチする','Watch ticket')} title={watching?tr('ウォッチをやめる','Stop watching'):tr('ウォッチする','Watch ticket')} disabled={busy||editing||dirty||!editable('tickets.update')} onclick={()=>void action('/watchers','PUT',{watching:!watching})}>
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m11.5 3 3 6.1 6.7 1-4.8 4.7 1.1 6.6-6-3.1-6 3.1 1.2-6.6-4.9-4.7 6.7-1Z" fill={watching?'currentColor':'none'}/><circle cx="19" cy="5" r="4.5" fill="var(--surface)" stroke="none"/><path d="M16.5 5h5"/>{#if !watching}<path d="M19 2.5v5"/>{/if}</svg>
 </IconActionButton>
 {#if !editing}<DetailActionButtons editLabel={tr('編集','Edit')} deleteLabel={tr('削除','Delete')} disabled={busy||dirty} onEdit={canEdit?()=>{initialEditorTab();if(current)reset(current);editing=true;}:undefined} onDelete={editable('tickets.delete')?()=>{if(confirm(tr('このチケットを削除しますか？','Delete this ticket?')))void action('','DELETE');}:undefined}/>{/if}
{/snippet}
{#snippet customDetails(inactive:boolean)}{#if current}<dl class="app-detail-grid">{#each (project.customFields??[]).filter(f=>applies(f,current!.typeId)!==inactive&&(inactive?Object.hasOwn(current!.customFields??{},String(f.id)):true)) as f}<div><dt>{f.name}</dt><dd>{customValueLabel(f,current.customFields?.[f.id],ja)}</dd></div>{/each}</dl>{/if}{/snippet}
{#snippet overviewContent()}{#if current}
 {#if (project.customFields??[]).length}<section class="app-detail-section" data-ticket-card="custom-fields"><h3>{tr('カスタム項目','Custom fields')}</h3>{@render customDetails(false)}{#if (project.customFields??[]).some(f=>!applies(f,current!.typeId)&&Object.hasOwn(current!.customFields??{},String(f.id)))}<details><summary>{tr('適用外・無効な項目','Inapplicable and inactive fields')}</summary>{@render customDetails(true)}</details>{/if}</section>{/if}
 <section class="app-detail-section" data-ticket-card="basic"><h3>{tr('基本情報','Basic information')}</h3><dl class="app-detail-grid">
 <div><dt>{tr('種別','Type')}</dt><dd>{project.types.find(t=>t.id===current?.typeId)?.name??''}</dd></div>
 <div><dt>{tr('状態','Status')}</dt><dd><span class="ticket-status">{stateName(current.statusId)}</span></dd></div>
 <div><dt>{tr('優先度','Priority')}</dt><dd>{priorityName(current.priority)}</dd></div>
 <div class="app-detail-wide"><dt>{tr('担当者','Assignee')}</dt><dd>{project.members.find(m=>m.employeeId===current?.assigneeId)?.employee?personName(project.members.find(m=>m.employeeId===current?.assigneeId)!.employee):''}</dd></div>
 </dl></section>
 <section class="app-detail-section" data-ticket-card="dates"><h3>{tr('日程・工数','Dates and time')}</h3><dl class="app-detail-grid">
 <div><dt>{tr('開始日','Start date')}</dt><dd>{day(current.startsOn)||''}</dd></div><div><dt>{tr('期限','Due date')}</dt><dd>{day(current.dueOn)||''}</dd></div>
 <div><dt>{tr('見積工数','Estimated time')}</dt><dd>{formatHours(current.estimatedMinutes)} {tr('時間','hours')}</dd></div><div><dt>{tr('実績工数','Actual time')}</dt><dd>{formatHours(sumMinutes(current.timeEntries.map(entry=>entry.minutes)))} {tr('時間','hours')}</dd></div>
 </dl></section>
 <section class="app-detail-section" data-ticket-card="description"><h3>{tr('説明・ラベル','Description and labels')}</h3><MarkdownBody source={current.description}/><div class="ticket-labels" aria-label={tr('ラベル','Labels')}>{#each current.labels as label}<span>{label}</span>{/each}</div></section>
{/if}{/snippet}
{#snippet childrenContent()}{#if current}
 <TicketChildren bind:this={children} {project} parentId={current.id} canCreate={editable('tickets.create')} disabled={busy||openingChild||descriptionUploading||commentUploading} onadd={trigger=>void addChild(trigger)} onopen={(ticket,trigger)=>void openChild(ticket,trigger)}/>
{/if}{/snippet}
{#snippet commentsContent()}{#if current}
 {#each current.comments as c}<article class="app-detail-section activity-card"><strong>{personName(c.author)}</strong> <small>{c.createdAt.slice(0,10)}</small><MarkdownBody source={c.body}/>{#if editable('comments.manage')&&(c.authorId===employeeId||project.role==='manager')}<div class="actions"><ActionButton label={tr('編集','Edit')} disabled={busy} onclick={()=>{commentId=c.id;note=c.body;mentions=[];}}/><DeleteIconButton label={tr('削除','Delete')} disabled={busy} onclick={()=>{if(confirm(tr('コメントを削除しますか？','Delete this comment?')))void action('/comments/'+c.id,'DELETE');}}/></div>{/if}</article>{/each}
 {#if editable('comments.manage')}<MarkdownEditor label={commentId?tr('コメントを編集','Edit comment'):tr('コメント','Comment')} field={fieldId("ticket-comment")} imageContext={{target:'comment',project:project.code,ticket:current.code,...(commentId?{comment:commentId}:{})}} onUploadState={v=>commentUploading=v} disabled={busy} value={note} maxlength={20000} onValueChange={v=>note=v}/>
 <SearchMultiSelect label={tr('お知らせしたいユーザー','Users to notify')} field={fieldId('comment-notify-users')} values={mentions} options={notificationOptions} disabled={busy} placeholder={tr('ユーザーを選択','Select users')} onChange={v=>mentions=v}/>
 <div class="actions"><ActionButton label={tr('送信','Send')} variant="primary" disabled={busy||commentUploading||!note.trim()} onclick={async()=>{await action('/comments'+(commentId?'/'+commentId:''),commentId?'PATCH':'POST',{body:note,mentionIds:mentions.map(Number)});if(!error){note='';commentId=null;mentions=[];}}}/>{#if commentId}<ActionButton label={tr('取消','Cancel')} onclick={()=>{note='';commentId=null;mentions=[];}}/>{/if}</div>{/if}
{/if}{/snippet}
{#snippet checklistsContent()}{#if current}
 <section class="app-detail-section"><h3>{tr('チェック項目','Checklist items')}</h3>
 <SortableList ids={current.checklists.map(c=>c.id)} label={tr('チェックリストの順番を変更','Reorder checklist')} labelFor={id=>current?.checklists.find(c=>c.id===id)?.text??''} disabled={busy||!editable('tickets.update')} onreorder={ids=>void reorderChecklist(ids)}>{#snippet children(id:number)}{@const c=current!.checklists.find(c=>c.id===id)!}<div class="check-row"><FormCheckbox label={c.text} field={fieldId('check-'+c.id)} checked={c.completed} disabled={busy||!editable('tickets.update')} onChange={v=>void action('/checklists/'+c.id,'PATCH',{completed:v})}/>{#if editable('tickets.update')}<DeleteIconButton label={tr('削除','Delete')} disabled={busy} onclick={()=>void action('/checklists/'+c.id,'DELETE')}/>{/if}</div>{/snippet}</SortableList>
 </section>
 {#if editable('tickets.update')}<FormInput label={tr('項目','Item')} field={fieldId("check-text")} disabled={busy} value={check} maxlength={500} onValueChange={v=>check=v}/><ActionButton label={tr('追加','Add')} disabled={busy||!check.trim()} onclick={async()=>{await action('/checklists','POST',{text:check,position:current?.checklists.length??0});if(!error)check='';}}/>{/if}
{/if}{/snippet}
{#snippet timeContent()}{#if current}
 <p>{tr('実績合計','Total actual')}: {formatHours(sumMinutes(current.timeEntries.map(entry=>entry.minutes)))} {tr('時間','hours')}</p>
 {#each current.timeEntries as entry}<article class="app-detail-section activity-card"><strong>{day(entry.workDate)} · {formatHours(entry.minutes)} {tr('時間','hours')}</strong><p>{personName(entry.employee)}</p><p class="text">{entry.note}</p>{#if editable('time.manage')&&(entry.employeeId===employeeId||project.role==='manager')}<div class="actions"><ActionButton label={tr('編集','Edit')} disabled={busy} onclick={()=>{timeId=entry.id;workDate=day(entry.workDate);minutes=formatHours(entry.minutes);timeChanged=false;workNote=entry.note;}}/><DeleteIconButton label={tr('削除','Delete')} disabled={busy} onclick={()=>{if(confirm(tr('工数を削除しますか？','Delete time entry?')))void action('/time-entries/'+entry.id,'DELETE');}}/></div>{/if}</article>{/each}
 {#if editable('time.manage')}<div class="grid"><ProjectDate label={tr('作業日','Work date')} field={fieldId("work-date")} value={workDate} onchange={v=>workDate=v}/><FormInput label={tr('作業時間（時間）','Time (hours)')} field={fieldId("work-hours")} disabled={busy} type="number" min="0.01" max="24" step="0.01" value={minutes} onValueChange={v=>{minutes=v;timeChanged=true;}} onCommit={()=>{const v=hoursToMinutes(minutes,1440,false);if(v!==null)minutes=formatHours(v);}}/></div><FormTextarea label={tr('作業内容','Work notes')} field={fieldId("work-note")} disabled={busy} value={workNote} maxlength={2000} onValueChange={v=>workNote=v}/><div class="actions"><ActionButton label={timeId?tr('更新','Update'):tr('工数を記録','Log time')} variant="primary" disabled={busy||(timeChanged||!timeId?hoursToMinutes(minutes,1440,false)===null:false)||!workDate} onclick={async()=>{await action('/time-entries'+(timeId?'/'+timeId:''),timeId?'PATCH':'POST',{workDate,minutes:timeId&&!timeChanged?current?.timeEntries.find(entry=>entry.id===timeId)?.minutes:hoursToMinutes(minutes,1440,false),note:workNote});if(!error){timeId=null;workNote='';timeChanged=false;minutes='1.00';}}}/>{#if timeId}<ActionButton label={tr('取消','Cancel')} onclick={()=>{timeId=null;workNote='';timeChanged=false;minutes='1.00';}}/>{/if}</div>{/if}
{/if}{/snippet}
{#snippet filesContent()}{#if current}
 <p>{tr('画像・PDF・Office（docx/xlsx/pptx）・テキスト・ZIP。1件10MiB、20件・合計50MiBまで。','Images, PDF, Office (docx/xlsx/pptx), text and ZIP. Up to 10MiB each, 20 files and 50MiB total.')}</p>
 <section class="app-detail-section"><h3>{tr('添付ファイル','Attachments')}</h3>
 {#each current.attachments as f}<div class="check-row"><a href={`/v1/projects/${project.code}/tickets/${current.code}/attachments/${f.id}`} download>{f.name}</a><small>{(f.size/1024).toFixed(1)} KiB</small>{#if editable('attachments.manage')}<DeleteIconButton label={tr('削除','Delete')} disabled={busy} onclick={()=>{if(confirm(tr('添付を削除しますか？','Delete attachment?')))void action('/attachments/'+f.id,'DELETE');}}/>{/if}</div>{/each}
 </section>
 {#if editable('attachments.manage')}<label class="file-label">{tr('ファイルを添付','Attach file')}<input type="file" accept=".png,.jpg,.jpeg,.webp,.pdf,.docx,.xlsx,.pptx,.txt,.csv,.md,.zip" disabled={busy} onchange={e=>{void upload(e.currentTarget.files?.[0]);e.currentTarget.value='';}}/></label>{/if}
{/if}{/snippet}
{#snippet relationsContent()}{#if current}
 {#each relations.filter(r=>r.fromId===current?.id||r.toId===current?.id) as r}<article class="app-detail-section activity-card"><p>{r.fromCode??''}{#if r.fromCode&&r.toCode} → {/if}{r.toCode??''} · {r.kind}</p>{#if editable('tickets.update')&&r.fromId===current.id}<DeleteIconButton label={tr('関連を解除','Remove relation')} disabled={busy} onclick={()=>void action('/relations/'+r.id,'DELETE')}/>{/if}</article>{/each}
 {#if editable('tickets.update')}<SearchSelect label={tr('関連先','Related ticket')} field={fieldId("relation-target")} disabled={busy} value={toId} options={tickets.filter(t=>t.id!==current?.id).map(t=>({value:String(t.id),label:`${t.code} ${t.title}`}))} onSelect={v=>toId=v}/><SearchSelect label={tr('関係','Relation')} field={fieldId("relation-kind")} disabled={busy||!toId} value={kind} options={[{value:'finish_start',label:tr('終了→開始','Finish → start')},{value:'blocks',label:tr('ブロックする','Blocks')},{value:'relates',label:tr('関連する','Relates to')},{value:'duplicates',label:tr('重複する','Duplicates')}]} searchable={false} onSelect={v=>kind=v}/><ActionButton label={tr('関連を追加','Add relation')} disabled={busy||!toId} onclick={()=>void action('/relations','POST',{toId:Number(toId),kind})}/>{/if}
{/if}{/snippet}
{#snippet historyContent()}{#if current}<TicketHistory {project} ticketId={current.id} revision={current.revision} active={tab==='history'&&!editing}/>{/if}{/snippet}
{#snippet labelsHelp()}<p>{tr('カンマで区切って複数のラベルを入力できます（最大20件、各64文字）。','Separate labels with commas (up to 20 labels, 64 characters each).')}</p>{/snippet}
{#snippet estimateHelp()}<p>{tr('このチケット単体の見積工数を時間で入力します（小数点以下2桁）。子チケットの見積工数は含めません。','Enter this ticket’s own estimate in hours (two decimal places), excluding child tickets.')}</p>{/snippet}
{#snippet orderHelp()}<p>{tr('同じ階層内の表示順です。0以上の整数で指定します。','The display order within the same hierarchy level. Enter a non-negative whole number.')}</p>{/snippet}
<div bind:this={modalHost} hidden={!!childProject} inert={!!childProject}>
<DetailModal dialogClass="ticket-detail-modal" title={current?`${current.code} · ${current.title}`:fixedParent?tr('子チケットを追加','Add child ticket'):tr('チケットを追加','Add ticket')} pretitle={current?'':project.code+' · '+project.name} {titleId} closeLabel={tr('閉じる','Close')} {returnFocus} headerActions={current?watchAction:undefined} onClose={close}>
 {#if error}<StatusNotice message={error} tone="error" onDismiss={()=>error=''}/>{/if}{#if notice}<StatusNotice message={notice} tone="success" onDismiss={()=>notice=''}/>{/if}
 {#if editing}
 <div class="fields">
<FormSection title={tr('基本情報','Basic information')} framed columns={2}>
<FormInput label={tr('件名','Title')} field={fieldId("ticket-title")} value={title} placeholder={tr('例：ログイン画面を実装する','e.g. Implement the login screen')} required maxlength={255} disabled={busy} onValueChange={v=>title=v}/>
<SearchSelect label={tr('優先度','Priority')} field={fieldId("ticket-priority")} value={priority} options={['low','normal','high','urgent'].map((v,i)=>({value:v,label:[tr('低','Low'),tr('通常','Normal'),tr('高','High'),tr('緊急','Urgent')][i]}))} onSelect={v=>priority=v} searchable={false} disabled={busy}/>
<SearchSelect label={tr('種別','Type')} field={fieldId("ticket-type")} value={typeId} options={project.types.map(t=>({value:String(t.id),label:t.name}))} onSelect={typeChange} disabled={busy} required/>
<SearchSelect label={tr('状態','Status')} field={fieldId("ticket-status")} value={statusId} options={choices} onSelect={v=>statusId=v} disabled={busy} required/>
<SearchSelect label={tr('担当者','Assignee')} field={fieldId("ticket-assignee")} value={assignee} options={[{value:'',label:tr('未割当','Unassigned')},...project.members.filter(m=>m.role!=='viewer').map(m=>({value:String(m.employeeId),label:personName(m.employee)}))]} onSelect={v=>assignee=v} disabled={busy}/>
{#if fixedParent}<FormInput label={tr('親チケット','Parent ticket')} field={fieldId("ticket-parent")} value={`${fixedParent.code} · ${fixedParent.title}`} disabled onValueChange={()=>{}}/>{:else}<SearchSelect label={tr('親チケット','Parent ticket')} field={fieldId("ticket-parent")} value={parent} options={[{value:'',label:tr('なし','None')},...tickets.filter(t=>t.id!==current?.id).map(t=>({value:String(t.id),label:`${t.code} ${t.title}`}))]} onSelect={v=>parent=v} disabled={busy}/>{/if}
</FormSection>
<FormSection title={tr('日程・工数','Dates and time')} framed columns={2}>
<ProjectDate label={tr('開始日','Start date')} field={fieldId("ticket-start")} value={startsOn} onchange={v=>startsOn=v} disabled={busy}/>
<ProjectDate label={tr('期限','Due date')} field={fieldId("ticket-due")} value={dueOn} onchange={v=>dueOn=v} disabled={busy}/>
<FormInput label={tr('見積工数（時間）','Estimate (hours)')} field={fieldId("ticket-estimate")} type="number" min="0" max="1666666.66" step="0.01" value={estimate} placeholder={tr('例：1.25','e.g. 1.25')} help={estimateHelp} onValueChange={v=>{estimate=v;estimateChanged=true;}} onCommit={()=>{const v=hoursToMinutes(estimate,100000000);if(v!==null)estimate=formatHours(v);}} disabled={busy}/>
<FormInput label={tr('表示順','Order')} field={fieldId("ticket-position")} type="number" min="0" value={position} placeholder={tr('例：0','e.g. 0')} help={orderHelp} onValueChange={v=>position=v} disabled={busy}/>
</FormSection>
{#if (project.customFields??[]).some(f=>applies(f,Number(typeId)))}<FormSection title={tr('カスタム項目','Custom fields')} framed columns={2}>
{#each (project.customFields??[]).filter(f=>applies(f,Number(typeId))) as f}<CustomFieldControl prefix={modalDepth?modalPrefix+'-custom':'custom'} definition={f} value={custom[f.id]??null} disabled={busy} onchange={v=>custom[f.id]=v}/>{/each}
</FormSection>{/if}
<FormSection title={tr('説明・ラベル','Description and labels')} framed columns={2}>
<div class="field-wide"><MarkdownEditor label={tr('説明','Description')} field={fieldId("ticket-description")} imageContext={{target:'ticket',project:project.code,...(current?{ticket:current.code}:{})}} onUploadState={v=>descriptionUploading=v} value={description} placeholder={tr('例：メールアドレスとパスワードでログインできる画面を作成します。','e.g. Create a screen for signing in with an email address and password.')} maxlength={20000} disabled={busy} onValueChange={v=>description=v}/></div>
<div class="field-wide"><SearchMultiSelect label={tr('お知らせしたいユーザー','Users to notify')} field={fieldId('ticket-notify-users')} values={ticketMentions} options={notificationOptions} disabled={busy} placeholder={tr('ユーザーを選択','Select users')} onChange={v=>ticketMentions=v}/></div>
<FormInput label={tr('ラベル','Labels')} field={fieldId("ticket-labels")} value={labels} placeholder={tr('例：開発, 改善','e.g. development, improvement')} help={labelsHelp} onValueChange={v=>labels=v} disabled={busy}/>
</FormSection>
 </div>
 {:else if current}<DetailTabs idPrefix={modalPrefix} label={tr('チケット','Ticket')} bind:active={tab} tabs={[{id:'details',label:tr('概要','Overview'),content:overviewContent},{id:'children',label:tr('子チケット','Child tickets'),content:childrenContent},{id:'comments',label:tr('コメント','Comments'),content:commentsContent,count:current.comments.length},{id:'checklists',label:tr('チェックリスト','Checklist'),content:checklistsContent},{id:'time',label:tr('工数','Time'),content:timeContent},{id:'files',label:tr('添付','Files'),content:filesContent},{id:'relations',label:tr('関連','Relations'),content:relationsContent},{id:'history',label:tr('履歴','History'),content:historyContent}]} />{/if}
 {#snippet actions()}
 {#if editing}<ActionButton label={tr('キャンセル','Cancel')} disabled={busy} onclick={()=>{if(current)cancelEdit();else close();}}/><ActionButton label={tr('保存','Save')} variant="primary" disabled={busy||descriptionUploading||!canEdit||!title.trim()||!statusId} onclick={save}/>
 {:else}<ActionButton label={tr('閉じる','Close')} disabled={busy} onclick={close}/>{/if}
 {/snippet}
</DetailModal>
</div>
{#if childProject&&current}
 {#if childTicket}<TicketModal project={childProject} ticket={childTicket} {tickets} {relations} {employeeId} modalDepth={modalDepth+1} titleId={'ticket-child-'+(modalDepth+1)+'-title'} returnFocus={childTrigger} onclose={()=>void closeChild()} onchanged={childUpdated}/>
 {:else}<TicketModal project={childProject} tickets={[]} relations={[]} {employeeId} {modalDepth} parentId={current.id} fixedParent={current} titleId={modalDepth?modalPrefix+'-creation-title':'ticket-child-modal-title'} returnFocus={childTrigger} onclose={()=>void closeChild()} onchanged={async()=>{}} oncreated={childCreated}/>{/if}
{/if}
{#if discard}<DiscardChangesDialog onContinue={()=>{discard=false;pendingChild=null;}} onDiscard={()=>void discardChanges()}/>{/if}
<style>
 @media(max-width:700px),(min-width:701px) and (max-width:1024px) and (max-height:500px) and (any-pointer:coarse){:global(.ticket-detail-modal .app-detail-header-actions button){min-width:44px;min-height:44px}}
 .field-wide{grid-column:1/-1;min-width:0}.ticket-labels{display:flex;flex-wrap:wrap;gap:6px;margin-top:16px}.ticket-labels span{padding:3px 10px;background:var(--surface-hover);border:1px solid var(--border);border-radius:999px;font-size:var(--font-size-support);color:var(--text-secondary)}.ticket-status{display:inline-block;padding:2px 8px;border-radius:4px;background:color-mix(in srgb,var(--action-primary) 10%,var(--surface));color:var(--action-primary)}:global(.ticket-watch-toggle.watching){color:var(--action-primary);background:color-mix(in srgb,var(--action-primary) 12%,var(--surface))}.activity-card{background:var(--surface)}

 .fields{display:grid;gap:16px;min-width:0}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.text{white-space:pre-wrap;overflow-wrap:anywhere}.actions,.check-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}article p{margin:8px 0}.check-row{justify-content:space-between}.file-label{display:grid;gap:8px}small{color:var(--muted)}@media(max-width:700px){.grid{grid-template-columns:1fr}}
</style>
