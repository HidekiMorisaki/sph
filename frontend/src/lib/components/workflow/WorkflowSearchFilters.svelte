<script lang="ts">
 import SearchSelect from '../SearchSelect.svelte';
 import SearchMultiSelect from '../SearchMultiSelect.svelte';
 import FormCheckbox from '../FormCheckbox.svelte';
 import {localization} from '$lib/localization';
 import {searchChoiceLabel,type SearchContext} from '$lib/search';
 let {options,contexts,onChange}:{options:Record<string,string|boolean>;contexts:SearchContext[];onChange:(options:Record<string,string|boolean>)=>void}=$props();
 let ja=$derived($localization.displayLanguage==='ja');
 const t=(a:string,b:string)=>ja?a:b;
 function set(key:string,value:string|boolean){const next={...options};if(value===false||value==='')delete next[key];else next[key]=value;onChange(next);}
 const values=(key:string)=>typeof options[key]==='string'?(options[key] as string).split(','):[];
 const selections=(context:string,field='selection')=>contexts.find(c=>c.code===context)?.fields.find(f=>f.code===field)?.options??[];
</script>
<div class="workflow-search-filters">
 <SearchSelect label={t('表示対象','Requests')} field="workflow-filter-view" value={String(options.view??'all')} options={[{value:'all',label:t('閲覧できるすべての申請','All visible requests')},{value:'mine',label:t('自分の申請','My requests')},{value:'pending',label:t('自分の承認待ち','Awaiting my approval')}]} onSelect={value=>set('view',value==='all'?'':value)}/>
 <SearchMultiSelect label={t('状態','Status')} field="workflow-filter-status" values={values('statuses')} options={['draft','pending','returned','approved','rejected','cancelled'].map(value=>({value,label:searchChoiceLabel(value,'workflow',$localization.displayLanguage)}))} onChange={value=>set('statuses',value.join(','))}/>
 <SearchMultiSelect label={t('テンプレート','Template')} field="workflow-filter-template" values={values('templateIds')} options={selections('workflow','templateSelection')} onChange={value=>set('templateIds',value.join(','))}/>
 {#each [{key:'applicantIds',context:'workflow',field:'applicantSelection',ja:'申請者',en:'Applicant'},{key:'approverIds',context:'approver',ja:'承認者',en:'Approver'},{key:'finalApproverIds',context:'finalApprover',ja:'最終承認者',en:'Final approver'},{key:'currentAssigneeIds',context:'currentAssignee',ja:'現在の担当者',en:'Current assignee'}] as person}
  <SearchMultiSelect label={t(person.ja,person.en)} field={'workflow-filter-'+person.key} values={values(person.key)} options={selections(person.context,person.field)} onChange={value=>set(person.key,value.join(','))}/>
 {/each}
 <div class="history-filter"><FormCheckbox field="workflow-filter-history" label={t('過去の申請回・担当者変更前も含める','Include earlier submissions and replaced assignees')} checked={options.includeHistory===true} onChange={checked=>set('includeHistory',checked)}/></div>
</div>
<style>
 .workflow-search-filters{display:contents}.workflow-search-filters>:global(.form-select-field),.workflow-search-filters>:global(.form-multi-select-field){width:208px;max-width:100%}.history-filter{display:flex;align-items:center;align-self:flex-end;min-height:36px;max-width:100%;min-width:0}
 @media(max-width:700px){.history-filter{align-self:stretch;min-height:44px}.workflow-search-filters{display:flex;flex-direction:column;gap:12px;width:100%}.workflow-search-filters>:global(.form-select-field),.workflow-search-filters>:global(.form-multi-select-field){width:100%}}
</style>
