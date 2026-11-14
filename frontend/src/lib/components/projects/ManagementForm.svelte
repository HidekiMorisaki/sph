<script lang="ts">
 import DetailModal from '#lib/components/DetailModal.svelte';
 import FormSection from '#lib/components/FormSection.svelte';
 import FormInput from '#lib/components/FormInput.svelte';
 import FormTextarea from '#lib/components/FormTextarea.svelte';
 import SearchSelect from '#lib/components/SearchSelect.svelte';
 import SearchMultiSelect from '#lib/components/SearchMultiSelect.svelte';
 import DatePicker from '#lib/components/DatePicker.svelte';
 import ActionButton from '#lib/components/ActionButton.svelte';
 import StatusNotice from '#lib/components/StatusNotice.svelte';
 import {localization} from '#lib/localization.js';
 import {untrack} from 'svelte';
 export type Field={key:string;label:string;kind?:'text'|'number'|'date'|'month'|'textarea'|'select'|'multi';options?:Array<{value:string;label:string}>;value?:string|string[];required?:boolean;help?:string};
 let {title,fields,onSave,onClose}:{title:string;fields:Field[];onSave:(values:Record<string,string|string[]>)=>Promise<void>;onClose:()=>void}=$props();
 let values=$state<Record<string,string|string[]>>(untrack(()=>Object.fromEntries(fields.map(f=>[f.key,f.value??(f.kind==='multi'?[]:'')])))),busy=$state(false),error=$state('');
 const original=untrack(()=>JSON.stringify(values));const tr=(j:string,e:string)=>$localization.displayLanguage==='ja'?j:e;
 let openDate=$state('');
 function close(){if(!busy&&(JSON.stringify(values)===original||confirm(tr('未保存の入力を破棄しますか？','Discard unsaved changes?'))))onClose();}
 async function save(){busy=true;error='';try{await onSave(values);onClose();}catch(e){error=e instanceof Error?e.message:tr('保存できませんでした。','Save failed.');}finally{busy=false;}}
</script>
<DetailModal {title} titleId="management-form-title" closeLabel={tr('閉じる','Close')} onClose={close}>
{#if error}<StatusNotice tone="error" message={error} onDismiss={()=>error=''}/>{/if}
<FormSection {title} framed columns={2}>
{#each fields as f}{#snippet help()}<p>{f.help}</p>{/snippet}<div class:wide={f.kind==='textarea'||f.kind==='multi'}>
{#if f.kind==='multi'}<SearchMultiSelect label={f.label} field={'management-'+f.key} values={values[f.key] as string[]} options={f.options??[]} disabled={busy} onChange={v=>values[f.key]=v}/>
{:else if f.kind==='select'}<SearchSelect label={f.label} field={'management-'+f.key} value={String(values[f.key])} options={f.options??[]} required={f.required??false} disabled={busy} onSelect={v=>values[f.key]=v}/>
{:else if f.kind==='textarea'}<FormTextarea label={f.label} field={'management-'+f.key} value={String(values[f.key])} required={f.required??false} disabled={busy} onValueChange={v=>values[f.key]=v}/>
{:else if f.kind==='date'||f.kind==='month'}<DatePicker label={f.label} field={'management-'+f.key} value={String(values[f.key])} mode={f.kind} required={f.required??false} disabled={busy} helpText={f.help??''} open={openDate===f.key} onToggle={()=>openDate=openDate===f.key?'':f.key} onSelect={v=>{values[f.key]=v;openDate='';}}/>
{:else}<FormInput label={f.label} field={'management-'+f.key} value={String(values[f.key])} type={f.kind==='number'?'number':'text'} help={f.help?help:undefined} required={f.required??false} disabled={busy} onValueChange={v=>values[f.key]=v}/>{/if}</div>{/each}
</FormSection>
{#snippet actions()}<ActionButton label={tr('キャンセル','Cancel')} disabled={busy} onclick={close}/><ActionButton label={tr('保存','Save')} variant="primary" disabled={busy} onclick={()=>void save()}/>{/snippet}
</DetailModal>
<style>.wide{grid-column:1/-1;min-width:0}</style>
