<script lang="ts">
	import { localization } from '$lib/localization';
	import { operatorLabels, type SearchContext, type SearchGroup, type SearchRule } from '$lib/search';
	import SearchSelect from './SearchSelect.svelte';
	import FormInput from './FormInput.svelte';
	let { group, context, onChange, onRemove }: { group:SearchGroup; context:SearchContext; onChange:(group:SearchGroup)=>void; onRemove:()=>void } = $props();
	const id=$props.id();
	let ja=$derived($localization.displayLanguage==='ja');
	let selection=$derived(group.children.find((node):node is SearchRule=>node.kind==='rule'&&node.field==='selection'));
	let count=$derived(group.children.find((node):node is SearchRule=>node.kind==='rule'&&node.field==='copyCount'));
	function updateSelection(value:string){onChange({...group,children:[{kind:'rule',field:'selection',operator:'eq',value},count??{kind:'rule',field:'copyCount',operator:'eq',value:0}]});}
	function updateCount(operator:string,value:SearchRule['value']){onChange({...group,children:[selection??{kind:'rule',field:'selection',operator:'eq',value:''},{kind:'rule',field:'copyCount',operator,value}]});}
	function setValue(value:string,part=0){const scalar=value===''?'':Number(value);if(count?.operator==='between'){const values=Array.isArray(count.value)?[...count.value]:[0,0];values[part]=scalar;updateCount('between',values);}else updateCount(count?.operator??'eq',scalar);}
</script>

<fieldset class="branch-copy-count"><legend>{ja?'指定拠点の現物冊数':'Copy count in selected branch'}</legend>
	<SearchSelect label={ja?'拠点':'Branch'} field={`${id}-branch`} value={String(selection?.value??'')} options={context.fields.find(field=>field.code==='selection')?.options??[]} onSelect={updateSelection}/>
	<SearchSelect label={ja?'比較条件':'Comparison'} field={`${id}-operator`} searchable={false} value={count?.operator??'eq'} options={['eq','ne','gt','gte','lt','lte','between'].map(value=>({value,label:operatorLabels[value][ja?0:1]}))} onSelect={value=>updateCount(value,value==='between'?[0,0]:0)}/>
	{#each count?.operator==='between'?[0,1]:[0] as part}
		<FormInput label={count?.operator==='between'?(part===0?(ja?'最小冊数':'Minimum copies'):(ja?'最大冊数':'Maximum copies')):(ja?'冊数':'Copies')} field={`${id}-count-${part}`} type="number" min="0" step="1" value={String((Array.isArray(count?.value)?count.value[part]:count?.value)??'')} placeholder="0" onValueChange={value=>setValue(value,part)}/>
	{/each}
	<button type="button" onclick={onRemove}>{ja?'条件を削除':'Remove condition'}</button>
	<p>{ja?'有効な配置先の現物を数えます。貸出中・貸出不可も含み、0冊も指定できます。':'Counts copies in active locations, including loaned and non-rentable copies. Zero copies is supported.'}</p>
</fieldset>

<style>
	.branch-copy-count{display:flex;align-items:end;flex-wrap:wrap;gap:12px;min-width:0;margin:12px 0;padding:16px;border:1px solid var(--border);border-radius:8px}legend{font-size:var(--font-size-support);color:var(--text-secondary)}p{flex-basis:100%;margin:0;font-size:var(--font-size-support);color:var(--muted)}button{padding:7px 12px;background:var(--surface);border:1px solid var(--border);border-radius:6px;color:var(--text);font:inherit;cursor:pointer}button:hover{background:var(--surface-hover)}
</style>
