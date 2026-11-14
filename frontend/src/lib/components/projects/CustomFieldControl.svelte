<script lang="ts">
 import {localization} from '#lib/localization.js';
 import type {CustomField,CustomValue} from '#lib/project-custom-fields.js';
 import FormInput from '../FormInput.svelte';
 import FormTextarea from '../FormTextarea.svelte';
 import FormCheckbox from '../FormCheckbox.svelte';
 import SearchSelect from '../SearchSelect.svelte';
 import ActionButton from '../ActionButton.svelte';
 import ProjectDate from './ProjectDate.svelte';
 let {definition,value=null,disabled=false,prefix='custom',defaultValueMode=false,onchange}:{definition:CustomField;value?:CustomValue;disabled?:boolean;prefix?:string;defaultValueMode?:boolean;onchange:(v:CustomValue)=>void}=$props();
 let ja=$derived($localization.displayLanguage==='ja');
 let field=$derived(prefix+'-'+definition.id),label=$derived(definition.name+(definition.kind==='duration'?(ja?'（時間）':' (hours)'):''));
 let selected=$derived((Array.isArray(value)?value:[]) as number[]);
 let options=$derived(definition.options.filter(o=>defaultValueMode?o.enabled&&o.name.trim():o.enabled||selected.includes(o.id)||o.id===value));
</script>
<div class="custom-control">
 {#if definition.kind==='select'}
 <SearchSelect {label} {field} required={definition.required} disabled={disabled||defaultValueMode&&!options.length} value={String(value??'')} options={[...(defaultValueMode?[]:[{value:'',label:'-'}]),...options.map(o=>({value:String(o.id),label:o.name+(!o.enabled?(ja?'（無効）':' (inactive)'): '')}))]} onSelect={v=>onchange(v?Number(v):null)}/>
 {:else if definition.kind==='multiselect'}
 <fieldset {disabled}><legend>{label}{#if definition.required}<span class="required"> *</span>{/if}</legend>
 {#each options as o}<FormCheckbox field={field+'-'+o.id} label={o.name+(!o.enabled?(ja?'（無効）':' (inactive)'):'')} checked={selected.includes(o.id)} disabled={disabled||!o.enabled&&!selected.includes(o.id)} onChange={checked=>onchange(checked?[...selected,o.id]:selected.filter(id=>id!==o.id))}/>{/each}
 </fieldset>
 {:else if definition.kind==='boolean'}
 <FormCheckbox label={label+(definition.required?' *':'')} {field} {disabled} checked={value===true} onChange={onchange}/><small>{value===null?(ja?'未設定':'Not set'):value?(ja?'はい':'Yes'):(ja?'いいえ':'No')}</small>{#if value!==null}<ActionButton label={ja?'未設定に戻す':'Clear value'} {disabled} onclick={()=>onchange(null)}/>{/if}
 {:else if definition.kind==='date'}
 <ProjectDate label={label+(definition.required?' *':'')} {field} value={String(value??'')} {disabled} onchange={v=>onchange(v||null)}/>
 {:else if definition.kind==='textarea'}
 <FormTextarea {label} {field} value={String(value??'')} required={definition.required} maxlength={definition.maxLength??20000} {disabled} onValueChange={onchange}/>
 {:else}
 <FormInput {label} {field} value={String(value??'')} type={['integer','decimal','duration'].includes(definition.kind)?'number':'text'} min={definition.min===null?definition.kind==='duration'?'0':undefined:String(definition.min)} max={definition.max===null?undefined:String(definition.max)} step={definition.kind==='integer'?'1':definition.kind==='duration'?'0.01':'0.000001'} maxlength={definition.maxLength??5000} required={definition.required} {disabled} onValueChange={onchange}/>
 {/if}
 {#if definition.description}<small>{definition.description}</small>{/if}
</div>
<style>.custom-control{min-width:0;display:grid;gap:6px;align-content:start}fieldset{margin:0;min-width:0;border:1px solid var(--border);border-radius:4px;padding:12px;display:grid;gap:8px}legend,small{font-size:var(--font-size-support);color:var(--muted)}legend{color:var(--text)}.required{color:var(--danger)}small{white-space:pre-wrap;overflow-wrap:anywhere}</style>
