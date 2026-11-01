<script lang="ts">
 import ActionButton from '$lib/components/ActionButton.svelte';
 import {onMount} from 'svelte';
 import {localization} from '$lib/localization';
 import {workflowApi,workflowError,choose,WorkflowError,emptyDirectory,type Template} from '$lib/workflow-client';
 import type {Definition,Directory} from '$lib/workflow-form';
 import StatusNotice from '$lib/components/StatusNotice.svelte';
 import PageTabs from '$lib/components/PageTabs.svelte';
 import '$lib/styles/workflow.css';
 import WorkflowDesigner from './WorkflowDesigner.svelte';
 let ja=$derived($localization.displayLanguage==='ja'),items=$state<Template[]>([]),directory=$state<Directory>(emptyDirectory),editing=$state<Template|null>(null),error=$state(''),loading=$state(true),busy=$state(false),removeKey=$state('');
 let activeTab=$state('templates'),editorId=$state(0),designer=$state<{requestClose:(action:()=>void)=>void;isWorking:()=>boolean}>();
 let editingBusy=$derived(designer?.isWorking()??false);
 const t=(a:string,b:string)=>choose(ja,a,b);
 async function load(){loading=true;try{const [data,choices]=await Promise.all([workflowApi<{items:Template[]}>('/v1/workflow-templates?settings=true'),workflowApi<Directory>('/v1/workflow-requests/directory?approvers=true')]);items=data.items;directory=choices;}catch(e){error=workflowError(e instanceof WorkflowError?e.code:'FAILED',ja);}finally{loading=false;}}
 function create(source?:{name:string;description:string;definition:Definition}){
  openEditor({id:0,templateKey:'',name:source?.name??'',description:source?.description??'',definition:JSON.parse(JSON.stringify(source?.definition??{version:1,fields:[]})),route:[],revision:0,active:false});
 }
 function openEditor(next:Template){
  activeTab='designer';
  const activate=()=>{editing=next;editorId++;};
  if(editing&&designer)designer.requestClose(activate);else activate();
 }
 function editTemplate(item:Template){openEditor(structuredClone($state.snapshot(item)));}
 function selectTab(value:string){if(value==='designer')create();else activeTab=value;}
 function saved(template:Template){error='';editing=template;void load();}
 function finish(){editing=null;activeTab='templates';void load();}
 async function publication(item:Template,remove=false){busy=true;error='';try{await workflowApi('/v1/workflow-templates/'+item.templateKey+(remove?'':'/publication'),remove?'DELETE':'PUT',{revision:item.revision,active:!item.active});removeKey='';await load();}catch(e){error=workflowError(e instanceof WorkflowError?e.code:'FAILED',ja);}finally{busy=false;}}
 onMount(load);
</script>
 <section class="workflow-ui workflow-settings" aria-label={t('ワークフローテンプレート','Workflow templates')}>
  <div class="workflow-tabbar"><div class="workflow-tabs"><PageTabs embedded idPrefix="workflow-settings" label={t('ワークフロー設定','Workflow settings')} bind:active={()=>activeTab,selectTab} tabs={[{id:'templates',label:t('テンプレート','Templates')},{id:'designer',label:t('デザイナー','Designer')}]}/></div></div>
  <div id="workflow-settings-templates" class="templates-panel" role="tabpanel" aria-labelledby="workflow-settings-templates-tab" hidden={activeTab!=='templates'}>
  {#if error}<StatusNotice message={error} tone="error" onDismiss={()=>error=''}/>{/if}
  {#if loading}<p role="status">{t('読み込み中…','Loading…')}</p>
  {:else}
   <div class="cards">{#each items as item(item.templateKey)}<article data-template-key={item.templateKey}><header><h4>{item.name}</h4><span class:published={item.active}>{item.active?t('公開中','Published'):t('非公開','Unpublished')}</span></header><p>{item.description}</p><small>{item.route.length} {t('承認段階','approval steps')}</small><div class="actions"><ActionButton type="button" disabled={busy||editingBusy} onclick={()=>editTemplate(item)} variant="secondary" data-button-scope="button-386efd8ad4">{t('編集','Edit')}</ActionButton><ActionButton type="button" disabled={busy||editingBusy} onclick={()=>create(item)} variant="secondary" data-button-scope="button-386efd8ad4">{t('複製','Duplicate')}</ActionButton><ActionButton type="button" disabled={busy||editingBusy||!item.active&&!item.route.length} title={!item.active&&!item.route.length?t('公開するには承認経路を設定してください。','Configure an approval route before publishing.'):undefined} onclick={()=>publication(item)} variant="secondary" data-button-scope="button-386efd8ad4">{item.active?t('公開停止','Unpublish'):t('公開','Publish')}</ActionButton><ActionButton class="danger" type="button" disabled={busy||editingBusy} onclick={()=>removeKey=item.templateKey} variant="danger" data-button-scope="button-386efd8ad4">{t('削除','Delete')}</ActionButton></div>
    {#if removeKey===item.templateKey}<div class="confirm" role="group" aria-label={t('削除確認','Confirm deletion')}><p>{t('テンプレートを削除します。提出済みの申請と履歴は保持されます。','Delete this template? Submitted requests and history will be retained.')}</p><ActionButton class="danger" type="button" disabled={busy||editingBusy} onclick={()=>publication(item,true)} variant="danger" data-button-scope="button-386efd8ad4">{t('削除する','Confirm deletion')}</ActionButton><ActionButton type="button" onclick={()=>removeKey=''} variant="secondary" data-button-scope="button-386efd8ad4">{t('キャンセル','Cancel')}</ActionButton></div>{/if}
   </article>{:else}<p>{t('テンプレートはありません。新しく作成してください。','No templates yet. Create a new template.')}</p>{/each}</div>
  {/if}
  </div>
  <div id="workflow-settings-designer" class="designer-panel" role="tabpanel" aria-labelledby="workflow-settings-designer-tab" hidden={activeTab!=='designer'}>
   {#if editing}{#key editorId}<WorkflowDesigner bind:this={designer} template={editing} {directory} onsaved={saved} onclose={finish}/>{/key}{/if}
  </div>
 </section>
<style>
 .workflow-tabbar{display:flex;align-items:center;gap:var(--sph-space-8px);border-bottom:1px solid var(--border)}
 .workflow-tabs{flex:1;min-width:0;--page-tabs-min-height:32px;--page-tabs-padding:4px 12px}
 .workflow-tabs :global(.page-tabs){padding-top:0;border-bottom:0}
 .workflow-tabs :global(.page-tabs button){line-height:var(--sph-leading-1-4)}
 .templates-panel,.designer-panel{padding-top:var(--sph-space-16px)}
 .templates-panel>.cards{margin-top:0}
 .workflow-settings{padding:var(--sph-space-16px)}header{display:flex;gap:var(--sph-space-12px);align-items:flex-start;justify-content:space-between;flex-wrap:wrap}h4{margin:0 0 var(--sph-space-8px)}p,small{font-size:var(--font-size-support);color:var(--muted)}.cards{margin-top:var(--sph-space-16px);display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));gap:var(--sph-space-16px)}article{padding:var(--sph-space-16px);border:1px solid var(--border);background:var(--surface);border-radius:var(--sph-radius-6px);min-width:0;overflow-wrap:anywhere;box-shadow:var(--shadow)}.actions{margin-top:var(--sph-space-12px)}.published{color:var(--action-primary)}.confirm{border-top:1px solid var(--border);padding-top:var(--sph-space-12px);margin-top:var(--sph-space-12px)}
</style>
