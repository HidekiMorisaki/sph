<script lang="ts">
 import {notificationTargetRequest,confirmNotificationView} from '$lib/notification-view';
 import IconActionButton from '$lib/components/IconActionButton.svelte';
 import MenuItemIcon from '$lib/components/MenuItemIcon.svelte';
 import ActionButton from '$lib/components/ActionButton.svelte';
 import MasterList from '$lib/components/MasterList.svelte';
 import SearchPanel from '$lib/components/SearchPanel.svelte';
 import ViewportListPage from '$lib/components/ViewportListPage.svelte';
 import WorkflowSearchFilters from '$lib/components/workflow/WorkflowSearchFilters.svelte';
 import {initialSearch,type SearchContext} from '$lib/search';
 import TextActionButton from '$lib/components/TextActionButton.svelte';
 import {onMount,tick,untrack} from 'svelte';
 import {page} from '$app/state';
 import {beforeNavigate,goto} from '$app/navigation';
 import {readSessionUser} from '$lib/client-session';
 import {canOperate,type SessionUser} from '$lib/auth';
 import {localization} from '$lib/localization';
 import {defaults,normalize,attachmentKeys,isContainer,isRepeat,fieldsOf,type Field,type Values,type Directory,type WorkflowRoute} from '$lib/workflow-form';
 import {choose,workflowApi,WorkflowError,workflowError,stateName,emptyDirectory,type Template,type RequestDetail,type ListItem,type Attachment} from '$lib/workflow-client';
 import Control from '$lib/components/workflow/WorkflowControl.svelte';
 import MasterPageHeader from '$lib/components/MasterPageHeader.svelte';
 import AddButton from '$lib/components/AddButton.svelte';
 import StatusNotice from '$lib/components/StatusNotice.svelte';
 import DetailModal from '$lib/components/DetailModal.svelte';
 import ModalActionButton from '$lib/components/ModalActionButton.svelte';
 import {COMPACT_CONTENT_QUERY} from '$lib/responsive-layout';
 import '$lib/styles/workflow.css';
 import AssetManagementShell from '$lib/components/AssetManagementShell.svelte';
 import DiscardChangesDialog from '$lib/components/DiscardChangesDialog.svelte';
 import WorkflowFields from '$lib/components/workflow/WorkflowFields.svelte';
 let user=$state<SessionUser|null>(null),ja=$derived($localization.displayLanguage==='ja'),ready=$state(false),loading=$state(true),busy=$state(false),error=$state(''),notice=$state(''),templates=$state<Template[]>([]),directory=$state<Directory>(emptyDirectory),selected=$state<RequestDetail|null>(null),creating=$state(false),templateId=$state(''),values=$state<Values>({}),title=$state(''),currency=$state('JPY'),baseline=$state(''),attempt=$state(0),message=$state(''),decision=$state('approved'),errors=$state<Record<string,string>>({}),discard=$state(false),pendingClose=$state(false),pendingUrl=$state(''),previewUrl=$state(''),previewName=$state(''),imageDialog=$state<HTMLDialogElement>(),reassignment=$state(false),position=$state(''),replacement=$state(''),replacementReason=$state(''),approvers=$state<{id:number;name:string}[]>([]);
 let searchState=$state(initialSearch('workflows')),searchOptions=$state<Record<string,string|boolean>>({}),searchContexts=$state<SearchContext[]>([]);
 let requestList=$state<MasterList>();let searchPanel=$state<SearchPanel>();
 let newRequestTrigger=$state<HTMLButtonElement>();
 let newVersionId=$state<number|null>(null),discardApproved=$state(false);
 const pendingFiles=new Map<string,File>();
 let transfers=$state(0),routeVisible=$state(false);
 let requestTrigger:HTMLElement|null=null;let requestTriggerKey='';function listHeading(){const heading=document.querySelector<HTMLElement>('.request-list h2');heading?.setAttribute('tabindex','-1');return heading;}
 let deleteTarget=$state<{requestKey:string;title:string;revision:number}|null>(null),deleteError=$state('');let deleteTrigger:HTMLElement|null=null;
 let jaText=$derived(ja?'ワークフロー':'Workflows');
 const t=(a:string,b:string)=>choose(ja,a,b);
 const base='/v1/workflow-requests';
 const draftString=()=>JSON.stringify({values,title,currency});
 let dirty=$derived(!discardApproved&&!!selected&&selected.isApplicant&&['draft','returned'].includes(selected.status)&&(newVersionId!==null||pendingFiles.size>0||draftString()!==baseline));
 let editable=$derived(!!selected&&selected.isApplicant&&['draft','returned'].includes(selected.status)&&attempt===0);
 let snapshot=$derived(attempt?selected?.submissions.find(s=>s.attempt===attempt)?.snapshot:null);
 let definition=$derived(snapshot?.definition??selected?.templateVersion.definition);
 let shownValues=$derived(snapshot?.values??values);
 let result=$derived.by(()=>{try{if(!editable)return {values:shownValues,errors:{}};return definition?normalize(definition,shownValues,snapshot?.currency??currency,false):{values:{},errors:{}};}catch{return {values:shownValues,errors:{}};}});
 let currentStep=$derived(selected?.steps.find(s=>s.attempt===selected?.attempt&&s.position===selected?.currentStep));
 function stamp(v:string){return new Intl.DateTimeFormat(ja?'ja':'en',{dateStyle:'medium',timeStyle:'short',timeZone:$localization.timeZone}).format(new Date(v));}
 function problem(e:unknown){error=workflowError(e instanceof WorkflowError?e.code:'FAILED',ja);if(e instanceof WorkflowError&&e.details.length)errors=Object.fromEntries(e.details.filter(d=>d.field).map(d=>[d.field!,d.reason]));}
 async function loadList(){await requestList?.refresh();await searchPanel?.refreshDefinitions();}
 async function open(requestKey:string,trigger?:HTMLElement,keepBusy=false){
  if(trigger){requestTrigger=trigger;requestTriggerKey=requestKey;}
  error='';notice='';errors={};busy=true;try{const item=await workflowApi<RequestDetail>(base+'/'+requestKey);if(selected?.requestKey!==item.requestKey)routeVisible=false;selected=item;newVersionId=null;discardApproved=false;pendingFiles.clear();values=['draft','returned'].includes(item.status)&&item.isApplicant?{...defaults(item.templateVersion.definition.fields),...structuredClone(item.values)}:structuredClone(item.values);title=item.title;currency=item.currency;attempt=0;message='';baseline=draftString();creating=false;
   const actionKey=page.url.searchParams.get('action');if(actionKey){await tick();document.getElementById('action-'+actionKey)?.scrollIntoView({block:'center'});document.getElementById('action-'+actionKey)?.focus();}
  }catch(e){problem(e);}finally{if(!keepBusy)busy=false;}
 }
 async function reload(){const wasBusy=busy;busy=true;try{if(selected)await open(selected.requestKey,undefined,true);await loadList();}finally{busy=wasBusy;}}
 async function finishClose(){
  selected=null;newVersionId=null;pendingFiles.clear();discardApproved=false;closeImage();error='';notice='';errors={};reassignment=false;
  const url=new URL(page.url);url.searchParams.delete('request');url.searchParams.delete('action');seenUrl='';
  if(url.href!==page.url.href)await goto(url.pathname+url.search+url.hash,{replaceState:true,keepFocus:true,noScroll:true});
  await tick();
  const target=requestTrigger?.isConnected?requestTrigger:requestTriggerKey?[...document.querySelectorAll<HTMLButtonElement>('[data-request-key]')].find(e=>e.dataset.requestKey===requestTriggerKey):undefined;
  (target??listHeading())?.focus({preventScroll:true});requestTrigger=null;requestTriggerKey='';
 }
 function close(){if(busy||transfers||deleteTarget)return;if(dirty){discard=true;pendingClose=true;}else void finishClose();}
 function confirmDelete(item:{requestKey:string;title:string;revision:number},trigger:HTMLElement){if(busy||transfers)return;deleteTrigger=trigger;deleteError='';deleteTarget={requestKey:item.requestKey,title:item.title,revision:item.revision};}
 function cancelDelete(){if(busy)return;deleteTarget=null;deleteError='';void tick().then(()=>deleteTrigger?.focus({preventScroll:true}));}
 async function removeDraft(){
  if(!deleteTarget)return;busy=true;deleteError='';
  try{const key=deleteTarget.requestKey;await workflowApi(base+'/'+key,'DELETE',{revision:deleteTarget.revision});deleteTarget=null;
   if(selected?.requestKey===key){baseline=draftString();await finishClose();}
   await loadList();notice=t('下書きを削除しました。','Draft deleted.');await tick();(deleteTrigger?.isConnected?deleteTrigger:listHeading())?.focus({preventScroll:true});
  }catch(e){deleteError=workflowError(e instanceof WorkflowError?e.code:'FAILED',ja);}finally{busy=false;}
 }
 async function create(){
  requestTrigger=newRequestTrigger??null;requestTriggerKey='';error='';notice='';errors={};
  const template=templates.find(t=>String(t.versionId)===templateId);if(!template?.versionId||!user)return;
  pendingFiles.clear();newVersionId=template.versionId;discardApproved=false;routeVisible=false;
  selected={id:0,requestKey:'',applicantId:user.id,title:template.name,currency:'JPY',values:{},status:'draft',revision:0,attempt:0,currentStep:0,isApplicant:true,canManage:false,templateVersion:{name:template.name,definition:structuredClone($state.snapshot(template.definition)),route:structuredClone($state.snapshot(template.route))},steps:[],actions:[],submissions:[],attachments:[]};
  values=defaults(selected.templateVersion.definition.fields);title=template.name;currency='JPY';attempt=0;message='';baseline=draftString();creating=false;
  await tick();document.getElementById('workflow-request-title')?.focus();
 }
 function replaceFileKey(fields:Field[],data:Values,from:string,to:string):Values{
  const next={...data};for(const field of fields){const value=next[field.id];
   if(['attachment','image'].includes(field.type)&&Array.isArray(value))next[field.id]=value.map(key=>key===from?to:key);
   else if(isRepeat(field)&&Array.isArray(value))next[field.id]=value.map(row=>replaceFileKey(field.children??[],row as Values,from,to));
   else if(isContainer(field))Object.assign(next,replaceFileKey(field.children??[],next,from,to));
  }return next;
 }
 async function save(){
  if(!selected)return;
  if(newVersionId!==null){
   const created=await workflowApi<{requestKey:string}>(base,'POST',{versionId:newVersionId,title});
   // Retain the newly allocated key before any further request, so retry never creates a second draft.
   selected={...selected,requestKey:created.requestKey};newVersionId=null;
  }
  if(selected.revision===0){const persisted=await workflowApi<RequestDetail>(base+'/'+selected.requestKey);selected={...persisted,attachments:[...persisted.attachments,...selected.attachments.filter(file=>pendingFiles.has(file.attachmentKey))]};}
  for(const [key,file] of pendingFiles){
   if(!attachmentKeys(values,selected.templateVersion.definition.fields).includes(key)){pendingFiles.delete(key);continue;}
   const form=new FormData();form.set('file',file);form.set('revision',String(selected.revision));
   const uploaded=await workflowApi<Attachment>(base+'/'+selected.requestKey+'/attachments','POST',form);
   values=replaceFileKey(selected.templateVersion.definition.fields,values,key,uploaded.attachmentKey);
   selected.attachments=[...selected.attachments.filter(a=>a.attachmentKey!==key),uploaded];pendingFiles.delete(key);
  }
  await workflowApi(base+'/'+selected.requestKey,'PATCH',{revision:selected.revision,title,currency,values});
  await open(selected.requestKey,undefined,true);notice=t('下書きを保存しました。','Draft saved.');
 }
 async function saveDraft(){busy=true;error='';errors={};try{await save();await loadList();}catch(e){problem(e);}finally{busy=false;}}
 async function submit(){if(!selected)return;busy=true;error='';errors={};try{const checked=normalize(selected.templateVersion.definition,values,currency,true);if(Object.keys(checked.errors).length){errors=checked.errors;throw new WorkflowError('FORM_INVALID');}await save();if(selected)await workflowApi(base+'/'+selected.requestKey+'/submissions','POST',{revision:selected.revision});await reload();notice=t('承認回覧に提出しました。','Submitted for approval.');}catch(e){problem(e);}finally{busy=false;}}
 async function operate(path:string,body:Record<string,unknown>){if(!selected)return;busy=true;error='';errors={};try{await workflowApi(base+'/'+selected.requestKey+'/'+path,'POST',{revision:selected.revision,...body});await reload();return true;}catch(e){problem(e);return false;}finally{busy=false;}}
 async function upload(files:File[]){
  if(!selected)return[];transfers++;const added:Attachment[]=[];
  try{for(const file of files){
   if(newVersionId!==null){
    if(file.size<16||file.size>10*1024*1024||!['image/png','image/jpeg','image/webp','application/pdf'].includes(file.type))throw new WorkflowError('INVALID_ATTACHMENT');
    const current=selected.attachments.filter(a=>!a.deletedAt);if(current.length>=20||current.reduce((sum,a)=>sum+a.size,0)+file.size>50*1024*1024)throw new WorkflowError('ATTACHMENT_LIMIT');
    const attachment={attachmentKey:crypto.randomUUID(),name:file.name,mime:file.type,size:file.size};pendingFiles.set(attachment.attachmentKey,file);added.push(attachment);selected.attachments=[...selected.attachments,attachment];continue;
   }
   const form=new FormData();form.set('file',file);form.set('revision',String(selected.revision));const a=await workflowApi<Attachment>(base+'/'+selected.requestKey+'/attachments','POST',form);added.push(a);selected.attachments=[...selected.attachments,a];}return added;}finally{transfers--;}
 }
 async function download(file:Attachment,preview:boolean){
  if(!selected)return;transfers++;
  try{let blob:Blob;const local=pendingFiles.get(file.attachmentKey);if(local)blob=local;else{const r=await fetch(base+'/'+selected.requestKey+'/attachments/'+file.attachmentKey);if(!r.ok)throw new WorkflowError('NOT_FOUND');blob=await r.blob();}const url=URL.createObjectURL(blob);
   if(preview&&file.mime.startsWith('image/')){if(previewUrl)URL.revokeObjectURL(previewUrl);previewUrl=url;previewName=file.name;await tick();imageDialog?.showModal();}
   else{const a=document.createElement('a');a.href=url;a.download=file.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  }catch(e){problem(e);}finally{transfers--;}
 }
 function closeImage(){imageDialog?.close();if(previewUrl)URL.revokeObjectURL(previewUrl);previewUrl='';}
 async function beginReassignment(){try{approvers=(await workflowApi<Directory>(base+'/directory?approvers=true')).employees;reassignment=true;replacementReason='';}catch(e){problem(e);}}
 beforeNavigate(n=>{if(dirty){n.cancel();if(n.willUnload)return;pendingUrl=n.to?.url.href??'';discard=true;}});
 onMount(async()=>{
  try{user=await readSessionUser();if(!canOperate(user,'workflows.read'))throw new WorkflowError('PERMISSION_REQUIRED');
   const [t,d]=await Promise.all([workflowApi<{items:Template[]}>('/v1/workflow-templates'),workflowApi<Directory>(base+'/directory')]);templates=t.items;directory=d;ready=true;
  }catch(e){problem(e);loading=false;}
 });
 $effect(()=>{
  if(!selected&&!creating&&!deleteTarget)return;
  const root=document.documentElement,previous=root.style.overflow;root.style.overflow='hidden';
  return()=>{root.style.overflow=previous;};
 });
 let seenUrl='';
 $effect(()=>{const requestKey=page.url.searchParams.get('request')??'';if(ready&&requestKey&&requestKey!==seenUrl){seenUrl=requestKey;untrack(()=>{if(selected?.requestKey!==requestKey)void open(requestKey);});}});
 $effect(()=>{if($notificationTargetRequest&&selected&&definition&&!busy&&!creating)confirmNotificationView('workflow-request',selected.requestKey);});
</script>
{#snippet workflowFilters()}<WorkflowSearchFilters options={searchOptions} contexts={searchContexts} onChange={options=>searchOptions=options}/>{/snippet}
{#snippet listActions()}{#if canOperate(user,'workflows.create')}<AddButton label={t('新規申請','New request')} disabled={busy} bind:element={newRequestTrigger} onclick={()=>{templateId='';error='';creating=true;}}/>{/if}{/snippet}
{#snippet requestTitle(item:ListItem)}
 <div class="request-title-actions"><TextActionButton class="title-link" type="button" data-request-key={item.requestKey} onclick={e=>open(item.requestKey,e.currentTarget)} data-button-scope="button-3317e9986b">{item.title}</TextActionButton>{#if item.canDelete}<IconActionButton class="workflow-delete-draft" aria-label={t('下書きを削除：','Delete draft: ')+item.title} title={t('下書きを削除','Delete draft')} disabled={busy} onclick={e=>confirmDelete(item,e.currentTarget)}><MenuItemIcon name="delete"/></IconActionButton>{/if}</div><small class="list-template">{item.templateVersion.name}</small>
{/snippet}
{#snippet requestStatus(item:ListItem)}<span class="badge">{stateName(item.status,ja)}</span><small class="list-assignees">{item.steps.map(step=>step.employeeName).join('、')}</small>{/snippet}
{#snippet mobileRequest(item:ListItem)}<article class="workflow-mobile-request">{@render requestTitle(item)}<div class="mobile-request-meta"><span>{item.applicant}</span>{@render requestStatus(item)}<time>{stamp((item as ListItem).updatedAt)}</time></div></article>{/snippet}
<svelte:window onbeforeunload={e=>{if(dirty){e.preventDefault();e.returnValue='';}}}/>
<AssetManagementShell title={jaText} active="/workflows">
 <div class="workflow-ui workflow-page"><MasterPageHeader title={jaText}/>
  {#if error&&!creating&&!selected}<StatusNotice message={error} tone="error" onDismiss={()=>error=''}/>{/if}{#if notice&&!selected}<StatusNotice message={notice} tone="success" onDismiss={()=>notice=''}/>{/if}
  {#if creating}<DetailModal title={t('テンプレートを選択','Choose a template')} titleId="workflow-new-request-title" closeLabel={t('閉じる','Close')} returnFocus={busy?null:newRequestTrigger} initialFocusSelector='[data-field="workflow-new-template"] .form-select-trigger' compact dialogClass="workflow-ui new-request" onClose={()=>{if(!busy)creating=false;}}>
   {#if error}<StatusNotice message={error} tone="error" onDismiss={()=>error=''}/>{/if}
   <div class="template-choice"><Control field="workflow-new-template" label={t('公開済みのテンプレート','Published template')} kind="select" required bind:value={templateId} options={templates.map(template=>({value:String(template.versionId),label:template.name}))}/></div>
   {#if templates.find(t=>String(t.versionId)===templateId)}<p>{templates.find(t=>String(t.versionId)===templateId)?.description}</p>{/if}
   {#if !templates.length}<p>{t('公開済みのテンプレートはありません。管理者にテンプレートの公開を依頼してください。','No templates are published. Ask an administrator to publish a template.')}</p>{/if}
   {#snippet actions()}<ModalActionButton label={t('申請書を作成','Create request')} disabled={!templateId||busy} onclick={create}/><ModalActionButton label={t('キャンセル','Cancel')} variant="secondary" disabled={busy} onclick={()=>{creating=false;void tick().then(()=>newRequestTrigger?.focus({preventScroll:true}));}}/>{/snippet}
  </DetailModal>{/if}
  {#if selected&&definition}
   <DetailModal title={selected.title} titleId="workflow-request-dialog-title" initialFocusSelector={selected.actions.some(a=>a.actionKey===page.url.searchParams.get('action'))?'.history article.highlighted':'.app-modal-close'} closeLabel={t('閉じる','Close')} dialogClass="workflow-ui workflow-request-modal" onClose={close}>
    {#if error}<StatusNotice message={error} tone="error" onDismiss={()=>error=''}/>{/if}
    {#if notice}<StatusNotice message={notice} tone="success" onDismiss={()=>notice=''}/>{/if}
   <section class="request-detail" aria-label={t('申請詳細','Request details')}>
    <div class="request-summary"><ModalActionButton class="route-toggle" variant="secondary" aria-expanded={routeVisible} aria-controls="workflow-approval-route" onclick={()=>routeVisible=!routeVisible} label={routeVisible?t('承認経路を非表示','Hide approval route'):t('承認経路を表示','Show approval route')}/><span class="badge">{newVersionId!==null?t('未保存','Unsaved'):stateName(selected.status,ja)}</span><small>{selected.templateVersion.name}{#if selected.id} · {t('申請番号','Request')} #{selected.id}{/if}</small></div>
    <div class="detail-grid" class:route-hidden={!routeVisible}><aside id="workflow-approval-route" class="route-panel" aria-labelledby="workflow-approval-route-title" hidden={!routeVisible} inert={!routeVisible}><h3 id="workflow-approval-route-title">{t('承認経路','Approval route')}</h3>
     <ol>{#if selected.attempt}{#each selected.steps.filter(s=>s.attempt===(attempt||selected?.attempt)) as step}<li class:current={step.status==='pending'}><strong>{step.employeeName}</strong><span>{stateName(step.status,ja)}</span>{#if step.position===selected.steps.filter(s=>s.attempt===(attempt||selected?.attempt)).length-1}<small>{t('最終承認','Final approver')}</small>{/if}</li>{/each}{:else}{#each selected.templateVersion.route as step,i}<li><strong>{step.name}</strong><span>{i===selected.templateVersion.route.length-1?t('最終承認','Final approver'):t('承認','Approval')}</span></li>{/each}{/if}</ol></aside><div class="form-content">
     <div class="metadata">
      <div class="request-title">{#if editable}<Control field="workflow-request-title" label={t('件名','Title')} required bind:value={title} maxlength={160}/>{:else}<span class="metadata-label">{t('件名','Title')}</span><p>{snapshot?.title??title}</p>{/if}</div>
      {#if fieldsOf(definition.fields).some(field=>field.type==='money')}<div class="currency-choice">{#if editable}<Control field="workflow-request-currency" label={t('通貨','Currency')} kind="select" bind:value={currency} options={Intl.supportedValuesOf('currency').map(c=>({value:c,label:c}))}/>{:else}<span class="metadata-label">{t('通貨','Currency')}</span><p>{snapshot?.currency??currency}</p>{/if}</div>{/if}
      <div class="version-choice"><Control field="workflow-request-version" label={t('表示する版','Version')} kind="select" value={String(attempt)} options={[{value:'0',label:t('現在の内容','Current')},...selected.submissions.map(submission=>({value:String(submission.attempt),label:t('提出','Submission')+' '+submission.attempt}))]} onValueChange={v=>attempt=Number(v)}/></div>
     </div>
     <WorkflowFields fields={definition.fields} bind:values={()=>snapshot?.values??values,v=>values=v} context={result.values} readonly={!editable} {ja} directory={editable?directory:snapshot?.directory??selected.submissions.at(-1)?.snapshot.directory??directory} attachments={selected.attachments} applicant={snapshot?.applicant?.name??selected.submissions.at(-1)?.snapshot.applicant?.name??directory.employees.find(e=>e.id===selected?.applicantId)?.name??''} {errors} {upload} {download}/>
     {#if editable&&selected.attachments.some(a=>!a.deletedAt&&!attachmentKeys(values,definition.fields).includes(a.attachmentKey))}<details class="unused-files"><summary>{t('フォームに使用していない添付','Attachments not used in the form')}</summary><p>{t('削除しても、過去に提出した版の添付原本は保持されます。','Deleting keeps originals attached to earlier submissions.')}</p>{#each selected.attachments.filter(a=>!a.deletedAt&&!attachmentKeys(values,definition.fields).includes(a.attachmentKey)) as file}<div><span>{file.name}</span><ActionButton type="button" disabled={busy||dirty} onclick={async()=>{if(!selected)return;busy=true;try{if(pendingFiles.has(file.attachmentKey)){pendingFiles.delete(file.attachmentKey);selected.attachments=selected.attachments.filter(a=>a.attachmentKey!==file.attachmentKey);}else{await workflowApi(base+'/'+selected.requestKey+'/attachments/'+file.attachmentKey,'DELETE',{revision:selected.revision});await reload();}}catch(e){problem(e);}finally{busy=false;}}} variant="secondary" data-button-scope="button-3317e9986b">{t('削除','Delete')}</ActionButton></div>{/each}{#if dirty}<p>{t('先に下書きを保存してください。','Save the draft first.')}</p>{/if}</details>{/if}
     <div class="request-operations">
     {#if selected.status==='pending'&&currentStep?.employeeId===user?.id&&canOperate(user,'workflows.approve')}
      <form class="decision" onsubmit={e=>{e.preventDefault();void operate('decisions',{decision,message});}}><h3>{t('査閲・承認','Review and approval')}</h3><Control field="workflow-decision" kind="select" label={t('判断','Decision')} bind:value={decision} options={[{value:'approved',label:t('承認','Approve')},{value:'returned',label:t('差戻し','Return for revision')},{value:'rejected',label:t('却下','Reject')}]}/><Control field="workflow-decision-reason" kind="textarea" label={decision==='returned'?t('差し戻し理由','Return reason'):decision==='rejected'?t('却下理由','Rejection reason'):t('承認理由・コメント（任意）','Approval reason / comment (optional)')} required={decision!=='approved'} bind:value={message} maxlength={4000} rows={4}/><ActionButton type="submit" disabled={busy} class={['',(decision==='approved'?"primary":''),(decision!=='approved'?"danger":'')]} variant={(decision!=='approved'?'danger':(decision==='approved'?'primary':'secondary'))} data-button-scope="button-3317e9986b">{t('判断を確定','Submit decision')}</ActionButton></form>
     {/if}
     {#if selected.requestKey&&selected.isApplicant&&['draft','pending','returned'].includes(selected.status)&&canOperate(user,'workflows.cancel')}<details><summary>{t('申請の取下げ','Withdraw request')}</summary><p>{t('この申請の承認処理を終了します。','This ends approval processing for this request.')}</p><ActionButton class="danger" type="button" disabled={busy} onclick={()=>operate('cancellations',{})} variant="danger" data-button-scope="button-3317e9986b">{t('申請を取り下げる','Withdraw this request')}</ActionButton></details>{/if}
     {#if selected.canManage&&['pending','returned'].includes(selected.status)}<ActionButton type="button" onclick={beginReassignment} variant="secondary" data-button-scope="button-3317e9986b">{t('不在担当者の後任を指定','Replace unavailable approver')}</ActionButton>{/if}
     {#if reassignment}<form class="decision" onsubmit={e=>{e.preventDefault();void operate('route-changes',{position:Number(position),employeeId:Number(replacement),message:replacementReason}).then(ok=>{if(ok)reassignment=false;});}}><Control field="workflow-reassign-step" label={t('変更する段階','Step')} kind="select" required bind:value={position} options={selected.steps.filter(s=>s.attempt===selected?.attempt&&s.status!=='approved').map(s=>({value:String(s.position),label:s.employeeName}))}/><Control field="workflow-reassign-person" label={t('後任','Replacement')} kind="select" required bind:value={replacement} options={approvers.map(e=>({value:String(e.id),label:e.name}))}/><Control field="workflow-reassign-reason" kind="textarea" label={t('変更理由','Reason')} required maxlength={4000} bind:value={replacementReason}/><div class="actions"><ActionButton type="submit" class="primary" disabled={busy||!position||!replacement||!replacementReason.trim()} variant="primary" data-button-scope="button-3317e9986b">{t('後任を指定','Reassign')}</ActionButton><ActionButton type="button" onclick={()=>reassignment=false} variant="secondary" data-button-scope="button-3317e9986b">{t('キャンセル','Cancel')}</ActionButton></div></form>{/if}

     </div>
    </div></div>
    <section class="history"><h3>{t('コメント・承認履歴','Comments and approval history')}</h3><p>{t('承認・却下・差戻しの理由は、申請者もここで確認できます。','Applicants can read approval, rejection and return reasons here.')}</p>
     {#each selected.actions as a(a.actionKey)}<article id={'action-'+a.actionKey} tabindex="-1" class:highlighted={page.url.searchParams.get('action')===a.actionKey}><header><strong>{stateName(a.type,ja)}</strong><span>{a.actorName}</span><time datetime={a.createdAt}>{stamp(a.createdAt)}</time><small>{t('提出版','Submission')} {a.attempt}{a.position!==null?' · '+t('段階','Step')+' '+(a.position+1):''}</small></header><p>{a.message||(a.type==='approved'?t('承認理由・コメントの記入なし','No approval reason or comment entered'):'')}</p></article>{/each}
     {#if ['pending','returned'].includes(selected.status)&&canOperate(user,'workflows.comment')&&(selected.isApplicant||selected.steps.some(s=>s.employeeId===user?.id))}<form onsubmit={e=>{e.preventDefault();void operate('comments',{message});}}><Control field="workflow-comment" kind="textarea" label={t('コメントを追加（申請者にも表示されます）','Add comment (visible to applicant)')} bind:value={message} required maxlength={4000}/><ActionButton type="submit" disabled={busy||!message.trim()} variant="secondary" data-button-scope="button-3317e9986b">{t('コメントを投稿','Post comment')}</ActionButton></form>{/if}
    </section>
   </section>
   {#snippet actions()}
    {#if selected?.requestKey&&selected.isApplicant&&selected.status==='draft'&&selected.attempt===0&&canOperate(user,'workflows.delete')}<ModalActionButton class="workflow-delete-draft" label={t('下書きを削除','Delete draft')} variant="danger" disabled={busy||transfers>0} onclick={e=>{if(selected)confirmDelete(selected,e.currentTarget);}}/>{/if}
    {#if editable}<ModalActionButton class="workflow-save-draft" label={t('下書き保存','Save draft')} variant="secondary" disabled={busy||transfers>0} onclick={saveDraft}/><ModalActionButton class="workflow-submit-request" label={selected?.status==='returned'?t('修正して再申請','Resubmit'):t('承認回覧に出す','Submit for approval')} disabled={busy||transfers>0} onclick={submit}/>{/if}
    <ModalActionButton class="workflow-close-request" label={t('閉じる','Close')} variant="secondary" disabled={busy||transfers>0} onclick={close}/>
   {/snippet}
   </DetailModal>
  {/if}
  {#if ready}
   <div inert={!!selected||creating||!!deleteTarget}>
    <ViewportListPage>
     <SearchPanel bind:this={searchPanel} onDefinitions={contexts=>searchContexts=contexts} target="workflows" userId={user?.id??null} bind:searchState draftOptions={searchOptions} onRestoreOptions={options=>searchOptions=options} filters={workflowFilters}/>
     <div class="request-list"><MasterList bind:this={requestList} bind:searchState endpoint="/v1/workflow-searches" title={t('申請','Requests')} listHeading={t('申請一覧','Requests')} description="" initialSortBy="updatedAt" pageSizeStorageKey="workflows-page-size" minTableWidth={720} headerActions={listActions} mobileItem={mobileRequest} onDetail={(item,trigger)=>void open(item.requestKey,trigger??undefined)} actionLabel={item=>item.title} columns={[
      {key:'title',label:t('件名・テンプレート','Request / template'),cell:requestTitle,width:35},
      {key:'applicant',label:t('申請者','Applicant'),value:item=>item.applicant,sortable:false,width:20},
      {key:'status',label:t('状態・担当者','Status / assignee'),cell:requestStatus,width:25},
      {key:'updatedAt',label:t('更新日時','Updated'),value:item=>stamp(item.updatedAt),width:20}
     ]}/></div>
    </ViewportListPage>
   </div>
  {/if}
 </div>
</AssetManagementShell>
<dialog class="workflow-ui attachment-preview" onkeydown={e=>{if(e.key==='Escape')e.stopPropagation();}} bind:this={imageDialog} onclose={closeImage} aria-label={previewName}><header><strong>{previewName}</strong><ActionButton type="button" onclick={closeImage} variant="secondary" data-button-scope="button-3317e9986b">{t('閉じる','Close')}</ActionButton></header>{#if previewUrl}<img src={previewUrl} alt={previewName}/>{/if}</dialog>
{#if deleteTarget}<DetailModal title={t('下書きを削除','Delete draft')} titleId="workflow-delete-draft-title" closeLabel={t('キャンセル','Cancel')} compact dialogClass="workflow-ui workflow-delete-confirm" onClose={cancelDelete}>
 {#if deleteError}<StatusNotice message={deleteError} tone="error" onDismiss={()=>deleteError=''}/>{/if}
 <p>{deleteTarget.title}</p><p>{t('この下書きを削除します。未保存の入力も破棄されます。よろしいですか？','Delete this draft and discard any unsaved edits?')}</p>
 {#snippet actions()}<ModalActionButton label={t('キャンセル','Cancel')} variant="secondary" disabled={busy} onclick={cancelDelete}/><ModalActionButton class="workflow-confirm-delete" label={t('削除する','Delete')} variant="danger" disabled={busy} onclick={removeDraft}/>{/snippet}
</DetailModal>{/if}
{#if discard}<DiscardChangesDialog onContinue={()=>{discard=false;pendingClose=false;pendingUrl='';}} onDiscard={()=>{discardApproved=true;baseline=draftString();discard=false;if(pendingClose){pendingClose=false;void finishClose();}else if(pendingUrl){void goto(pendingUrl);pendingUrl='';}}}/>{/if}
<style>
 :global(.workflow-request-modal>.app-modal-footer){flex-wrap:wrap}
 .request-title-actions{display:flex;align-items:start;justify-content:space-between;gap:var(--sph-space-12px);min-width:0}.request-title-actions :global(.workflow-delete-draft){color:var(--danger);flex:none}.request-title-actions :global(.title-link){min-width:0;flex:1}
 .workflow-page{display:flex;flex-direction:column;gap:var(--sph-space-16px);min-width:0}h3{margin:0 0 var(--sph-space-8px)}.history>p{color:var(--muted);font-size:var(--font-size-support);margin:0}.request-list{min-width:0}.list-template,.list-assignees{display:block;color:var(--muted);font-size:var(--font-size-support);margin-top:var(--sph-space-5px)}.workflow-mobile-request{padding:var(--sph-space-12px) var(--sph-space-16px);border-bottom:1px solid var(--border)}.mobile-request-meta{display:flex;flex-wrap:wrap;gap:var(--sph-space-8px);align-items:center;margin-top:var(--sph-space-10px);font-size:var(--font-size-support)}.request-detail{min-width:0}.request-summary{display:flex;align-items:center;flex-wrap:wrap;gap:var(--sph-space-8px) var(--sph-space-16px);margin-bottom:var(--sph-space-20px)}.request-summary small{color:var(--muted)}:global(.workflow-request-modal){width:min(100%,var(--workflow-form-width))}:global(.workflow-request-modal>.app-detail-body){display:block}:global(.workflow-request-modal>.app-detail-body>.status-notice){margin:0 0 var(--sph-space-16px)}.template-choice{max-width:28rem}.actions{margin:var(--sph-space-16px) 0}.metadata{display:flex;flex-wrap:wrap;gap:var(--sph-space-16px);align-items:start;margin-bottom:var(--sph-space-20px)}.metadata>div{min-width:0}.request-title{flex:1 1 16rem;max-width:30rem}.currency-choice{width:9rem}.version-choice{width:16rem}.metadata-label{font-size:var(--font-size-support);color:var(--text-secondary)}.metadata p{margin:var(--sph-space-6px) 0;overflow-wrap:anywhere}:global(.title-link[data-button-scope="button-3317e9986b"]){padding:0!important;background:transparent!important;color:var(--action-primary)!important;border:0!important;text-align:left;justify-content:flex-start!important;font-weight:var(--sph-weight-500);height:auto!important;min-height:0!important;box-shadow:none!important}.badge{display:inline-block;padding:var(--sph-space-3px) var(--sph-space-8px);border-radius:var(--sph-radius-4px);background:var(--surface-secondary);font-size:var(--font-size-support);border:1px solid var(--border)}.detail-grid{display:grid;grid-template-columns:300px minmax(0,1fr);gap:var(--sph-space-24px)}.detail-grid.route-hidden{grid-template-columns:minmax(0,1fr)}.form-content,.route-panel{min-width:0}.route-panel{border-right:1px solid var(--border);padding-right:var(--sph-space-20px)}.route-panel[hidden]{display:none}.request-operations{display:grid;gap:var(--sph-space-12px);max-width:48rem}.request-operations>:global(button[data-button-scope="button-3317e9986b"]){justify-self:start}.request-operations>details{margin-top:var(--sph-space-16px)}.route-panel ol{padding-left:var(--sph-space-24px)}.route-panel li{padding:var(--sph-space-10px) var(--sph-space-8px);border-bottom:1px solid var(--border)}.route-panel li strong,.route-panel li span,.route-panel li small{display:block;overflow-wrap:anywhere}.route-panel li span,.route-panel li small{color:var(--muted);font-size:var(--font-size-support);margin-top:var(--sph-space-4px)}.route-panel li.current{border-left:3px solid var(--action-primary);background:var(--surface-secondary)}.decision{display:grid;gap:var(--sph-space-16px);margin:var(--sph-space-16px) 0;padding:var(--sph-space-16px);border:1px solid var(--border);border-radius:var(--sph-radius-6px);background:var(--surface-secondary)}.decision h3{margin:0}.decision>:global(button[data-button-scope="button-3317e9986b"]){justify-self:start}.history{margin-top:var(--sph-space-24px);padding-top:var(--sph-space-20px);border-top:1px solid var(--border)}.history article{padding:var(--sph-space-16px) 0;border-bottom:1px solid var(--border)}.history article header{display:flex;gap:var(--sph-space-8px) var(--sph-space-16px);align-items:center;flex-wrap:wrap;font-size:var(--font-size-support)}.history time,.history small{color:var(--muted)}.history article p{white-space:pre-wrap;overflow-wrap:anywhere;margin:var(--sph-space-10px) 0 0}.history article.highlighted{background:var(--surface-secondary);border-left:3px solid var(--action-primary);padding-left:var(--sph-space-12px)}.history form{display:grid;gap:var(--sph-space-12px);margin-top:var(--sph-space-16px);max-width:50rem}.history form :global(button[data-button-scope="button-3317e9986b"]){justify-self:start}.unused-files{margin-top:var(--sph-space-16px)}.unused-files>div{display:flex;align-items:center;justify-content:space-between;gap:var(--sph-space-12px);padding:var(--sph-space-8px) 0}.unused-files span{overflow-wrap:anywhere}details{font-size:var(--font-size-support)}.attachment-preview{width:min(1000px,90vw);max-height:90dvh;background:var(--surface);color:var(--text);border:1px solid var(--border);border-radius:var(--sph-radius-6px)}.attachment-preview::backdrop{background:var(--sph-color-overlay-image)}.attachment-preview header{display:flex;justify-content:space-between;gap:var(--sph-space-16px);margin-bottom:var(--sph-space-12px)}.attachment-preview img{display:block;max-width:100%;height:auto;margin:auto}article:focus-visible{outline:2px solid var(--action-primary);outline-offset:2px}@media(max-width:1100px){.detail-grid{grid-template-columns:minmax(0,1fr)}.route-panel{border-right:0;border-bottom:1px solid var(--border);padding:0 0 var(--sph-space-20px)}}@media(max-width:700px),(min-width:701px) and (max-width:1024px) and (max-height:500px) and (any-pointer:coarse){.metadata{display:grid;grid-template-columns:minmax(0,1fr)}.metadata>div{width:100%;max-width:none}:global(.title-link[data-button-scope="button-3317e9986b"]){min-height:44px!important;width:100%;font-size:var(--font-size-body)}.decision{padding:var(--sph-space-12px)}}
</style>
