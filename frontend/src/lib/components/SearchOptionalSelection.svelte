<script lang="ts">
 import SearchMultiSelect from './SearchMultiSelect.svelte';
 import {localization} from '#lib/localization.js';
 import {searchMessages,type SearchGroup} from '#lib/search.js';
 import {readSelection,replaceSelection,unsetSelection,type SelectionField} from '#lib/search-selection.js';
 let {label,field,item,conditions,onConditionsChange,values,options,onChange}:{label:string;field:string;item:SelectionField;conditions:SearchGroup;onConditionsChange:(value:SearchGroup)=>void;values:string[];options:{value:string;label:string}[];onChange:(value:string[])=>void}=$props();
 let t=$derived(searchMessages[$localization.displayLanguage]);
 function choose(next:string[]){onChange([]);onConditionsChange(replaceSelection(conditions,item,next));}
</script>
<SearchMultiSelect {label} {field} values={readSelection(conditions,item,values)} placeholder={t.notSpecified} options={[...(item.field.unsetMode?[{value:unsetSelection,label:t.notSet}]:[]),...options]} onChange={choose}/>
