<script lang="ts">
 import FormInput from '../FormInput.svelte';
 import FormSection from '../FormSection.svelte';
 import SearchSelect from '../SearchSelect.svelte';
 import ModalActionButton from '../ModalActionButton.svelte';
 import FileInput from '../FileInput.svelte';
 import CodeEditor from '../CodeEditor.svelte';
 import PageTabs from '../PageTabs.svelte';
 import StatusNotice from '../StatusNotice.svelte';
 import type {CodeLanguage} from '$lib/code-highlight';
 import {onMount} from 'svelte';import {localization,applyLocalization} from '$lib/localization';import {readSessionUser} from '$lib/client-session';import {apiData} from '$lib/api';import RuntimeWidget from '$lib/components/widgets/RuntimeWidget.svelte';import type {WidgetDefinition} from '$lib/widgets';
 type Draft={id:number;widgetCode:string;version:string;revision:number;content:{metadata:string;html:string;css:string;javascript:string}};
 let ja=$derived($localization.displayLanguage==='ja'),drafts=$state<Omit<Draft,'content'>[]>([]),id=$state<number>(),revision=$state(0),widgetCode=$state('custom.calculator'),version=$state('1.0.0'),tab=$state('html'),message=$state(''),busy=$state(false),dirty=$state(false),allowed=$state(false),preview=$state<WidgetDefinition|null>(null),run=$state(0),previewTheme=$state('light'),previewLanguage=$state<'ja'|'en'>('ja'),previewSize=$state('2x2');
 const sourceKeys=['metadata','html','css','javascript'] as const;
 const sourceLabel=(key:string)=>key==='metadata'?(ja?'定義':'Manifest'):key==='javascript'?'JavaScript':key.toUpperCase();
 let failed=$state(false);
 const initial={metadata:JSON.stringify({id:'custom.calculator',provider:'Your organization',author:'Your name',version:'1.0.0',schemaVersion:2,name:{ja:'自作電卓',en:'Custom calculator'},sizes:['2x2'],sizeLayouts:{'2x2':{rows:2,columns:2}},capabilities:[],settings:{},view:[{type:'runtime'}],license:{name:'Your license',url:'https://example.com/license'}},null,2),html:'<label>A <input id="a" type="number" value="2"></label>\n<label>B <input id="b" type="number" value="3"></label>\n<button id="sum">＋</button>\n<output id="result">5</output>',css:'label { display:block; margin:12px 0; }\ninput { width:100%; min-height:44px; }\nbutton { min-height:44px; padding:8px 20px; }\noutput { display:block; margin:16px 0; font-size:32px; }',javascript:"sph.ready(() => {\n  let a=2, b=3;\n  sph.ui.on('a','input',e => a=Number(e.value));\n  sph.ui.on('b','input',e => b=Number(e.value));\n  sph.ui.on('sum','click',() => sph.ui.patch([{id:'result',text:String(a+b)}]));\n});"};
 let operations=$state<string[]>([]);
 let content=$state({...initial});
 const endpoint='/v1/employees/me/widget-drafts';
 async function api(path:string,method='GET',body?:unknown){const r=await fetch(path,{method,headers:{'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)}),cache:'no-store'});if(!r.ok){const p=await r.json().catch(()=>null);throw Error(r.status===409?(ja?'競合しました。編集内容を保持しています。':'Conflict. Your edits are kept.'):p?.error?.message??(ja?'操作に失敗しました。':'Request failed.'));}return apiData(r);}
 async function list(){drafts=await api(endpoint+'?limit=100&sortBy=updatedAt&sortOrder=desc') as Omit<Draft,'content'>[];}
 onMount(()=>{void(async()=>{try{const user=await readSessionUser();if(!user){location.assign('/');return;}await applyLocalization(user);operations=user.capabilities.widgetDraftOperations??[];await list();allowed=true;}catch(e){failed=true;message=e instanceof Error?e.message:'Access denied';}})();});
 function discard(){return !dirty||confirm(ja?'未保存の編集を破棄しますか？':'Discard unsaved edits?');}
 async function load(value:number){if(!discard())return;try{const d=await api(`${endpoint}/${value}`) as Draft;id=d.id;revision=d.revision;widgetCode=d.widgetCode;version=d.version;content={...d.content};dirty=false;preview=null;message='';}catch(e){failed=true;message=String(e);}}
 function fresh(){if(!discard())return;id=undefined;revision=0;content={...initial};widgetCode='custom.calculator';version='1.0.0';dirty=false;preview=null;message='';}
 async function save(){busy=true;try{const d=await api(id?`${endpoint}/${id}`:endpoint,id?'PUT':'POST',{widgetCode,version,content,revision}) as Draft;id=d.id;revision=d.revision;dirty=false;await list();failed=false;message=ja?'保存しました。':'Saved.';}catch(e){failed=true;message=e instanceof Error?e.message:String(e);}finally{busy=false;}}
 async function remove(){if(!id||!confirm(ja?'この下書きを削除しますか？':'Delete this draft?'))return;busy=true;try{await api(`${endpoint}/${id}`,'DELETE',{revision});dirty=false;fresh();await list();}catch(e){failed=true;message=String(e);}finally{busy=false;}}
 async function validate(){const metadata=JSON.parse(content.metadata);const definition={...metadata,id:widgetCode,version,runtime:{sdkVersion:1,html:content.html,css:content.css,javascript:content.javascript}};return await api('/v1/widget-validations','POST',definition) as WidgetDefinition;}
 async function execute(){busy=true;try{preview=await validate();previewSize=preview.sizes.includes(previewSize)?previewSize:preview.sizes[0];run++;message='';}catch(e){failed=true;message=e instanceof Error?e.message:String(e);}finally{busy=false;}}
 async function download(){busy=true;failed=false;try{const definition=await validate(),url=URL.createObjectURL(new Blob([JSON.stringify({schemaVersion:2,widgets:[definition]},null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`${widgetCode}-${version}.json`;a.click();URL.revokeObjectURL(url);message=ja?'管理者にHTTPSカタログの登録と利用許可を依頼してください。':'Ask an administrator to register the HTTPS catalogue and approve this version.';}catch(e){failed=true;message=String(e);}finally{busy=false;}}
 async function upload(event:Event){const input=event.currentTarget as HTMLInputElement,file=input.files?.[0];if(!file||!discard())return;try{if(file.size>4*1024*1024)throw Error('File exceeds 4 MiB');const json=JSON.parse(await file.text()),d=json.widgets?json.widgets[0]:json;if(d.schemaVersion!==2||!d.runtime)throw Error('SDK v2 JSON required');const {runtime,...metadata}=d;id=undefined;revision=0;widgetCode=d.id;version=d.version;content={metadata:JSON.stringify(metadata,null,2),html:runtime.html,css:runtime.css,javascript:runtime.javascript};dirty=true;preview=null;message='';}catch(e){failed=true;message=String(e);}input.value='';}
</script>
<svelte:window onbeforeunload={event=>{if(dirty){event.preventDefault();event.returnValue='';}}}/>
<div class="editor-page">
 {#if message}<StatusNotice {message} tone={failed?'error':'success'} onDismiss={()=>message=''}/>{/if}
 {#if allowed}
 <FormSection title={ja?'下書きと配布':'Drafts and distribution'} framed columns={2}>
  <SearchSelect label={ja?'下書きを開く':'Open draft'} field="widget-draft" value={String(id??'')} disabled={busy} options={[{value:'',label:ja?'下書きを選択':'Select draft'},...drafts.map(d=>({value:String(d.id),label:`${d.widgetCode} · ${d.version}`}))]} onSelect={value=>{if(value)void load(Number(value));}}/>
  <div class="draft-actions">
   <ModalActionButton label={ja?'新規':'New'} variant="secondary" size="field" onclick={fresh} disabled={busy}/>
   <ModalActionButton label={(ja?'保存':'Save')+(dirty?' *':'')} size="field" onclick={()=>void save()} disabled={busy||!operations.includes(id?'widgets.drafts.update':'widgets.drafts.create')}/>
   <ModalActionButton label={ja?'削除':'Delete'} variant="danger" size="field" onclick={()=>void remove()} disabled={!id||busy||!operations.includes('widgets.drafts.delete')}/>
  </div>
  <div><FileInput label={ja?'JSON取込':'Import JSON'} field="widget-import" accept="application/json,.json" onchange={upload} disabled={busy}/></div>
  <div class="export-action"><ModalActionButton label={ja?'JSON出力':'Export JSON'} variant="secondary" size="field" onclick={()=>void download()} disabled={busy}/></div>
 </FormSection>
 <div class="editor-columns">
  <FormSection title={ja?'コード':'Code'} framed columns={2}>
   <FormInput label={ja?'ウィジェットID':'Widget ID'} field="widget-code" value={widgetCode} placeholder="custom.calculator" onValueChange={value=>{widgetCode=value;dirty=true;}}/>
   <FormInput label={ja?'バージョン':'Version'} field="widget-version" value={version} placeholder="1.0.0" onValueChange={value=>{version=value;dirty=true;}}/>
   <div class="wide code-panel">
    <PageTabs bind:active={tab} label={ja?'編集対象':'Source files'} idPrefix="widget-code" panelPrefix="widget-source" storageKey="widget-source-tab" tabs={sourceKeys.map(key=>({id:key,label:sourceLabel(key)}))}/>
    {#each sourceKeys as key}
     <div id={`widget-source-${key}`} role="tabpanel" aria-labelledby={`widget-code-${key}-tab`} hidden={tab!==key}>
      {#if tab===key}<CodeEditor field={`widget-source-input-${key}`} label={sourceLabel(key)} language={key==='metadata'?'json':key as CodeLanguage} bind:value={content[key]} onValueChange={()=>dirty=true}/>{/if}
     </div>
    {/each}
    <p class="field-hint">{ja?'独自処理は sph.ready() 内からSDKを利用します。保存は本人専用です。プレビューは実データを書き換えません。':'Use the SDK from sph.ready(). Drafts are private. Preview storage is separate from live data.'}</p>
    <a href="/widget-sdk" target="_blank" rel="noopener noreferrer">{ja?'SDK・配布手順':'SDK and distribution guide'}</a>
   </div>
  </FormSection>
  <FormSection title={ja?'プレビュー':'Preview'} framed columns={2}>
   {#snippet action()}<div class="preview-actions"><ModalActionButton label={ja?'実行':'Run'} size="field" onclick={()=>void execute()} disabled={busy}/><ModalActionButton label={ja?'停止':'Stop'} variant="secondary" size="field" onclick={()=>preview=null}/></div>{/snippet}
   <SearchSelect label={ja?'言語':'Language'} field="widget-preview-language" value={previewLanguage} searchable={false} options={[{value:'ja',label:'日本語'},{value:'en',label:'English'}]} onSelect={value=>previewLanguage=value as 'ja'|'en'}/>
   <SearchSelect label={ja?'テーマ':'Theme'} field="widget-preview-theme" value={previewTheme} searchable={false} options={[{value:'light',label:ja?'ライト':'Light'},{value:'dark',label:ja?'ダーク':'Dark'}]} onSelect={value=>previewTheme=value}/>
   {#if preview}<SearchSelect label={ja?'サイズ':'Size'} field="widget-preview-size" value={previewSize} searchable={false} options={preview.sizes.map(value=>({value,label:value}))} onSelect={value=>previewSize=value}/>{/if}
   <div class="wide preview-panel">{#if preview}{#key run}<div class="editor-preview" data-theme={previewTheme}><RuntimeWidget definition={preview} size={previewSize} preview={true} language={previewLanguage} theme={previewTheme}/></div>{/key}{:else}<p class="field-hint">{ja?'「実行」でプレビューを開始します。':'Choose Run to start the preview.'}</p>{/if}</div>
  </FormSection>
 </div>
 {/if}
</div>
<style>
 .editor-page{display:grid;min-width:0;gap:16px}.editor-columns{display:grid;grid-template-columns:minmax(0,3fr) minmax(0,2fr);gap:16px;align-items:start}
 .editor-columns>:global(.app-form-section){grid-column:auto}.draft-actions,.preview-actions{display:flex;flex-wrap:wrap;gap:8px;min-width:0}.draft-actions,.export-action{align-self:end}
 .wide{min-width:0}.editor-preview{border:1px solid var(--border);min-height:240px}.field-hint{margin:12px 0;color:var(--muted);font-size:var(--font-size-support);font-weight:400;line-height:1.6}a{color:var(--action-primary)}
 @media(max-width:1100px){.editor-columns{grid-template-columns:minmax(0,1fr)}}
</style>
