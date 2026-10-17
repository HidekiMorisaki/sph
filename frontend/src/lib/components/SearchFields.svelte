<script lang="ts">
	import { onMount, tick, type Snippet } from 'svelte';
	import { localization } from '$lib/localization';
	import { emptyGroup, localDateTime, zonedDateTime, searchMessages, searchChoiceLabel, type SearchContext, type SearchGroup } from '$lib/search';
	import { splitSearchFields, searchFieldValue, searchFieldNode, type SearchInputField } from '$lib/search-field-inputs';
 import { ruleCount, type SearchNode } from '$lib/search';
 import type { SearchFieldsConfiguration, SearchSection } from '$lib/search-configurations';
 import SearchConditionGroup from './SearchConditionGroup.svelte';
 import BranchCopyCountFields from './BranchCopyCountFields.svelte';
	import DatePicker from './DatePicker.svelte';
	import FormInput from './FormInput.svelte';
	import { searchInputExample } from '$lib/search-input-examples';
	import SearchSelect from './SearchSelect.svelte';
	import SearchMultiSelect from './SearchMultiSelect.svelte';
	import { sharedSearchOptions, hasSelectionCondition } from '$lib/shared-search-options';
	let { configuration, storageKey, contexts, conditions, onChange, quickFilters, quickCount = 0, userId = null, options = {}, onOptionsChange }: { configuration: SearchFieldsConfiguration; storageKey: string; contexts: SearchContext[]; conditions: SearchGroup; onChange: (value: SearchGroup) => void; quickFilters?: Snippet; quickCount?: number; userId?: number | null; options?: Record<string,string|boolean>; onOptionsChange?: (options:Record<string,string|boolean>)=>void } = $props();
	const sharedKey = (item:SearchInputField) => storageKey === 'employees' && item.field.code === 'selection' && onOptionsChange ? sharedSearchOptions[item.context] : undefined;
	function sharedValues(key:string):string[] { return typeof options[key] === 'string' ? options[key].split(',') : []; }
	function changeShared(key:string,values:string[]) { const next={...options}; if(values.length)next[key]=values.join(',');else delete next[key];onOptionsChange?.(next); }
	const id = $props.id();
	let language = $derived($localization.displayLanguage);
	let t = $derived(searchMessages[language]);

 let sections = $derived(configuration.sections(contexts));
 let fields = $derived(sections.flatMap(section => section.fields));
 let split = $derived(splitSearchFields(conditions, fields));
 let dateOpen = $state('');
 let activeSection = $state('');
 const fieldWidth = (field: SearchInputField['field']) => configuration.widths?.[field.code] ?? (field.type === 'datetime' ? '464px' : field.type === 'date' ? '336px' : '208px');
 let visibleSections = $derived(sections.filter(section => section.code === 'quick' && quickFilters || section.fields.length || section.contexts?.length));
 const relatedNodes = (section: SearchSection) => split.remaining.children.filter((node): node is import('$lib/search').SearchGroup => node.kind === 'group' && section.contexts?.some(context => context.code === node.context) === true);
 function count(section: SearchSection): number {
  return section.code === 'quick' ? quickCount : section.fields.reduce((sum, item) => sum + (split.represented.has(item) || sharedKey(item) && options[sharedKey(item)!] ? 1 : 0), 0) + relatedNodes(section).reduce((sum, node) => sum + Math.max(1, ruleCount(node)), 0);
 }
 function replaceRelated(node: SearchNode, next?: SearchNode) {
  onChange({...emptyGroup(), children: [...split.represented.values(), ...split.remaining.children.flatMap(child => child === node ? next ? [next] : [] : [child])]});
 }
 function addRelated(context: SearchContext) {
  onChange({...emptyGroup(), children: [...split.represented.values(), ...split.remaining.children, {...emptyGroup(), context: context.code, match: 'some',children:context.code==='branchCopies'?[{kind:'rule',field:'selection',operator:'eq',value:context.fields.find(field=>field.code==='selection')?.options?.[0]?.value??''},{kind:'rule',field:'copyCount',operator:'eq',value:0}]:[]}]});
 }
	function showSelectedCategory() {
		void tick().then(() => {
			const node = document.getElementById(`${id}-${activeSection}-tab`);
			const strip = node?.parentElement;
			if (!node || !strip) return;
			const button = node.getBoundingClientRect(), bounds = strip.getBoundingClientRect();
			if (button.left < bounds.left) strip.scrollLeft -= bounds.left - button.left;
			else if (button.right > bounds.right) strip.scrollLeft += button.right - bounds.right;
		});
	}
	function selectSection(code: string) {
		activeSection = code; dateOpen = ''; showSelectedCategory();
		if (userId !== null) try { localStorage.setItem(`${storageKey}-search-category:${userId}`, code); } catch { /* Storage is optional. */ }
	}
	function categoryKeydown(event: KeyboardEvent) {
		if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
		event.preventDefault();
		const index = visibleSections.findIndex(section => section.code === activeSection);
		const next = event.key === 'Home' ? 0 : event.key === 'End' ? visibleSections.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + visibleSections.length) % visibleSections.length;
		selectSection(visibleSections[next].code);
		document.getElementById(`${id}-${activeSection}-tab`)?.focus();
	}
	onMount(() => {
  activeSection = configuration.initialSection;
		if (userId !== null) try { const saved = localStorage.getItem(`${storageKey}-search-category:${userId}`); if (visibleSections.some(section => section.code === saved)) activeSection = saved!; } catch { /* Default to basic information. */ }
		showSelectedCategory();
	});
	function update(item: SearchInputField, value: string, part = 0) {
		const values = searchFieldValue(split.represented.get(item), item);
		values[part] = item.field.type === 'datetime' && value ? zonedDateTime(value, $localization.timeZone) : value;
		const node = searchFieldNode(item, values);
		const nodes = fields.flatMap(field => field === item ? node ? [node] : [] : split.represented.has(field) ? [split.represented.get(field)!] : []);
		onChange({ ...emptyGroup(), children: [...nodes, ...split.remaining.children] });
	}
</script>

<div class="search-fields" class:employee-search-fields={storageKey === 'employees'}>
	<div class="category-tabs" role="tablist" aria-label={t.category}>
		{#each visibleSections as section}
			<button type="button" role="tab" id={`${id}-${section.code}-tab`} data-search-category={section.code} aria-selected={activeSection === section.code} aria-controls={`${id}-${section.code}-panel`} tabindex={activeSection === section.code ? 0 : -1} onclick={() => selectSection(section.code)} onkeydown={categoryKeydown}>
				{section.code === 'quick' ? t.commonFilters : t[section.code as keyof typeof t] ?? section.code}{#if count(section)}<span class="condition-count">{count(section)}</span>{/if}
			</button>
		{/each}
	</div>
	{#each visibleSections as section}
		{@const items = section.fields}
		<div class="category-panel" role="tabpanel" id={`${id}-${section.code}-panel`} aria-labelledby={`${id}-${section.code}-tab`} hidden={activeSection !== section.code} tabindex="0">
		{#if section.code === 'quick' && quickFilters}{@render quickFilters()}
		{/if}
		{#if items.length}
			<div class="search-section">
				<div class="field-grid">
					{#each items as item (`${item.context}-${item.field.code}`)}
						{@const field = item.field}
						{@const label = field.label[language]}
						{@const value = searchFieldValue(split.represented.get(item), item)}
						<div class="employee-search-field" data-search-field={`${item.context}.${field.code}`} style:--field-width={fieldWidth(field)}>
							{#if sharedKey(item)}
								<SearchMultiSelect {label} field={`${id}-${item.context}-${field.code}`} values={sharedValues(sharedKey(item)!)} options={field.options ?? []} onChange={values=>changeShared(sharedKey(item)!,values)}/>
								{#if hasSelectionCondition(conditions,item.context)}<p class="additional-condition">{language==='ja'?'保存済みの追加条件も適用されています。この選択を変更しても追加条件は維持されます。':'Additional saved conditions also apply and are retained when this selection changes.'}</p>{/if}
							{:else if field.type === 'number' && item.numericRange}
								<span class="range-label">{label}</span><div class="age-range-inputs">
									{#each [0, 1] as part}
										{#if part === 1}<span class="range-separator" aria-hidden="true">-</span>{/if}
										<div class="age-bound"><FormInput label={`${label} ${part === 0 ? t.minimum : t.maximum}`} field={`${id}-${item.context}-${field.code}-${part}`} placeholder={searchInputExample(field, language, part)} showLabel={false} type="number" min={item.minimum} step={item.step ?? 'any'} value={value[part]} onValueChange={v => update(item, v, part)}/>{#if item.rangeUnit}<span aria-hidden="true">{item.rangeUnit[language]}</span>{/if}</div>
									{/each}
								</div>
							{:else if field.type === 'date' || field.type === 'datetime'}
								<span class="range-label">{label}</span><div class="range-inputs">
									{#each [0, 1] as part}
										{@const partLabel = `${label} ${part === 0 ? t.from : t.until}`}
										{@const key = `${id}-${item.context}-${field.code}-${part}`}
										{#if part === 1}<span class="range-separator" aria-hidden="true">-</span>{/if}
										<DatePicker label={partLabel} showLabel={false} field={key} mode={field.type === 'datetime' ? 'datetime' : 'date'} value={field.type === 'datetime' ? localDateTime(value[part], $localization.timeZone) : value[part]} open={dateOpen === key} onToggle={() => dateOpen = dateOpen === key ? '' : key} onSelect={v => { update(item, v, part); dateOpen = ''; }} />
									{/each}
								</div>
							{:else if field.type === 'choice' || field.type === 'boolean'}
								<SearchSelect {label} field={`${id}-${item.context}-${field.code}`} value={value[0]} options={[{value: '', label: t.notSpecified}, ...(field.type === 'boolean' ? [{value: 'true', label: t.yes}, {value: 'false', label: t.no}] : field.options ?? field.choices?.map(v => ({ value: v, label: searchChoiceLabel(v, item.context, language) })) ?? [])]} onSelect={v => update(item, v)} />
							{:else}<FormInput {label} field={`${id}-${item.context}-${field.code}`} placeholder={searchInputExample({...field, code: item.exampleCode ?? field.code}, language)} type={field.type === 'number' ? 'number' : 'text'} step="any" maxlength={Math.min(field.maxLength, 500)} value={value[0]} onValueChange={v => update(item, v)} />{/if}
						</div>
					{/each}
				</div>
			</div>
		{/if}
   {#if section.contexts?.length}
    {#each relatedNodes(section) as node}
     {#if node.context==='branchCopies'}<BranchCopyCountFields group={node} context={section.contexts.find(context=>context.code==='branchCopies')!} onChange={next=>replaceRelated(node,next)} onRemove={()=>replaceRelated(node)}/>{:else}<SearchConditionGroup group={node} {contexts} contextCode={configuration.rootContext} depth={1} onChange={next => replaceRelated(node, next)} onRemove={() => replaceRelated(node)}/>{/if}
    {/each}
    <div class="related-actions">{#each section.contexts as context}<button type="button" onclick={() => addRelated(context)}>{t.addGroup}: {context.label[language]}</button>{/each}</div>
   {/if}


		</div>
	{/each}
</div>

<style>
	.additional-condition{font-size:var(--font-size-support);color:var(--muted);margin:6px 0 0;line-height:1.6}
 .related-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}.related-actions button{min-height:32px;padding:5px 10px;border:1px solid var(--border);border-radius:6px;background:var(--surface);color:var(--text);font:inherit;font-size:var(--font-size-support);cursor:pointer}
	.category-tabs{display:flex;gap:4px;overflow-x:auto;border-bottom:1px solid var(--border);margin-top:12px}.category-tabs button{display:flex;align-items:center;gap:6px;flex:none;min-height:36px;padding:8px 10px;border:0;border-radius:0;border-bottom:2px solid transparent;background:transparent;color:var(--muted);font:inherit;font-size:var(--font-size-support);white-space:nowrap;cursor:pointer}.category-tabs button[aria-selected="true"]{color:var(--text);border-bottom-color:var(--action-primary);font-weight:600}.category-tabs button:focus-visible{outline:2px solid var(--action-primary);outline-offset:-2px}.condition-count{border-radius:10px;padding:1px 6px;background:var(--bg);font-size:var(--font-size-support)}.category-panel{padding:12px 4px 4px 0}.category-panel[hidden]{display:none}.category-panel:focus-visible{outline:2px solid var(--action-primary);outline-offset:-2px}
	.field-grid{display:flex;flex-wrap:wrap;gap:12px}.employee-search-field{flex:0 0 auto;width:var(--field-width);max-width:100%;min-width:0}.age-range-inputs{display:flex;align-items:center;gap:6px}.age-bound{display:flex;flex:1;align-items:center;gap:4px;min-width:0}.age-bound :global(.form-input-field){flex:1;min-width:0}.age-bound span{flex:none;white-space:nowrap}
	.search-section{min-width:0;margin:0;padding:0}.range-label{display:block;font-size:var(--font-size-support);font-weight:500;margin-bottom:6px}.range-inputs{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);align-items:center;gap:6px}.range-separator{color:var(--muted)}
</style>
