<script lang="ts">
 import {onMount} from 'svelte';
 import {localization} from '$lib/localization';
 import {COMPACT_CONTENT_QUERY} from '$lib/responsive-layout';
 import type {WidgetInstance,WidgetRecord,WidgetValues} from '$lib/widgets';
 import DetailModal from '../DetailModal.svelte';
 import ModalActionButton from '../ModalActionButton.svelte';
 import FormInput from '../FormInput.svelte';
 import FormTextarea from '../FormTextarea.svelte';
 import FormCheckbox from '../FormCheckbox.svelte';
 import DatePicker from '../DatePicker.svelte';
 import SearchSelect from '../SearchSelect.svelte';
 import StatusNotice from '../StatusNotice.svelte';
 let {instance}:{instance:WidgetInstance}=$props();
 let lang:'ja'|'en'=$derived($localization.displayLanguage==='ja'?'ja':'en');
 let definition=$derived(instance.definition.storage!);
 let fields=$derived((definition.fieldOrder??Object.keys(definition.fields).sort()).map(key=>[key,definition.fields[key]] as const));
 let text=$derived(lang==='ja'?{add:'追加',edit:'編集',remove:'削除',list:'一覧を表示',save:'保存',cancel:'キャンセル',close:'閉じる',empty:'保存されたデータはありません。',loading:'読み込み中…',failed:'保存できませんでした。入力内容は保持しています。',loadFailed:'読み込めませんでした。',conflict:'別の画面で更新されています。入力内容を控えて、一覧を再読み込みしてください。',capacity:'保存件数または容量の上限に達しています。',confirm:'このレコードを削除しますか？',previous:'前へ',next:'次へ',retry:'再読み込み',yes:'はい',no:'いいえ'}:{add:'Add',edit:'Edit',remove:'Delete',list:'Show list',save:'Save',cancel:'Cancel',close:'Close',empty:'No saved records.',loading:'Loading…',failed:'Unable to save. Your draft is preserved.',loadFailed:'Unable to load.',conflict:'Changed in another window. Keep your draft and reload the list.',capacity:'The storage count or capacity limit has been reached.',confirm:'Delete this record?',previous:'Previous',next:'Next',retry:'Reload',yes:'Yes',no:'No'});
 const base=()=>`/v1/employees/me/widget-instances/${instance.instanceKey}/records`;
 let pageSize=$state(10);
 let rows=$state<WidgetRecord[]>([]),total=$state(0),offset=$state(0),loading=$state(true),busy=$state(false),error=$state('');
 let allowed=$state({create:false,update:false,delete:false});
 let mode=$state<'closed'|'list'|'edit'>('closed');let selected=$state<WidgetRecord|null>(null);let draft=$state<Record<string,string|boolean>>({});let dateOpen=$state('');let returnFocus=$state<HTMLElement|null>(null);
 async function load(){loading=true;error='';try{const r=await fetch(base()+`?limit=${pageSize}&offset=${offset}&sortBy=createdAt&sortOrder=asc`,{cache:'no-store'});if(!r.ok)throw Error();const p=await r.json();rows=p.data;total=p.meta.total;allowed=p.meta.operations;}catch{rows=[];total=0;allowed={create:false,update:false,delete:false};error=text.loadFailed;}finally{loading=false;}}
 onMount(()=>{const query=matchMedia(COMPACT_CONTENT_QUERY);const update=()=>{pageSize=query.matches?20:10;offset=0;void load();};update();query.addEventListener('change',update);return()=>query.removeEventListener('change',update);});
 function display(key:string,values:WidgetValues){const value=values[key],field=definition.fields[key];if(value===undefined)return '—';if(field.type==='select')return field.options?.find(o=>o.value===value)?.label[lang]??String(value);if(typeof value==='boolean')return value?text.yes:text.no;return Array.isArray(value)?value.join(', '):String(value);}
 function openList(event:MouseEvent){returnFocus=event.currentTarget as HTMLElement;mode='list';error='';void load();}
 function edit(record:WidgetRecord|null,event?:MouseEvent){if(event&&mode==='closed')returnFocus=event.currentTarget as HTMLElement;selected=record;draft=Object.fromEntries(fields.map(([key,f])=>{const v=record?.values[key]??f.default;return [key,f.type==='boolean'?v===true:Array.isArray(v)?v.join('\n'):v===undefined?'':String(v)];}));error='';dateOpen='';mode='edit';}
 function close(){if(busy)return;mode='closed';error='';}
 async function save(){
  if(busy)return;busy=true;error='';
  try{
   const values:WidgetValues={};
   for(const [key,f] of fields){
    const value=draft[key];
    if(f.type==='boolean')values[key]=value===true;
    else if(f.type==='number'){if(String(value).trim()===''&&!f.required)continue;const n=Number(value);if(String(value).trim()===''||!Number.isFinite(n))throw Error();values[key]=n;}
    else if(f.type==='stringArray')values[key]=String(value).split(/\r?\n/).filter(v=>v.length>0);
    else if(String(value)===''&&!f.required&&['date','select'].includes(f.type))continue;
    else values[key]=String(value);
   }
   const r=await fetch(base()+(selected?'/'+encodeURIComponent(selected.recordKey):''),{method:selected?'PUT':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({values,...(selected?{revision:selected.revision}:{})})});
   if(!r.ok){error=r.status===409?text.conflict:r.status===422?text.capacity:text.failed;return;}
   offset=0;mode='list';await load();
  }catch{error=text.failed;}finally{busy=false;}
 }
 async function remove(record:WidgetRecord){if(busy||!confirm(text.confirm))return;busy=true;error='';try{const r=await fetch(base()+'/'+encodeURIComponent(record.recordKey),{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision:record.revision})});if(!r.ok){error=r.status===409?text.conflict:text.failed;return;}if(rows.length===1&&offset>0)offset=Math.max(0,offset-pageSize);await load();}catch{error=text.failed;}finally{busy=false;}}
</script>
<div class="records-widget" data-record-widget>
 <div class="record-toolbar">{#if allowed.create}<ModalActionButton label={text.add} onclick={event=>edit(null,event)} disabled={loading||busy}/>{/if}<ModalActionButton label={`${text.list} (${total})`} variant="secondary" onclick={openList}/></div>
 {#if loading}<p role="status">{text.loading}</p>{:else if error&&mode==='closed'}<StatusNotice message={error} tone="error" onDismiss={()=>error=''}/>{:else if !rows.length}<p>{text.empty}</p>{:else}<ul class="record-summary">{#each rows.slice(0,3) as row (row.recordKey)}<li title={display(definition.titleField,row.values)}>{display(definition.titleField,row.values)}</li>{/each}</ul>{/if}
</div>
{#if mode!=='closed'}
 <DetailModal title={mode==='edit'?(selected?text.edit:text.add):instance.definition.name[lang]} titleId={`records-title-${instance.instanceKey}`} closeLabel={text.close} {returnFocus} onClose={close}>
  <div class="record-body">
   {#if error}<StatusNotice message={error} tone="error" onDismiss={()=>error=''}/>{/if}
   {#if mode==='edit'}
    {#each fields as [key,f]}
     {@const label=f.label[lang]+(f.required?' *':'')}
     {#if f.type==='boolean'}<FormCheckbox {label} field={`record-${key}`} checked={draft[key]===true} disabled={busy} onChange={value=>draft[key]=value}/>
     {:else if f.type==='date'}<DatePicker {label} field={`record-${key}`} value={String(draft[key])} disabled={busy} open={dateOpen===key} onToggle={()=>dateOpen=dateOpen===key?'':key} onSelect={value=>{draft[key]=value;dateOpen='';}}/>
     {:else if f.type==='select'}<SearchSelect {label} field={`record-${key}`} value={String(draft[key])} disabled={busy} searchable={false} options={[...(!f.required?[{value:'',label:'—'}]:[]),...(f.options??[]).map(o=>({value:o.value,label:o.label[lang]}))]} onSelect={value=>draft[key]=value}/>
     {:else if f.type==='text'||f.type==='stringArray'}<FormTextarea {label} field={`record-${key}`} rows={5} maxlength={f.type==='text'?(f.maxLength??16000):undefined} disabled={busy} value={String(draft[key])} placeholder={lang==='ja'?`例：${f.label[lang]}`:`e.g. ${f.label[lang]}`} helpText={f.type==='stringArray'?(lang==='ja'?'1行に1項目を入力してください。':'Enter one value per line.'):''} onValueChange={value=>draft[key]=value}/>
     {:else}<FormInput {label} field={`record-${key}`} type={f.type==='number'?'number':'text'} value={String(draft[key])} disabled={busy} maxlength={f.maxLength??1000} min={f.min===undefined?undefined:String(f.min)} max={f.max===undefined?undefined:String(f.max)} step={f.type==='number'?'any':undefined} onValueChange={value=>draft[key]=value}/>{/if}
    {/each}
   {:else}
    <div class="record-toolbar">{#if allowed.create}<ModalActionButton label={text.add} onclick={()=>edit(null)} disabled={busy||loading}/>{/if}<ModalActionButton label={text.retry} variant="secondary" onclick={()=>void load()} disabled={loading||busy}/></div>
    {#if loading}<p role="status">{text.loading}</p>{:else if !rows.length}<p>{text.empty}</p>{:else}
     {#each rows as row (row.recordKey)}<article class="record-row" data-record-key={row.recordKey}><dl>{#each definition.listFields as key}<div><dt>{definition.fields[key].label[lang]}</dt><dd>{display(key,row.values)}</dd></div>{/each}</dl><div class="record-toolbar">{#if allowed.update}<ModalActionButton label={text.edit} variant="secondary" disabled={busy} onclick={()=>edit(row)}/>{/if}{#if allowed.delete}<ModalActionButton label={text.remove} variant="danger" disabled={busy} onclick={()=>void remove(row)}/>{/if}</div></article>{/each}
    {/if}
    <div class="record-toolbar"><ModalActionButton label={text.previous} variant="secondary" disabled={offset===0||loading||busy} onclick={()=>{offset=Math.max(0,offset-pageSize);void load();}}/><span>{total===0?0:offset+1}–{Math.min(offset+pageSize,total)} / {total}</span><ModalActionButton label={text.next} variant="secondary" disabled={offset+pageSize>=total||loading||busy} onclick={()=>{offset+=pageSize;void load();}}/></div>
   {/if}
  </div>
  {#snippet actions()}{#if mode==='edit'}<ModalActionButton label={text.cancel} variant="secondary" disabled={busy} onclick={()=>{mode='list';error='';}}/><ModalActionButton label={text.save} disabled={busy} onclick={()=>void save()}/>{:else}<ModalActionButton label={text.close} variant="secondary" disabled={busy} onclick={close}/>{/if}{/snippet}
 </DetailModal>
{/if}
<style>
 .records-widget{height:100%;min-height:0;display:flex;flex-direction:column;gap:8px;overflow:hidden}.record-toolbar{display:flex;align-items:center;flex-wrap:wrap;gap:8px;flex:none}.record-summary{margin:0;padding-left:20px;min-height:0;overflow:hidden}.record-summary li{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;line-height:1.7}.record-body{display:grid;gap:16px;min-width:0}.record-row{padding:12px;border:1px solid var(--border);border-radius:6px;min-width:0}.record-row dl{display:grid;gap:8px;margin:0 0 12px}.record-row dt{color:var(--muted);font-size:var(--font-size-support)}.record-row dd{margin:2px 0 0;white-space:pre-wrap;overflow-wrap:anywhere}p{color:var(--muted)}
</style>
