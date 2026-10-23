<script lang="ts">
 import type {WidgetStorage,WidgetValues} from '$lib/widgets';
 import FormInput from '../FormInput.svelte';
 import FormTextarea from '../FormTextarea.svelte';
 import FormCheckbox from '../FormCheckbox.svelte';
 import SearchSelect from '../SearchSelect.svelte';
 import SearchMultiSelect from '../SearchMultiSelect.svelte';
 import DatePicker from '../DatePicker.svelte';
 const id=$props.id();
 let {schema,values,lang,disabled=false,onChange}:{schema:WidgetStorage;values:WidgetValues;lang:'ja'|'en';disabled?:boolean;onChange:(values:WidgetValues)=>void}=$props();
 function change(key:string,value:string|number|boolean|string[]|undefined){const next={...values};if(value===undefined)delete next[key];else next[key]=value;onChange(next);}
 function emptyTypedValue(key:string){return schema.fields[key].required?schema.fields[key].type==='number'?NaN:'':undefined;}
 let dateOpen=$state('');
</script>
<div class="runtime-fields">{#each schema.fieldOrder??Object.keys(schema.fields) as key}{@const field=schema.fields[key]}{@const value=values[key]??field.default??''}
 {@const fieldId=`${id}-${key}`}{@const label=field.label[lang]}
 {#if field.type==='select'}
 <SearchSelect {label} field={fieldId} {disabled} required={field.required} value={String(value)} searchable={false} options={(field.options??[]).map(option=>({value:option.value,label:option.label[lang]}))} onSelect={value=>change(key,value)}/>
 {:else if field.type==='boolean'}
 <FormCheckbox {label} field={fieldId} {disabled} required={field.required} checked={value===true} onChange={value=>change(key,value)}/>
 {:else if field.type==='stringArray'&&field.format==='timeZone'}
 <SearchMultiSelect {label} field={fieldId} {disabled} required={field.required} values={Array.isArray(value)?value:[]} options={[...new Set([...Intl.supportedValuesOf('timeZone'),'UTC',...(Array.isArray(value)?value:[])])].sort().map(zone=>({value:zone,label:zone.replaceAll('_',' ')}))} onChange={value=>change(key,value)}/>
 {:else if field.type==='text'||field.type==='stringArray'}
 <FormTextarea {label} field={fieldId} {disabled} required={field.required} rows={field.type==='text'?6:3} maxlength={field.type==='text'?field.maxLength:undefined} value={Array.isArray(value)?value.join('\n'):String(value)} placeholder={lang==='ja'?`例：${label}`:`e.g. ${label}`} helpText={field.type==='stringArray'?(lang==='ja'?'1行に1項目を入力してください。':'Enter one value per line.'):''} onValueChange={value=>change(key,field.type==='stringArray'?value.split(/\r?\n/).map(s=>s.trim()).filter(Boolean):value)}/>
 {:else if field.type==='date'}
 <DatePicker {label} field={fieldId} {disabled} required={field.required} value={String(value)} open={dateOpen===key} onToggle={()=>dateOpen=dateOpen===key?'':key} onSelect={value=>{change(key,value===''?emptyTypedValue(key):value);dateOpen='';}}/>
 {:else}
 <FormInput {label} field={fieldId} {disabled} required={field.required} type={field.type==='number'?'number':'text'} maxlength={field.maxLength} min={field.min===undefined?undefined:String(field.min)} max={field.max===undefined?undefined:String(field.max)} step={field.type==='number'?'any':undefined} value={String(value)} placeholder={field.type==='number'?'0':lang==='ja'?`例：${label}`:`e.g. ${label}`} onValueChange={value=>change(key,field.type==='number'?(value===''?emptyTypedValue(key):Number(value)):value)}/>
 {/if}{/each}</div>
<style>.runtime-fields{display:grid;gap:12px;min-width:0}</style>
