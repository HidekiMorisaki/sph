<script lang="ts">
 import ActionButton from '#lib/components/ActionButton.svelte';
 import ModalActionButton from '#lib/components/ModalActionButton.svelte';
 import WorkflowFields from './WorkflowFields.svelte';
 import Control from './WorkflowControl.svelte';
 import FormCheckbox from '#lib/components/FormCheckbox.svelte';
 import '#lib/styles/workflow.css';
 import FormInput from '#lib/components/FormInput.svelte';
 import DatePicker from '#lib/components/DatePicker.svelte';
 import SearchSelect from '#lib/components/SearchSelect.svelte';
 import {fieldGrid,condition,isContainer,isDisplay,isRepeat,defaults,fieldsOf,type Field,type Values,type Directory} from '#lib/workflow-form.js';
 import {choose,workflowError,WorkflowError,type Attachment} from '#lib/workflow-client.js';
 let {fields,values=$bindable({}),context={},readonly=false,ja=true,directory,attachments=[],applicant='',errors={},path='',gridLayout=true,tableCell=false,upload,download}:{
 fields:Field[];gridLayout?:boolean;tableCell?:boolean;values?:Values;context?:Values;readonly?:boolean;ja?:boolean;directory:Directory;attachments?:Attachment[];applicant?:string;errors?:Record<string,string>;path?:string;
 upload?:(files:File[])=>Promise<Attachment[]>;download?:(file:Attachment,preview:boolean)=>void;
 }=$props();
 let useGrid=$derived(gridLayout&&fields.some(f=>f.grid!==undefined));
 let positioned=$derived(useGrid?fieldGrid(fields).sort((a,b)=>a.grid.row-b.grid.row||a.grid.column-b.grid.column):fields.map(field=>({field,grid:undefined})));
 let busy=$state(''),uploadError=$state('');
 let calendar=$state(''),activePage=$state('');
 let current=$derived(context),pages=$derived(fields.filter(f=>f.type==='page'&&condition(f.visibleWhen,current)));
 let pageId=$derived(pages.some(f=>f.id===activePage)?activePage:pages[0]?.id);
 const t=(a:string,b:string)=>choose(ja,a,b);
 function set(f:Field,v:unknown){values={...values,[f.id]:v};}
 function rows(f:Field):Values[]{return Array.isArray(values[f.id])?values[f.id] as Values[]:[];}
 function changeRows(f:Field,index:number,row:Values){set(f,rows(f).map((r,i)=>i===index?row:r));}
 function choices(f:Field){return f.type==='employee'?directory.employees:f.type==='branch'?directory.branches:directory.departments;}
 function range(f:Field,index:number){return String(values[f.id]??'').split('/')[index]??'';}
 function setRange(f:Field,index:number,v:string){const parts=[range(f,0),range(f,1)];parts[index]=v;set(f,parts.join('/'));}
 function display(v:unknown){if(Array.isArray(v))return v.join('、');if(typeof v==='boolean')return v?t('はい','Yes'):t('いいえ','No');return String(v??'—');}
 async function addFiles(f:Field,input:HTMLInputElement){
  if(!input.files?.length||!upload)return;busy=f.id;uploadError='';
  try{
   const selected=Array.from(input.files);
   if(selected.some(file=>file.size>10*1024*1024)||attachments.length+selected.length>20||attachments.reduce((size,file)=>size+file.size,0)+selected.reduce((size,file)=>size+file.size,0)>50*1024*1024)throw new WorkflowError('ATTACHMENT_LIMIT');
   const files=await upload(selected);set(f,[...(Array.isArray(values[f.id])?values[f.id] as string[]:[]),...files.map(x=>x.attachmentKey)]);
  }
  catch(e){uploadError=e instanceof WorkflowError&&e.code==='ATTACHMENT_LIMIT'?workflowError(e.code,ja):t('添付できませんでした。形式・容量と接続を確認してください。','Upload failed. Check file type, size and connection.');}
  finally{busy='';input.value='';}
 }
</script>
{#if pages.length}<nav class="form-pages" aria-label={t('フォームのページ','Form pages')}>{#each pages as f,i}<ActionButton type="button" aria-pressed={pageId===f.id} onclick={()=>activePage=f.id} variant="secondary" data-button-scope="button-0861d048b1">{i+1}. {f.label}{#if Object.keys(errors).some(key=>fieldsOf(f.children??[]).some(c=>key===c.id||key.startsWith(c.id+'.')))} <span class="required">!</span>{/if}</ActionButton>{/each}</nav>{/if}
<div class="workflow-fields-wrap"><div class="workflow-fields" class:grid-layout={useGrid}>
 {#each positioned as item(item.field.id)}
  {@const f=item.field}
  {#if condition(f.visibleWhen,current)&&(f.type!=='page'||f.id===pageId)}
   {@const required=f.required||!!f.requiredWhen&&condition(f.requiredWhen,current)}
   <div class="workflow-field" style={item.grid?`grid-column:${item.grid.column} / span ${item.grid.width};grid-row:${item.grid.row} / span ${item.grid.height}`:undefined} class:table-cell={tableCell} class:wide={isContainer(f)||f.type==='textarea'} data-field={f.id}>
    {#if f.type==='divider'}<hr />
    {:else if f.type==='heading'||f.type==='description'}{#if f.type==='heading'}<h3>{f.label}</h3>{:else}<p class="description">{f.label}</p>{/if}
    {:else if isContainer(f)}
     <fieldset class:repeating={isRepeat(f)}>
      <legend>{f.label}{#if required}<span class="required"> *</span>{/if}</legend>
      {#if f.help}<p class="help">{f.help}</p>{/if}
      {#if f.type==='table'}
       <div class="line-table-scroll"><table class="line-table"><thead><tr><th scope="col">#</th>{#each f.children??[] as child}<th scope="col">{child.label}{#if child.required||child.requiredWhen&&rows(f).some((_,i)=>condition(child.requiredWhen,{...current,...((context[f.id] as Values[]|undefined)?.[i]??{})}))}<span class="required"> *</span>{/if}</th>{/each}</tr></thead><tbody>{#each rows(f) as row,i}<tr><th scope="row">{i+1}{#if !readonly&&i>=Math.max(f.minRows??0,required?1:0)}<ModalActionButton type="button" class="secondary" aria-label={t('行を削除：','Remove row: ')+(i+1)} onclick={()=>set(f,rows(f).filter((_,j)=>i!==j))} variant="secondary" data-button-scope="button-0861d048b1">×</ModalActionButton>{/if}</th>{#each f.children??[] as child}<td><WorkflowFields tableCell gridLayout={false} fields={[child]} bind:values={()=>rows(f)[i],v=>changeRows(f,i,v)} {readonly} {ja} {directory} {attachments} {applicant} {errors} path={path+f.id+'.'+i+'.'} context={{...current,...((context[f.id] as Values[]|undefined)?.[i]??{})}} {upload} {download}/></td>{/each}</tr>{/each}</tbody></table></div>
       {#if !readonly}<ModalActionButton type="button" class="secondary" disabled={rows(f).length>=(f.maxRows??100)} onclick={()=>set(f,[...rows(f),defaults(f.children??[])])} variant="secondary" data-button-scope="button-0861d048b1">＋ {t('行を追加','Add row')}</ModalActionButton>{/if}
      {:else if isRepeat(f)}
       {#each rows(f) as row,i}
        <section class="repeat-row">{#if !readonly&&i>=Math.max(f.minRows??0,required?1:0)}<header><ModalActionButton type="button" class="secondary" aria-label={t('行を削除：','Remove row: ')+f.label+' '+(i+1)} onclick={()=>set(f,rows(f).filter((_,j)=>i!==j))} variant="secondary" data-button-scope="button-0861d048b1">{t('削除','Remove')}</ModalActionButton></header>{/if}
         <WorkflowFields fields={f.children??[]} bind:values={()=>rows(f)[i],v=>changeRows(f,i,v)} {readonly} {ja} {directory} {attachments} {applicant} {errors} path={path+f.id+'.'+i+'.'} context={{...current,...((context[f.id] as Values[]|undefined)?.[i]??{})}} {upload} {download} />
        </section>
       {/each}
       {#if !readonly}<ModalActionButton type="button" class="secondary" disabled={rows(f).length>=(f.maxRows??100)} onclick={()=>set(f,[...rows(f),defaults(f.children??[])])} variant="secondary" data-button-scope="button-0861d048b1">＋ {t('追加','Add')}</ModalActionButton>{/if}
      {:else}<WorkflowFields fields={f.children??[]} bind:values {readonly} {ja} {directory} {attachments} {applicant} {errors} {path} context={current} {upload} {download}/>{/if}
     </fieldset>
    {:else}
     {#if readonly||!['text','integer','decimal','money','percent','date','datetime','time','dateRange','datetimeRange','timeRange','select','employee','branch','department','textarea','email','phone','url','checkbox','boolean'].includes(f.type)}<label id={path+f.id+'-label'} for={path+f.id}>{f.label}{#if required}<span class="required"> *</span>{/if}{#if f.type==='percent'} (%) {/if}</label>{/if}
     {#if f.help}<p class="help" id={path+f.id+'-help'}>{f.help}</p>{/if}
     {#if f.type==='applicant'}<p class="read-value">{applicant||t('申請者を自動表示','Applicant appears automatically')}</p>
     {:else if ['attachment','image'].includes(f.type)}
      <ul class="files">{#each (Array.isArray(values[f.id])?values[f.id] as string[]:[]) as fileKey}
       {@const file=attachments.find(a=>a.attachmentKey===fileKey)}
       <li>{#if file}<ModalActionButton multiline type="button" class="file-link" onclick={()=>download?.(file,file.mime.startsWith('image/'))} variant="secondary" data-button-scope="button-0861d048b1">{file.name}</ModalActionButton><small>{Math.ceil(file.size/1024)} KiB</small>{:else}<span>{t('添付ファイル','Attachment')}</span>{/if}
        {#if !readonly}<ModalActionButton type="button" class="secondary" aria-label={t('添付を外す','Remove attachment')} onclick={()=>set(f,(values[f.id] as string[]).filter(k=>k!==fileKey))} variant="secondary" data-button-scope="button-0861d048b1">×</ModalActionButton>{/if}
       </li>
      {/each}</ul>
      {#if !readonly}<div class="attachment-picker"><ModalActionButton id={path+f.id+'-choose'} size="field" type="button" aria-labelledby={path+f.id+'-label '+path+f.id+'-choose'} disabled={!!busy} onclick={()=>document.getElementById(path+f.id)?.click()} variant="secondary">{t('ファイル選択','Choose files')}</ModalActionButton><input hidden id={path+f.id} type="file" multiple accept={f.type==='image'?'image/jpeg,image/png,image/webp':'image/jpeg,image/png,image/webp,application/pdf'} disabled={!!busy} onchange={e=>addFiles(f,e.currentTarget)} /></div>{/if}
     {:else if readonly||f.type==='calculated'}
      <p class="read-value">{['employee','branch','department'].includes(f.type)?choices(f).find(c=>String(c.id)===String(values[f.id]))?.name??display(values[f.id]):display(f.type==='calculated'?context[f.id]:values[f.id])}</p>
     {:else if f.type==='textarea'}<Control field={path+f.id} kind="textarea" label={f.label} required={!!required} value={String(values[f.id]??'')} placeholder={f.placeholder??''} rows={4} onValueChange={v=>set(f,v)}/>
     {:else if ['select','employee','branch','department'].includes(f.type)}
      <SearchSelect field={path+f.id} label={f.label} {required} value={String(values[f.id]??'')} options={[{value:'',label:t('選択してください','Select')},...(f.type==='select'?(f.options??[]).map(o=>({value:o,label:o})):choices(f).map(c=>({value:String(c.id),label:c.name})))]} onSelect={v=>set(f,v)}/>
     {:else if f.type==='radio'||f.type==='multiSelect'}
      <div class="choices" role="group" aria-labelledby={path+f.id+'-label'}>{#each f.options??[] as o,i}<FormCheckbox field={path+f.id+'-option-'+i} type={f.type==='radio'?'radio':'checkbox'} name={path+f.id} label={o} checked={f.type==='radio'?values[f.id]===o:Array.isArray(values[f.id])&&(values[f.id] as string[]).includes(o)} onChange={checked=>f.type==='radio'?set(f,o):set(f,checked?[...(values[f.id] as string[]??[]),o]:(values[f.id] as string[]??[]).filter(x=>x!==o))}/>{/each}</div>
     {:else if f.type==='checkbox'}<FormCheckbox field={path+f.id} label={f.label} required={!!required} checked={values[f.id]===true} onChange={v=>set(f,v)}/>
     {:else if f.type==='boolean'}<Control field={path+f.id} label={f.label} required={!!required} kind="select" value={values[f.id]===true?'true':values[f.id]===false?'false':''} options={[{value:'',label:t('選択してください','Select')},{value:'true',label:t('はい','Yes')},{value:'false',label:t('いいえ','No')}]} onValueChange={v=>set(f,v===''?null:v==='true')}/>
     {:else if f.type.endsWith('Range')}
      <div class="range">{#each [0,1] as index}{@const field=path+f.id+'-'+index}{@const label=f.label+' '+(index===0?t('開始','Start'):t('終了','End'))}{#if f.type==='timeRange'}<FormInput {field} {label} type="time" {required} value={range(f,index)} onValueChange={v=>setRange(f,index,v)}/>{:else}<DatePicker {field} {label} {required} value={range(f,index)} mode={f.type==='dateRange'?'date':'datetime'} open={calendar===field} onToggle={()=>calendar=calendar===field?'':field} onSelect={v=>{setRange(f,index,v);calendar='';}}/>{/if}{/each}</div>
     {:else if f.type==='date'||f.type==='datetime'}
      <DatePicker field={path+f.id} label={f.label} value={String(values[f.id]??'')} {required} mode={f.type==='date'?'date':'datetime'} open={calendar===path+f.id} onToggle={()=>calendar=calendar===path+f.id?'':path+f.id} onSelect={v=>{set(f,v);calendar='';}}/>
     {:else if ['text','integer','decimal','money','percent','time'].includes(f.type)}
      <FormInput field={path+f.id} label={f.label+(f.type==='percent'?' (%)':'')} {required} type={f.type==='time'?'time':'text'} inputmode={['integer','decimal','money','percent'].includes(f.type)?'decimal':'text'} value={String(values[f.id]??'')} placeholder={f.placeholder??''} onValueChange={v=>set(f,v)}/>
     {:else}<Control field={path+f.id} label={f.label} kind={f.type==='email'?'email':f.type==='url'?'url':f.type==='phone'?'tel':'text'} required={!!required} value={String(values[f.id]??'')} placeholder={f.placeholder??''} onValueChange={v=>set(f,v)}/>
     {/if}
    {/if}
    {#if errors[path+f.id]}<p role="alert" class="field-error">{workflowError(errors[path+f.id],ja)}</p>{/if}
   </div>
  {/if}
 {/each}
 {#if uploadError}<p role="alert" class="field-error">{uploadError}</p>{/if}
</div></div>
<style>
 .line-table tbody th{vertical-align:middle}
 @media(min-width:701px){
  .table-cell>label,.table-cell>:global(.form-input-field>span:first-child),.table-cell>:global(.form-textarea-field>span:first-child),.table-cell>:global(.form-select-field>span:first-child),.table-cell>:global(.custom-date>.date-label),.table-cell>:global(.form-checkbox-field>span){position:absolute!important;width:1px!important;height:1px!important;padding:0!important;margin:-1px!important;overflow:hidden!important;clip-path:inset(50%)!important;white-space:nowrap!important;border:0!important}
 }

 .files:empty{display:none}.attachment-picker{display:flex;align-items:center;min-width:0}
 .form-pages{display:flex;flex-wrap:wrap;gap:var(--sph-space-8px);margin:0 0 var(--sph-space-16px)}.form-pages :global(button[data-button-scope="button-0861d048b1"]){padding:var(--sph-space-8px) var(--sph-space-12px);background:var(--surface-hover);color:var(--text);border:1px solid var(--border);border-radius:var(--sph-radius-4px)}.form-pages :global(button[aria-pressed=true][data-button-scope="button-0861d048b1"]){background:var(--action-primary);color:white}.line-table-scroll{max-width:100%;overflow-x:auto;margin-bottom:var(--sph-space-12px)}.line-table{width:100%;border-collapse:collapse}.line-table th,.line-table td{padding:var(--sph-space-10px);vertical-align:top;text-align:left;border-bottom:1px solid var(--border)}.line-table td{min-width:160px}.line-table th{font-size:var(--font-size-support)}.line-table :global(.workflow-fields){display:block}.range>:global(*){min-width:0;flex:1}@media(max-width:700px){.line-table,.line-table tbody,.line-table tr,.line-table td,.line-table th{display:block;min-width:0;width:100%;box-sizing:border-box}.line-table thead{display:none}.line-table tr{margin-bottom:var(--sph-space-16px);border:1px solid var(--border);border-radius:var(--sph-radius-6px)}.line-table th{display:flex;justify-content:space-between}.range{display:grid!important;grid-template-columns:minmax(0,1fr)}} .workflow-fields{display:grid;gap:var(--sph-space-18px);grid-template-columns:repeat(2,minmax(0,1fr))}.workflow-field{min-width:0}.wide{grid-column:1/-1}label{display:block;font-size:var(--font-size-support);color:var(--text-secondary);margin-bottom:var(--sph-space-6px)}.required,.field-error{color:var(--danger)}input[type=file]{width:100%;min-width:0;box-sizing:border-box;background:var(--surface);color:var(--text);border:1px solid var(--border);border-radius:var(--sph-radius-4px);padding:var(--sph-space-8px) var(--sph-space-10px);min-height:36px;font:inherit}input:focus-visible{outline:2px solid var(--action-primary);outline-offset:2px}fieldset{margin:0;min-width:0;padding:var(--sph-space-16px);border:1px solid var(--border);border-radius:var(--sph-radius-6px)}legend{font-size:var(--font-size-support);padding:0 var(--sph-space-6px)}.repeat-row{padding:var(--sph-space-12px) 0}.repeat-row+.repeat-row{border-top:1px solid var(--border-light)}.repeat-row header{display:flex;justify-content:flex-end;align-items:center;gap:var(--sph-space-8px);margin-bottom:var(--sph-space-12px)}.help,small{font-size:var(--font-size-support);color:var(--muted)}.help{margin:0 0 var(--sph-space-8px)}.read-value,.description{white-space:pre-wrap;overflow-wrap:anywhere;margin:0;min-height:36px}.choices{display:flex;flex-wrap:wrap;gap:var(--sph-space-8px) var(--sph-space-16px)}.range{display:flex;gap:var(--sph-space-8px);align-items:center}:global(.secondary[data-button-scope="button-0861d048b1"]){padding:var(--sph-space-6px) var(--sph-space-10px);background:var(--surface-hover);color:var(--text);border:1px solid var(--border);border-radius:var(--sph-radius-4px)}.files{padding:0;list-style:none;display:grid;gap:var(--sph-space-6px)}.files li{display:flex;gap:var(--sph-space-8px);align-items:center;overflow-wrap:anywhere}:global(.file-link[data-button-scope="button-0861d048b1"]){background:transparent;color:var(--action-primary);text-align:left;overflow-wrap:anywhere}.field-error{font-size:var(--font-size-support)}hr{border:0;border-top:1px solid var(--border)}@media(max-width:700px){.workflow-fields{grid-template-columns:minmax(0,1fr)}input,:global(button[data-button-scope="button-0861d048b1"]){min-height:44px}.range{flex-wrap:wrap}fieldset{padding:var(--sph-space-12px)}}
 .workflow-fields-wrap{container-type:inline-size;min-width:0}.workflow-fields.grid-layout{grid-template-columns:repeat(8,minmax(0,1fr));grid-auto-rows:minmax(0,auto);align-items:start}.grid-layout>.workflow-field{height:auto;box-sizing:border-box;overflow-wrap:anywhere}.grid-layout :global(.form-input-field),.grid-layout :global(.form-select-field){min-width:0}@media(max-width:700px){.workflow-fields.grid-layout{grid-template-columns:minmax(0,1fr);grid-auto-rows:auto}.grid-layout>.workflow-field{grid-column:1/-1!important;grid-row:auto!important;height:auto}}

 @container(max-width:700px){.workflow-fields,.workflow-fields.grid-layout{grid-template-columns:minmax(0,1fr);grid-auto-rows:auto}.grid-layout>.workflow-field{grid-column:1/-1!important;grid-row:auto!important;height:auto}}
</style>
