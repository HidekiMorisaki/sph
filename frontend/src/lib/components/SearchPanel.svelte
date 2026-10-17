<script lang="ts">
 import { onMount, tick, type Snippet } from 'svelte';
 import { beforeNavigate } from '$app/navigation';
 import { localization } from '$lib/localization';
 import { emptyGroup, ruleCount, searchMessages, type SearchState, type SearchTarget, type SearchContext, type SearchGroup, type SavedFilter, type SearchDefinition } from '$lib/search';
 import SearchFields from './SearchFields.svelte';
 import { searchConfigurations, type SearchConfiguration } from '$lib/search-configurations';
 import SearchInput from './SearchInput.svelte';
 import FormInput from './FormInput.svelte';
 import SearchSelect from './SearchSelect.svelte';
 import ModalBackdrop from './ModalBackdrop.svelte';
 import StatusNotice from './StatusNotice.svelte';
 import DetailActionButtons from './DetailActionButtons.svelte';
 import { searchInputExample } from '$lib/search-input-examples';
 import '$lib/styles/search-form.css';
 import { normalizeSharedOptions } from '$lib/shared-search-options';
 let {target,searchState=$bindable(),draftOptions={},onRestoreOptions,filters,userId=null,configuration=searchConfigurations[target]}:{target:SearchTarget;searchState:SearchState;draftOptions?:Record<string,string|boolean>;onRestoreOptions:(options:Record<string,string|boolean>)=>void;filters?:Snippet;userId?:number|null;configuration?:SearchConfiguration}=$props();
 const id=$props.id();
 let t=$derived(searchMessages[$localization.displayLanguage]);
 let nameExample=$derived(searchInputExample({code:configuration.filterNameExample,type:'string'},$localization.displayLanguage));
 let contexts=$state<SearchContext[]>([]);
 let keyword=$state('');let conditions=$state<SearchGroup>(emptyGroup());
 type SearchTab='simple'|'advanced'|'saved';
 const tabs:SearchTab[]=['simple','advanced','saved'];
 let activeTab=$state<SearchTab>('simple');
 let collapsed=$state(false);
 let definitionsReady=$state(false);let filterOperations=$state<string[]>([]);
 let saved=$state<SavedFilter[]>([]);let selectedId=$state('');let selected=$derived(saved.find(item=>String(item.id)===selectedId));
 let busy=$state(false);let message=$state('');let messageError=$state(false);let saveCompleted=$state(false);
 let dialog=$state<'save'|null>(null);let dialogElement=$state<HTMLDialogElement>();let returnFocus:HTMLElement|null=null;
 let name=$state('');let saveMode=$state('new');let renameId=$state('');let renameName=$state('');
 let dirty=$derived(stable({keyword:keyword.trim(),conditions,options:draftOptions})!==stable({keyword:searchState.definition.keyword,conditions:searchState.definition.conditions,options:searchState.definition.options}));
 let canSave=$derived(definitionsReady&&searchState.success&&!searchState.loading&&!searchState.error&&!dirty);

 $effect(()=>{
  if(!definitionsReady)return;
  const draft={keyword:keyword.trim(),conditions:clone(conditions),options:clone(draftOptions)};
  if(!dirty||ruleCount(draft.conditions)>50)return;
  const timer=setTimeout(()=>apply({...searchState.definition,...draft}),250);
  return ()=>clearTimeout(timer);
 });
 function clearNotice(){message='';messageError=false;}
 beforeNavigate(clearNotice);
 function stable(value:unknown):string {return JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);}
 const clone=<T,>(value:T):T=>JSON.parse(JSON.stringify(value));
 async function loadDefinitions(){definitionsReady=false;try{const response=await fetch(configuration.fieldsEndpoint);if(!response.ok)throw Error();const payload=await response.json();contexts=payload.data;filterOperations=payload.meta.filterOperations;saveMode=filterOperations.includes('create')?'new':'update';definitionsReady=true;}catch{message=t.failed;messageError=true;}}
 async function loadFilters(){if(!filterOperations.includes('read'))return;try{const response=await fetch(`/v1/search-filters?target=${target}&limit=100&sortBy=name&sortOrder=asc`);if(!response.ok)throw Error();saved=(await response.json()).data;}catch{message=t.failed;messageError=true;}}
 function apply(definition?:SearchDefinition){clearNotice();searchState={...searchState,definition:definition??{...searchState.definition,keyword:keyword.trim(),conditions:clone(conditions),options:clone(draftOptions)},version:searchState.version+1,success:false,loading:true,error:false};}
 function clear(){keyword='';conditions=emptyGroup();selectedId='';name='';saveMode=filterOperations.includes('create')?'new':'update';onRestoreOptions({});apply({...searchState.definition,keyword:'',conditions:emptyGroup(),options:{}});}
 async function selectFilter(value:string){
  if(busy)return;
  if(!value){selectedId='';name='';saveMode=filterOperations.includes('create')?'new':'update';return;}
  busy=true;message='';
  try{const response=await fetch(`/v1/search-filters/${value}`);if(!response.ok){if([403,422].includes(response.status))throw Error(t.invalid);throw Error(t.failed);}const item=(await response.json()).data as SavedFilter;
   const definition=normalizeSharedOptions(clone(item.definition),target==='employees'?contexts:[]);
   keyword=definition.keyword;conditions=definition.conditions;onRestoreOptions(clone(definition.options));selectedId=value;name=item.name;saveMode=filterOperations.includes('update')?'update':'new';saved=saved.map(row=>row.id===item.id?item:row);apply(definition);
  }catch(error){message=error instanceof Error?error.message:t.failed;messageError=true;}finally{busy=false;}
 }
 async function openDialog(mode:'save',event:MouseEvent){clearNotice();saveCompleted=false;returnFocus=event.currentTarget as HTMLElement;saveMode=selected&&filterOperations.includes('update')?'update':filterOperations.includes('create')?'new':'update';name=saveMode==='new'?'':selected?.name??'';renameId='';dialog=mode;await tick();(dialogElement?.querySelector<HTMLElement>('input')??dialogElement?.querySelector<HTMLElement>('.app-modal-close'))?.focus();}
 function closeDialog(){if(busy)return;clearNotice();saveCompleted=false;dialog=null;void tick().then(()=>returnFocus?.focus({preventScroll:true}));}
 async function mutate(path:string,method:string,body?:unknown){const response=await fetch(path,{method,...(body===undefined?{}:{headers:{'content-type':'application/json'},body:JSON.stringify(body)})});const payload=await response.json();if(!response.ok)throw Error(payload.error?.code==='FILTER_LIMIT_REACHED'?t.filterLimitReached:response.status===409?t.conflict:response.status===422?t.invalid:t.failed);return payload.data;}
 async function save(){
  if(!canSave||busy||saveCompleted||!name.trim())return;
  const current=selected;busy=true;message='';
  try{const item=saveMode==='update'&&current?await mutate(`/v1/search-filters/${current.id}`,'PATCH',{name:name.trim(),definition:searchState.definition,revision:current.revision}):await mutate('/v1/search-filters','POST',{target,name:name.trim(),definition:searchState.definition});
   await loadFilters();selectedId=String(item.id);message=t.savedOk;messageError=false;saveMode=filterOperations.includes('update')?'update':'new';name=item.name;saveCompleted=true;
  }catch(error){message=error instanceof Error?error.message:t.failed;messageError=true;}finally{busy=false;if(dialog){await tick();dialogElement?.querySelector<HTMLElement>(saveCompleted?'.app-modal-close':'input')?.focus();}}
 }
 async function rename(item:SavedFilter){if(!renameName.trim())return;clearNotice();busy=true;try{const renamed=await mutate(`/v1/search-filters/${item.id}`,'PATCH',{name:renameName.trim(),revision:item.revision});if(selectedId===String(item.id)&&saveMode==='update')name=renamed.name;await loadFilters();renameId='';cancelCardRename(item);message=t.savedOk;messageError=false;}catch(error){message=error instanceof Error?error.message:t.failed;messageError=true;}finally{busy=false;}}
 function startCardRename(item:SavedFilter){clearNotice();renameId=String(item.id);renameName=item.name;void tick().then(()=>document.getElementById(`${id}-card-rename-${item.id}`)?.focus());}
 function cancelCardRename(item:SavedFilter){clearNotice();renameId='';void tick().then(()=>document.querySelector<HTMLButtonElement>(`[data-filter-id="${item.id}"] .detail-header-edit`)?.focus());}
 async function remove(item:SavedFilter){clearNotice();if(!confirm(t.confirmDelete))return;busy=true;try{await mutate(`/v1/search-filters/${item.id}`,'DELETE');if(selectedId===String(item.id)){selectedId='';name='';saveMode=filterOperations.includes('create')?'new':'update';}await loadFilters();message=t.deletedOk;messageError=false;}catch(error){message=error instanceof Error?error.message:t.failed;messageError=true;}finally{busy=false;}}
 function keydown(event:KeyboardEvent){if(event.defaultPrevented)return;if(dialog){if(event.key==='Tab'&&dialogElement){const focusable=[...dialogElement.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),[tabindex="0"]')].filter(node=>node.getClientRects().length);const index=focusable.indexOf(document.activeElement as HTMLElement);if(event.shiftKey&&index<=0){event.preventDefault();focusable.at(-1)?.focus();}else if(!event.shiftKey&&index===focusable.length-1){event.preventDefault();focusable[0]?.focus();}}if(event.key==='Escape'){event.preventDefault();closeDialog();}return;}if(event.key==='Enter'&&event.target instanceof HTMLInputElement&&event.target.type==='search'){event.preventDefault();apply();}}
 function setCollapsed(value:boolean){clearNotice();collapsed=value;if(userId!==null)try{localStorage.setItem(`${target}-search-collapsed:${userId}`,String(value));}catch{ /* Storage is optional. */ }}
 function showSelectedTab(){void tick().then(()=>{const node=document.getElementById(`${id}-${activeTab}-tab`);const strip=node?.parentElement;if(node&&strip){const button=node.getBoundingClientRect(),bounds=strip.getBoundingClientRect();if(button.left<bounds.left)strip.scrollLeft-=bounds.left-button.left;else if(button.right>bounds.right)strip.scrollLeft+=button.right-bounds.right;}});}
 function chooseTab(tab:SearchTab) {
  clearNotice();activeTab=tab;if(collapsed)setCollapsed(false);showSelectedTab();
  if(userId!==null)try{localStorage.setItem(`${target}-search-tab:${userId}`,tab);}catch{ /* Storage is optional. */ }
 }
 function tabKeydown(event:KeyboardEvent) {
  if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
  event.preventDefault();
  const index=tabs.indexOf(activeTab);
  const tab=event.key==='Home'?'simple':event.key==='End'?'saved':tabs[(index+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length];
  chooseTab(tab);document.getElementById(`${id}-${tab}-tab`)?.focus();
 }
 onMount(()=>{keyword=searchState.definition.keyword;conditions=clone(searchState.definition.conditions);});
 onMount(()=>{if(userId!==null)try{const savedTab=localStorage.getItem(`${target}-search-tab:${userId}`);activeTab=tabs.includes(savedTab as SearchTab)?savedTab as SearchTab:'simple';collapsed=localStorage.getItem(`${target}-search-collapsed:${userId}`)==='true';}catch{ /* Default to simple search. */ }searchState={...searchState,definition:{...searchState.definition,options:clone(draftOptions)},version:searchState.version+1};void loadDefinitions().then(loadFilters);showSelectedTab();});
</script>

{#snippet quickControls()}
 <div class="search-simple shared-search-simple">
  <div class="keyword-control"><span aria-hidden="true">{t.keyword}</span><SearchInput label={t.keyword} value={keyword} placeholder={searchInputExample({code:configuration.keywordExample,type:'string'},$localization.displayLanguage)} onValueChange={value=>keyword=value}/></div>
  {#if filters}<div class="search-filters">{@render filters()}</div>{/if}
 </div>

{/snippet}

{#snippet filterCards()}
 {#if !saved.length}<p class="empty-filters" role="status">{t.empty}</p>{/if}
 {#each saved as item (item.id)}
  <div class="filter-card" class:selected={selectedId===String(item.id)} data-filter-id={item.id} role="listitem">
   <div class="filter-card-heading">
    <button class="filter-card-name" type="button" title={item.name} aria-pressed={selectedId===String(item.id)} disabled={busy||renameId===String(item.id)} onclick={()=>void selectFilter(String(item.id))}>{item.name}</button>
    <div class="filter-card-actions"><DetailActionButtons editLabel={`${t.rename}: ${item.name}`} deleteLabel={`${t.delete}: ${item.name}`} disabled={busy||renameId===String(item.id)} onEdit={filterOperations.includes('update')?()=>startCardRename(item):undefined} onDelete={filterOperations.includes('delete')?()=>void remove(item):undefined}/></div>
   </div>
   {#if renameId===String(item.id)}
    <div class="filter-card-editor">
     <FormInput label={t.name} field={`${id}-card-rename-${item.id}`} maxlength={100} placeholder={nameExample} value={renameName} disabled={busy} onValueChange={value=>renameName=value} onkeydown={event=>{if(event.key==='Escape'){event.preventDefault();cancelCardRename(item);}else if(event.key==='Enter'){event.preventDefault();void rename(item);}}}/>
     <div class="filter-card-edit-actions"><button type="button" disabled={busy||!renameName.trim()} onclick={()=>void rename(item)}>{t.rename}</button><button type="button" disabled={busy} onclick={()=>cancelCardRename(item)}>{t.cancel}</button></div>
    </div>
   {/if}
  </div>
 {/each}
{/snippet}

<form class="search-panel search-form" aria-label={t.search} aria-busy={searchState.loading||busy||!definitionsReady||dirty} onsubmit={event=>event.preventDefault()}>
  <header class="search-header"><div class="search-tabs" role="tablist" aria-label={t.search}>
   {#each tabs as tab}
    <button type="button" role="tab" id={`${id}-${tab}-tab`} aria-selected={activeTab===tab} aria-controls={`${id}-${tab}-panel`} tabindex={activeTab===tab?0:-1} onclick={()=>chooseTab(tab)} onkeydown={tabKeydown}>{tab==='simple'?t.simple:tab==='advanced'?t.advanced:t.saved}</button>
   {/each}
  </div><button class="search-collapse" type="button" aria-label={collapsed?t.expandSearch:t.collapseSearch} aria-expanded={!collapsed} aria-controls={`${id}-search-body ${id}-search-footer`} onclick={()=>setCollapsed(!collapsed)}><svg viewBox="0 0 24 24" aria-hidden="true" class:expanded={!collapsed}><path d="m6 9 6 6 6-6"/></svg></button></header>
 <div id={`${id}-search-body`} class="search-body" hidden={collapsed}>
 {#if message&&!dialog}<StatusNotice {message} tone={messageError?'error':'success'} onDismiss={()=>message=''}/>{/if}
 <div id={`${id}-simple-panel`} role="tabpanel" aria-labelledby={`${id}-simple-tab`} hidden={activeTab!=='simple'}>
 {#if activeTab==='simple'}{@render quickControls()}{/if}
 </div>
 <div id={`${id}-advanced-panel`} role="tabpanel" aria-labelledby={`${id}-advanced-tab`} hidden={activeTab!=='advanced'}>
  {#if definitionsReady&&activeTab==='advanced'}<SearchFields configuration={configuration.fields} storageKey={target} {contexts} {conditions} {userId} options={draftOptions} onOptionsChange={onRestoreOptions} quickFilters={quickControls} quickCount={(keyword.trim()?1:0)+Object.keys(draftOptions).filter(key=>draftOptions[key]!==false&&draftOptions[key]!=='').length} onChange={value=>conditions=value}/>{:else if !definitionsReady}<p>{t.failed}</p><button type="button" onclick={()=>void loadDefinitions()}>{t.refresh}</button>{/if}
 </div>
 <div class="saved-panel" id={`${id}-saved-panel`} role="tabpanel" aria-labelledby={`${id}-saved-tab`} hidden={activeTab!=='saved'}>
  {#if filterOperations.includes('read')}<div class="saved-list"><div class="filter-cards" role="list" aria-label={t.manage}>{@render filterCards()}</div></div>{/if}
 </div>
 </div>
 <footer id={`${id}-search-footer`} class="search-footer" hidden={collapsed}>{#if filterOperations.includes('create')||filterOperations.includes('update')}<button class="app-primary-action save-filter" type="button" disabled={!canSave||busy} onclick={event=>void openDialog('save',event)}>{t.save}</button>{/if}<button class="clear-search" type="button" disabled={busy} onclick={clear}>{t.clear}</button></footer>
</form>

{#if dialog}<ModalBackdrop><dialog bind:this={dialogElement} open class="app-modal app-modal--compact search-dialog search-form" aria-modal="true" aria-labelledby={`${id}-dialog-title`} oncancel={event=>{event.preventDefault();closeDialog();}} onkeydown={keydown}>
 <header><h2 id={`${id}-dialog-title`}>{$localization.displayLanguage==='ja'?'検索条件保存':'Save search conditions'}</h2><button class="app-modal-close" type="button" aria-label={t.close} disabled={busy} onclick={closeDialog}>×</button></header>
 <div class="app-detail-body">
  {#if message}<StatusNotice {message} tone={messageError?'error':'success'} onDismiss={()=>message=''}/>{/if}
   <SearchSelect label={t.save} field={`${id}-save-mode`} value={saveMode} options={[...(filterOperations.includes('create')?[{value:'new',label:t.newFilter}]:[]),...(selected&&filterOperations.includes('update')?[{value:'update',label:t.updateFilter}]:[])]} onSelect={value=>{clearNotice();saveCompleted=false;saveMode=value;name=value==='update'?selected?.name??'':'';}}/>
   <div class="name-field"><FormInput label={t.name} field={`${id}-dialog-name`} maxlength={100} placeholder={nameExample} value={name} disabled={busy} onValueChange={value=>{clearNotice();saveCompleted=false;name=value;}} onkeydown={event=>{if(event.key==='Enter'){event.preventDefault();void save();}}}/></div>

 </div>
 <footer class="app-modal-footer">{#if dialog==='save'}<button class="app-primary-action" type="button" disabled={busy||saveCompleted||!canSave||!name.trim()||(saveMode==='new'&&!filterOperations.includes('create'))||(saveMode==='update'&&(!selected||!filterOperations.includes('update')))} onclick={()=>void save()}>{busy?t.saving:t.save}</button>{/if}<button type="button" disabled={busy} onclick={closeDialog}>{dialog==='save'&&!saveCompleted?t.cancel:t.close}</button></footer>
</dialog></ModalBackdrop>{/if}

<style>
 .filter-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,240px),1fr));grid-auto-rows:1fr;align-content:start;gap:12px;padding:3px}.filter-card{display:flex;flex-direction:column;min-width:0;align-self:stretch;border:1px solid var(--border);border-radius:6px;background:color-mix(in srgb,var(--text) 4%,var(--surface))}.filter-card.selected{border-color:var(--action-primary);background:color-mix(in srgb,var(--action-primary) 6%,var(--surface))}.filter-card-heading{display:flex;flex:1;align-items:flex-start;min-width:0}.filter-card-name{display:flex;align-items:flex-start;flex:1;min-width:0;align-self:stretch;min-height:52px;padding:12px;background:transparent!important;color:var(--text-secondary);border:0;border-radius:5px;text-align:left;overflow-wrap:anywhere;font-size:var(--font-size-body);font-weight:400}.filter-card-name:hover:not(:disabled){background:var(--surface-hover,var(--surface-secondary))!important}.filter-card-name:focus-visible{outline:2px solid var(--action-primary);outline-offset:-2px}.filter-card-actions{flex:none;padding:8px 8px 8px 0}.filter-card-actions :global(button+button){margin-left:0}.filter-card-editor{display:grid;gap:12px;padding:0 12px 12px}.filter-card-edit-actions{display:flex;flex-wrap:wrap;gap:8px}.filter-card-edit-actions button+button{margin-left:0}.empty-filters{grid-column:1/-1;margin:0;color:var(--muted);font-size:var(--font-size-support)}
 .search-simple.shared-search-simple{flex-direction:row;align-items:flex-start}.shared-search-simple .keyword-control{flex:0 1 220px;width:220px;max-width:100%;min-width:0}.shared-search-simple .search-filters,.shared-search-simple :global(.employee-workforce-filters){display:contents}
 .search-footer{display:flex;flex-wrap:wrap;align-items:center;gap:12px;margin:16px -16px -16px;padding:12px 16px;border-top:1px solid var(--border)}.search-footer button+button{margin-left:0}@media(max-width:700px){.search-footer{margin:12px -12px -12px;padding:12px}}
 .search-header{display:flex;flex-wrap:nowrap;align-items:center;justify-content:flex-start;gap:12px;margin:-16px -16px 16px;padding:12px 16px 0;border-bottom:1px solid var(--border)}.search-tabs{display:flex;flex:1;min-width:0;gap:8px;max-width:100%;overflow-x:auto}.search-tabs button{flex:none;white-space:nowrap}.search-tabs button{border:0;border-radius:0;border-bottom:2px solid transparent;padding:10px 12px;background:transparent;color:var(--muted)}.search-tabs button[aria-selected="true"]{border-bottom-color:var(--action-primary);color:var(--text);font-weight:600}.search-tabs button:focus-visible{outline:2px solid var(--action-primary);outline-offset:-2px}[hidden]{display:none!important}
 .search-collapse{display:grid;place-items:center;flex:none;width:32px;padding:5px;margin-bottom:10px}.search-collapse svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:1.8}.search-collapse svg.expanded{transform:rotate(180deg)}
 .saved-list{margin-top:12px}.saved-panel .saved-list{margin-top:0}

 .search-panel{flex:none;min-width:0;margin-bottom:16px;padding:16px;background:var(--surface);border:1px solid var(--border);border-radius:6px;box-shadow:var(--shadow);color:var(--text)}.search-simple{display:flex;flex-wrap:wrap;align-items:flex-start;gap:12px}.keyword-control{display:grid;align-content:start;gap:6px;font-size:var(--font-size-support);color:var(--text)}.search-filters{flex:1;min-width:0}button{min-height:32px;padding:5px 12px;border:1px solid var(--border);border-radius:6px;background:var(--surface);color:var(--text);font:inherit;font-size:var(--font-size-support);cursor:pointer}button:disabled{opacity:.5;cursor:default}.search-dialog{max-width:560px}.name-field{display:grid;gap:6px;margin:12px 0;font-size:var(--font-size-support)}@media(max-width:700px){.search-header{margin:-12px -12px 12px;padding:12px 12px 0}.search-panel{padding:12px}.search-simple{flex-direction:column;align-items:stretch}.search-filters{width:100%}}
</style>
