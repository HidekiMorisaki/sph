<script lang="ts">
 import SearchMultiSelect from './SearchMultiSelect.svelte';
 import SearchSelect from './SearchSelect.svelte';
 import { localization } from '#lib/localization.js';
 import { localeMessages } from '#lib/locale-messages.js';
 import { searchMessages, type SearchGroup } from '#lib/search.js';
 import { unsetSelection } from '#lib/search-selection.js';
 import { readSkillSelection, replaceSkillSelection, type SkillSelection } from '#lib/search-skills.js';
 let { conditions, onConditionsChange, fallback, options, onLegacyClear }: { conditions: SearchGroup; onConditionsChange: (value: SearchGroup) => void; fallback: SkillSelection; options: {value:string;label:string}[]; onLegacyClear: (selection:SkillSelection) => void } = $props();
 let t = $derived(searchMessages[$localization.displayLanguage]);
 let text = $derived(localeMessages[$localization.displayLanguage].workforce);
 let selected = $derived.by(()=>{const value=readSkillSelection(conditions,fallback);return value.values.filter(v=>v!==unsetSelection).length<=1?{...value,mode:fallback.mode}:value;});
 function choose(next: SkillSelection) { onLegacyClear(next); onConditionsChange(replaceSkillSelection(conditions, next)); }
</script>
<div class="employee-branch-filter"><span>{text.skills}</span><SearchMultiSelect label={text.skills} field="employeeSkillFilter" values={selected.values} options={[{value:unsetSelection,label:t.notSet},...options]} placeholder={t.notSpecified} onChange={values=>choose({...selected,values})}/></div>
{#if selected.values.some(value=>value!==unsetSelection)}
 <div class="employee-branch-filter"><SearchSelect label={text.skillMode} field="employeeSkillMode" value={selected.mode} searchable={false} options={[{value:'all',label:text.all},{value:'any',label:text.any}]} onSelect={mode=>choose({...selected,mode})}/></div>
 <div class="employee-branch-filter"><SearchSelect label={text.minProficiency} field="employeeProficiencyFilter" value={selected.proficiency} searchable={false} options={[{value:'1',label:text.level1},{value:'2',label:text.level2},{value:'3',label:text.level3}]} onSelect={proficiency=>choose({...selected,proficiency})}/></div>
{/if}
<style>
 .employee-branch-filter{display:grid;align-content:start;gap:var(--sph-space-6px);flex:0 1 200px;width:200px;max-width:100%;min-width:0;color:var(--text-secondary);font-size:var(--font-size-support)}
 .employee-branch-filter :global(.form-multi-select-field),.employee-branch-filter :global(.form-select-field){width:100%;min-width:0}
 .employee-branch-filter :global(.form-multi-select-field>span){position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap}
</style>
