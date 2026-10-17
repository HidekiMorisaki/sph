<script lang="ts">
 import { localization } from '$lib/localization';
 import { searchMessages, searchChoiceLabel, operatorLabels, emptyGroup, localDateTime, zonedDateTime, type SearchGroup, type SearchNode, type SearchRule, type SearchField, type SearchContext } from '$lib/search';
 import SearchConditionGroup from './SearchConditionGroup.svelte';
 import SearchSelect from './SearchSelect.svelte';
 import SearchMultiSelect from './SearchMultiSelect.svelte';
 import DatePicker from './DatePicker.svelte';
 import FormInput from './FormInput.svelte';
 import { searchInputExample } from '$lib/search-input-examples';
 let {group,contexts,contextCode,depth=0,onChange,onRemove}:{group:SearchGroup;contexts:SearchContext[];contextCode:string;depth?:number;onChange:(group:SearchGroup)=>void;onRemove?:()=>void}=$props();
 const id=$props.id();
 let language=$derived($localization.displayLanguage);
 let t=$derived(searchMessages[language]);
 let active=$derived(contexts.find(c=>c.code===(group.context??contextCode)));
 let category=$state('');
 let nextContext=$state('');
 let dateOpen=$state('');
 let categories=$derived([...new Set(contexts.map(c=>c.category))]);
 function update(index:number,node:SearchNode){onChange({...group,children:group.children.map((child,i)=>i===index?node:child)});}
 function remove(index:number){onChange({...group,children:group.children.filter((_,i)=>i!==index)});}
 function initialRule(field:SearchField):SearchRule{return {kind:'rule',field:field.code,operator:'eq',value:field.type==='boolean'?true:field.type==='number'?0:field.choices?.[0]??''};}
 function addRule(){if(!active?.fields.length)return;onChange({...group,children:[...group.children,initialRule(active.fields[0])]});}
 function addGroup(){if(depth>=2)return;const context=contexts.find(c=>c.code===nextContext);const child:SearchGroup=context?.related?{...emptyGroup(),context:context.code,match:'some'}:emptyGroup();onChange({...group,children:[...group.children,child]});}
 function changeOperator(index:number,node:SearchRule,field:SearchField,operator:string){const value=['set','unset'].includes(operator)?undefined:operator==='relative'?[0,30]:operator==='between'?[field.type==='number'?0:'',field.type==='number'?0:'']:['in','notIn'].includes(operator)?[]:initialRule(field).value;update(index,{kind:'rule',field:node.field,operator,...(value===undefined?{}:{value})});}
 function changeValue(index:number,node:SearchRule,field:SearchField,value:string,part?:number){const next=field.type==='number'||node.operator==='relative'?(value===''?'':Number(value)):field.type==='datetime'?zonedDateTime(value,$localization.timeZone):value; if(part===undefined)update(index,{...node,value:next});else{const values=Array.isArray(node.value)?[...node.value]:['',''];values[part]=next;update(index,{...node,value:values});}}
</script>

<fieldset class="condition-group" data-depth={depth}>
 <legend>{active?.label[language]??t.invalid}{#if active?.private} · {t.private}{/if}</legend>
 <div class="group-heading">
  {#if group.context}<SearchSelect label={t.related} field={`${id}-match`} value={group.match??'some'} searchable={false} options={[{value:'some',label:t.some},{value:'none',label:t.noRelated}]} onSelect={match=>onChange({...group,match:match as 'some'|'none'})}/>{/if}
  <SearchSelect label={t.operator} field={`${id}-mode`} value={group.mode} searchable={false} options={[{value:'all',label:t.all},{value:'any',label:t.any}]} onSelect={mode=>onChange({...group,mode:mode as 'all'|'any'})}/>
  {#if onRemove}<button class="remove" type="button" onclick={onRemove}>{t.remove}</button>{/if}
 </div>
 {#each group.children as node,index}
  {#if node.kind==='group'}<SearchConditionGroup group={node} {contexts} contextCode={active?.code??contextCode} depth={depth+1} onChange={next=>update(index,next)} onRemove={()=>remove(index)}/>
  {:else}
   {@const field=active?.fields.find(f=>f.code===node.field)}
   <div class="condition-row">
    <SearchSelect label={t.field} field={`${id}-${index}-field`} value={node.field} options={active?.fields.map(f=>({value:f.code,label:f.label[language]}))??[]} onSelect={code=>{const f=active?.fields.find(f=>f.code===code);if(f)update(index,initialRule(f));}}/>
    {#if field}
     <SearchSelect label={t.operator} field={`${id}-${index}-operator`} value={node.operator} searchable={false} options={field.operators.map(code=>({value:code,label:operatorLabels[code]?.[language==='ja'?0:1]??code}))} onSelect={operator=>changeOperator(index,node,field,operator)}/>
     {#if !['set','unset'].includes(node.operator)}
      {#if field.type==='boolean'}<SearchSelect label={t.value} field={`${id}-${index}-value`} value={String(node.value)} searchable={false} options={[{value:'true',label:t.yes},{value:'false',label:t.no}]} onSelect={v=>update(index,{...node,value:v==='true'})}/>
      {:else if ['in','notIn'].includes(node.operator)}<SearchMultiSelect label={t.value} field={`${id}-${index}-value`} values={Array.isArray(node.value)?node.value.map(String):[]} options={field.options??field.choices?.map(v=>({value:v,label:searchChoiceLabel(v,active?.code??contextCode,language)}))??[]} placeholder={t.none} onChange={values=>update(index,{...node,value:values})}/>
      {:else if field.type==='choice'}<SearchSelect label={t.value} field={`${id}-${index}-value`} value={String(node.value??'')} options={field.options??field.choices?.map(v=>({value:v,label:searchChoiceLabel(v,active?.code??contextCode,language)}))??[]} onSelect={value=>update(index,{...node,value})}/>
      {:else}
       <div class="condition-values" style:--value-width={field.type==='datetime'&&node.operator!=='relative'?'224px':field.type==='date'&&node.operator!=='relative'?'156px':field.type==='number'||node.operator==='relative'?'112px':'208px'}>
        <span class="value-label">{node.operator==='relative'?t.days:t.value}</span>
        <div class="value-inputs">
        {#each (['between','relative'].includes(node.operator)?[0,1]:[undefined]) as part}
         {@const value=part===undefined?node.value:Array.isArray(node.value)?node.value[part]:''}
         {@const label=`${field.label[language]} ${part===undefined?t.value:part===0?t.from:t.until}`}
         {#if part===1}<span class="range-separator" aria-hidden="true">-</span>{/if}
         {#if (field.type==='date'||field.type==='datetime')&&node.operator!=='relative'}<DatePicker {label} showLabel={false} field={`${id}-${index}-${part??'single'}`} mode={field.type==='datetime'?'datetime':'date'} value={field.type==='datetime'?localDateTime(String(value??''),$localization.timeZone):String(value??'')} open={dateOpen===`${index}-${part}`} onToggle={()=>dateOpen=dateOpen===`${index}-${part}`?'':`${index}-${part}`} onSelect={v=>{changeValue(index,node,field,v,part);dateOpen='';}}/>
         {:else}<FormInput {label} showLabel={false} field={`${id}-${index}-${part??'single'}`} placeholder={searchInputExample(node.operator==='relative'?{code:'relative',type:'number'}:field,language,part)} type={field.type==='number'||node.operator==='relative'?'number':'text'} step="any" maxlength={Math.min(field.maxLength,500)} value={String(value??'')} onValueChange={value=>changeValue(index,node,field,value,part)}/>{/if}
        {/each}
        </div>
       </div>
      {/if}
     {/if}
    {:else}<span role="alert">{t.invalid}</span>{/if}
    <button class="remove" type="button" onclick={()=>remove(index)}>{t.remove}</button>
   </div>
  {/if}
 {/each}
 <div class="group-actions">
  <button type="button" onclick={addRule} disabled={depth>=3}>{t.add}</button>
  {#if depth<2}
   {#if !active?.related}<SearchSelect label={t.category} field={`${id}-category`} value={category} options={[{value:'',label:t.category},...categories.map(value=>({value,label:t[value as keyof typeof t]??value}))]} onSelect={value=>{category=value;nextContext='';}}/><SearchSelect label={t.related} field={`${id}-context`} value={nextContext} options={[{value:'',label:t.addGroup},...contexts.filter(c=>c.related&&(!category||c.category===category)).map(c=>({value:c.code,label:c.label[language]}))]} onSelect={value=>nextContext=value}/>{/if}
   <button type="button" onclick={addGroup}>{t.addGroup}</button>
  {/if}
 </div>
</fieldset>

<style>
 .condition-group{min-width:0;margin:12px 0 0;padding:12px;border:1px solid var(--border);border-radius:6px}.condition-group legend{padding:0 6px;font-size:var(--font-size-support);color:var(--muted)}.group-heading,.group-actions{display:flex;flex-wrap:wrap;align-items:flex-end;gap:10px}.group-heading :global(.form-select-field),.group-actions :global(.form-select-field){flex:0 1 208px;min-width:0;max-width:100%}.condition-row{display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end;margin:12px 0}.condition-row>:global(.form-select-field),.condition-row>:global(.form-multi-select-field){flex:0 1 208px;min-width:0;max-width:100%}.condition-row>:global(.form-select-field):nth-child(2){flex-basis:176px}.condition-values{min-width:0;max-width:100%}.value-label{display:block;font-size:var(--font-size-support);font-weight:500;margin-bottom:6px}.value-inputs{display:flex;align-items:center;gap:6px}.value-inputs>:global(.custom-date),.value-inputs>:global(.form-input-field){flex:0 1 var(--value-width);width:var(--value-width);min-width:0}.range-separator{flex:none;color:var(--muted)}button{min-height:32px;padding:5px 10px;border:1px solid var(--border);border-radius:6px;background:var(--surface);color:var(--text);font:inherit;font-size:var(--font-size-support)}button.remove{color:var(--danger,#dc2626)}@media(max-width:700px){.condition-group{padding:10px}.condition-values{width:fit-content}.group-heading :global(.form-select-field),.group-actions :global(.form-select-field){flex-shrink:1}}
</style>
