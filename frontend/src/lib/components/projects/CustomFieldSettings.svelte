<script lang="ts">
 import InfoPopover from '../InfoPopover.svelte';
 import {untrack} from 'svelte';
 import {localization} from '#lib/localization.js';
 import {projectRequest,projectError,type Project} from '#lib/projects.js';
 import {customKinds,type CustomField,customPayload} from '#lib/project-custom-fields.js';
 import CustomFieldControl from './CustomFieldControl.svelte';
 import DetailModal from '../DetailModal.svelte';
 import DiscardChangesDialog from '../DiscardChangesDialog.svelte';
 import FormInput from '../FormInput.svelte';
 import FormTextarea from '../FormTextarea.svelte';
 import FormCheckbox from '../FormCheckbox.svelte';
 import SearchSelect from '../SearchSelect.svelte';
 import ActionButton from '../ActionButton.svelte';
 import AddButton from '../AddButton.svelte';
 import SortableList from '../SortableList.svelte';
 import StatusNotice from '../StatusNotice.svelte';
 let {project,onsaved,ondirty}:{project:Project;onsaved:(p:Project)=>void;ondirty:(v:boolean)=>void}=$props();
 const clean=(fields:CustomField[])=>fields.map((f,position)=>({id:f.id,name:f.name,kind:f.kind,description:f.description,required:f.required,enabled:f.enabled,position,defaultValue:f.defaultValue??null,min:f.min,max:f.max,maxLength:f.maxLength,typeIds:[...f.typeIds],options:f.options.map(o=>({id:o.id,name:o.name,enabled:o.enabled}))}));
 let persisted=$state(untrack(()=>JSON.stringify(clean(project.customFields??[])))),fields=$state<CustomField[]>(untrack(()=>JSON.parse(JSON.stringify(project.customFields??[])))),revision=$state(untrack(()=>project.revision));
 let dirty=$derived(JSON.stringify(clean(fields))!==persisted),busy=$state(false),error=$state(''),notice=$state(''),next=$state(-1),draft=$state<CustomField|null>(null),discard=$state(false),modalBaseline=$state(''),returnFocus=$state<HTMLElement|null>(null);
 let ja=$derived($localization.displayLanguage==='ja');const tr=(j:string,e:string)=>ja?j:e;
 $effect(()=>ondirty(dirty||draft!==null&&JSON.stringify(draft)!==modalBaseline));
 $effect(()=>{if(project.revision!==revision)untrack(()=>{revision=project.revision;if(!dirty&&!draft){fields=JSON.parse(JSON.stringify(project.customFields??[]));persisted=JSON.stringify(clean(fields));}});});
 const kindLabel=(kind:string)=>customKinds.find(k=>k[0]===kind)?.[ja?1:2]??kind;
 function open(field:CustomField|null,trigger:HTMLElement){returnFocus=trigger;draft=field?structuredClone($state.snapshot(field)):{id:next--,name:'',kind:'text',description:'',required:false,enabled:true,position:fields.length,defaultValue:null,min:null,max:null,maxLength:null,typeIds:[],options:[]};modalBaseline=JSON.stringify(draft);}
 function close(){if(draft&&JSON.stringify(draft)!==modalBaseline)discard=true;else draft=null;}
 function accept(){if(!draft)return;const d=$state.snapshot(draft);d.defaultValue=customPayload([{...d,enabled:true,typeIds:[]}],{[d.id]:d.defaultValue},0)[d.id];fields=fields.some(f=>f.id===d.id)?fields.map(f=>f.id===d.id?d:f):[...fields,d];draft=null;notice='';}
 async function save(){busy=true;error='';notice='';try{const p=await projectRequest<Project>(`/v1/projects/${project.id}/custom-fields`,'PUT',{revision,fields:clean(fields).map(({position,...f})=>f)});fields=JSON.parse(JSON.stringify(p.customFields??[]));persisted=JSON.stringify(clean(fields));revision=p.revision;onsaved(p);notice=tr('保存しました。','Saved.');}catch(e){error=projectError(e,ja);}finally{busy=false;}}
</script>
{#snippet definitionHelp()}<InfoPopover label={tr('カスタム項目の説明','Custom fields help')}><p>{tr('項目名と入力形式を指定して、チケットに自由な項目を追加できます。','Add named fields to tickets and choose their input formats.')}</p><p>{tr('既定値は新規チケットに適用します。無効化しても保存済みの値は保持します。','Defaults apply to new tickets. Deactivating a field or option preserves existing values.')}</p></InfoPopover>{/snippet}
<section class="settings-card" data-settings-card="custom-fields"><header><div class="card-title"><h2>{tr('カスタム項目','Custom fields')}</h2>{@render definitionHelp()}</div><AddButton label={tr('項目を追加','Add field')} disabled={busy||project.status==='archived'||fields.length>=100} onclick={e=>open(null,e.currentTarget as HTMLButtonElement)}/></header><div class="body">
 {#if error}<StatusNotice message={error} tone="error" onDismiss={()=>error=''}/>{/if}{#if notice}<StatusNotice message={notice} tone="success" onDismiss={()=>notice=''}/>{/if}
 {#if !fields.length}<p>{tr('項目はありません。','No custom fields.')}</p>{/if}
 <SortableList ids={fields.map(f=>f.id)} label={tr('カスタム項目の順番を変更','Reorder custom fields')} labelFor={id=>fields.find(f=>f.id===id)?.name??''} disabled={busy||project.status==='archived'} onreorder={ids=>fields=ids.map(id=>fields.find(f=>f.id===id)!)}>
 {#snippet children(id:number)}{@const f=fields.find(f=>f.id===id)!}<div class="row"><div><strong>{f.name}</strong><small>{kindLabel(f.kind)} · {f.required?tr('必須','Required'):tr('任意','Optional')} · {f.typeIds.length?project.types.filter(t=>f.typeIds.includes(t.id)).map(t=>t.name).join(', '):tr('全種別','All types')}{!f.enabled?' · '+tr('無効','Inactive'):''}</small></div><ActionButton label={tr('編集','Edit')+' · '+f.name} disabled={busy||project.status==='archived'} onclick={e=>open(f,e.currentTarget)}/></div>{/snippet}
 </SortableList>
 </div><footer><ActionButton label={tr('変更を取り消す','Discard changes')} disabled={busy||!dirty} onclick={()=>{fields=JSON.parse(JSON.stringify(project.customFields??[]));persisted=JSON.stringify(clean(fields));error='';}}/><ActionButton label={tr('設定を保存','Save settings')} variant="primary" disabled={busy||!dirty||project.status==='archived'} onclick={save}/></footer></section>
{#if draft}
 <DetailModal title={tr('カスタム項目の設定','Custom field settings')} titleId="custom-field-settings-title" headerActions={definitionHelp} closeLabel={tr('閉じる','Close')} {returnFocus} onClose={close}>
 <div class="editor">
 <div class="identity-row">
 <FormInput label={tr('項目名','Field name')} field="custom-field-name" value={draft.name} required maxlength={128} onValueChange={v=>{if(draft)draft.name=v;}}/>
 <SearchSelect label={tr('入力形式','Format')} field="custom-field-kind" value={draft.kind} disabled={draft.id>0} options={customKinds.map(k=>({value:k[0],label:k[ja?1:2]}))} onSelect={v=>{if(draft){draft.kind=v;draft.defaultValue=null;draft.options=[];draft.min=null;draft.max=null;draft.maxLength=null;}}}/>
 </div>
 <FormTextarea label={tr('説明','Description')} field="custom-field-description" value={draft.description} maxlength={2000} rows={2} onValueChange={v=>{if(draft)draft.description=v;}}/>
 <FormCheckbox label={tr('必須','Required')} field="custom-field-required" checked={draft.required} onChange={v=>{if(draft)draft.required=v;}}/>
 <FormCheckbox label={tr('有効','Active')} field="custom-field-enabled" checked={draft.enabled} onChange={v=>{if(draft)draft.enabled=v;}}/>
 <fieldset><legend>{tr('適用するチケット種別（未選択なら全種別）','Ticket types (none selected means all types)')}</legend>{#each project.types as t}<FormCheckbox field={'custom-type-'+t.id} label={t.name} checked={draft.typeIds.includes(t.id)} onChange={v=>{if(draft)draft.typeIds=v?[...draft.typeIds,t.id]:draft.typeIds.filter(id=>id!==t.id);}}/>{/each}</fieldset>
 {#if ['integer','decimal','duration'].includes(draft.kind)}<div class="bounds"><FormInput label={tr('下限','Minimum')} field="custom-min" type="number" value={String(draft.min??'')} onValueChange={v=>{if(draft)draft.min=v===''?null:Number(v);}}/><FormInput label={tr('上限','Maximum')} field="custom-max" type="number" value={String(draft.max??'')} onValueChange={v=>{if(draft)draft.max=v===''?null:Number(v);}}/></div>{/if}
 {#if ['text','textarea'].includes(draft.kind)}<FormInput label={tr('文字数上限','Maximum length')} field="custom-maxlength" type="number" min="1" value={String(draft.maxLength??'')} onValueChange={v=>{if(draft)draft.maxLength=v===''?null:Number(v);}}/>{/if}
 {#if ['select','multiselect'].includes(draft.kind)}
 <fieldset><legend>{tr('選択肢','Options')}</legend><SortableList ids={draft.options.map(o=>o.id)} label={tr('選択肢の順番を変更','Reorder options')} labelFor={id=>draft?.options.find(o=>o.id===id)?.name??''} onreorder={ids=>{if(draft)draft.options=ids.map(id=>draft!.options.find(o=>o.id===id)!);}}>
 {#snippet children(id:number)}{@const o=draft!.options.find(o=>o.id===id)!}<div class="option-row"><FormInput label={tr('選択肢名','Option name')} field={'custom-option-'+id} value={o.name} maxlength={128} onValueChange={v=>{o.name=v;}}/><FormCheckbox label={tr('有効','Active')} field={'custom-option-enabled-'+id} checked={o.enabled} onChange={v=>{o.enabled=v;}}/>{#if id<0}<ActionButton label={tr('取り消す','Remove')} onclick={()=>{if(draft){draft.options=draft.options.filter(o=>o.id!==id);draft.defaultValue=null;}}}/>{/if}</div>{/snippet}
 </SortableList><ActionButton label={tr('選択肢を追加','Add option')} disabled={draft.options.length>=100} onclick={()=>{if(draft)draft.options=[...draft.options,{id:next--,name:'',enabled:true}];}}/></fieldset>
 {/if}
 <CustomFieldControl definition={{...draft,name:tr('既定値','Default value'),required:false,description:''}} value={draft.defaultValue} prefix="custom-default" defaultValueMode onchange={v=>{if(draft)draft.defaultValue=v;}}/>
 </div>
 {#snippet actions()}<ActionButton label={tr('キャンセル','Cancel')} onclick={close}/><ActionButton label={tr('設定に反映','Apply to settings')} variant="primary" disabled={!draft?.name.trim()||Boolean(draft.options.some(o=>!o.name.trim()))} onclick={accept}/>{/snippet}
 </DetailModal>
{/if}
{#if discard}<DiscardChangesDialog onContinue={()=>discard=false} onDiscard={()=>{discard=false;draft=null;}}/>{/if}
<style>
 .identity-row{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:var(--sph-space-12px);min-width:0}
 .card-title{display:flex;align-items:center;gap:8px;min-width:0}
 header{display:flex;align-items:center;justify-content:space-between;gap:12px}
 .settings-card{min-width:0;border:1px solid var(--border);border-radius:8px;background:var(--surface);box-shadow:var(--shadow)}header{padding:16px 20px;border-bottom:1px solid var(--border)}h2{font-size:var(--font-size-body);margin:0}p,small{color:var(--muted);font-size:var(--font-size-support)}.body,.editor{display:grid;gap:14px;min-width:0}.body{padding:20px}.row{display:flex;align-items:center;justify-content:space-between;gap:12px;min-width:0}.row>div{min-width:0;overflow-wrap:anywhere}small{display:block;margin-top:4px}footer{padding:14px 20px;border-top:1px solid var(--border);display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}fieldset{min-width:0;margin:0;padding:12px;border:1px solid var(--border);border-radius:4px;display:grid;gap:12px}legend{font-size:var(--font-size-support)}.bounds{display:grid;grid-template-columns:1fr 1fr;gap:12px}.option-row{display:flex;gap:12px;align-items:center;flex-wrap:wrap}@media(max-width:700px){.body,header,footer{padding:14px 12px}.bounds{grid-template-columns:1fr}.row{align-items:start;flex-wrap:wrap}}</style>
