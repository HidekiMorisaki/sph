<script lang="ts">
 import {untrack} from 'svelte';
 import {localization} from '$lib/localization';
 import {canProject,projectRequest,projectError,type Project,type TypeStatus} from '$lib/projects';
 import {settingsConfig,settingsPayload,rebaseMappings,typeRows,statusRows,linkRows,type SettingsSection} from '$lib/project-settings';
 import FormInput from '$lib/components/FormInput.svelte';
 import FormCheckbox from '$lib/components/FormCheckbox.svelte';
 import SearchSelect from '$lib/components/SearchSelect.svelte';
 import ActionButton from '$lib/components/ActionButton.svelte';
 import DeleteIconButton from '$lib/components/DeleteIconButton.svelte';
 import SortableList from '$lib/components/SortableList.svelte';
 import StatusNotice from '$lib/components/StatusNotice.svelte';
 let {project,onsaved,ondirty,engagements=[],engagementsAvailable=false}:{project:Project;engagements?:Array<{id:number;name:string}>;engagementsAvailable?:boolean;onsaved:(p:Project)=>void;ondirty:(v:boolean)=>void}=$props();
 let ja=$derived($localization.displayLanguage==='ja');const tr=(j:string,e:string)=>ja?j:e;
 type Section=SettingsSection|'basic';
 const basicValues=(p:Project)=>({name:p.name,visibility:p.visibility,status:p.status,engagementId:String(p.engagement?.id??'')});
 let basicPersisted=$state(untrack(()=>basicValues(project))),basic=$state(untrack(()=>basicValues(project)));
 let basicNameInvalid=$state(false);
 let dirtyBasic=$derived(JSON.stringify(basic)!==JSON.stringify(basicPersisted));
 let engagementOptions=$derived([{value:'',label:'-'},...engagements.map(e=>({value:String(e.id),label:e.name})),...(project.engagement&&!engagements.some(e=>e.id===project.engagement?.id)?[{value:String(project.engagement.id),label:project.engagement.name}]:[])]);
 let persisted=$state(untrack(()=>settingsConfig(project))),revision=$state(untrack(()=>project.revision));
 let types=$state(untrack(()=>typeRows(project.types))),statuses=$state(untrack(()=>statusRows(project.statuses))),links=$state<TypeStatus[]>(untrack(()=>linkRows(project.typeStatuses)));
 let next=$state(-1),saving=$state<Section|null>(null),typeMigrations=$state<Record<string,string>>({}),typeStatusMigrations=$state<Record<string,string>>({}),statusMigrations=$state<Record<string,string>>({}),mappingMigrations=$state<Record<string,string>>({});
 type Message={text:string;tone:'success'|'error'|'warning'};
 let messages=$state<Record<Section,Message|null>>({basic:null,types:null,statuses:null,mappings:null});
 let dirtyTypes=$derived(JSON.stringify(typeRows(types))!==JSON.stringify(persisted.types)),dirtyStatuses=$derived(JSON.stringify(statusRows(statuses))!==JSON.stringify(persisted.statuses)),dirtyMappings=$derived(JSON.stringify(linkRows(links))!==JSON.stringify(persisted.typeStatuses));
 $effect(()=>ondirty(dirtyBasic||dirtyTypes||dirtyStatuses||dirtyMappings));
 function receive(p:Project,section:Section|null){
  const before=persisted,after=settingsConfig(p),keepTypes=section!=='types'&&dirtyTypes,keepStatuses=section!=='statuses'&&dirtyStatuses,keepLinks=section!=='mappings'&&dirtyMappings;
  if(!keepTypes)types=typeRows(after.types);if(!keepStatuses)statuses=statusRows(after.statuses);
  links=keepLinks?rebaseMappings(before,after,links):linkRows(after.typeStatuses);
  if(keepLinks&&(before.types.map(t=>t.id).join()!==after.types.map(t=>t.id).join()||before.statuses.map(s=>s.id).join()!==after.statuses.map(s=>s.id).join()))messages.mappings={text:tr('保存した定義に合わせて選択肢を更新しました。未保存の対応設定を確認してください。','Available definitions changed. Review your unsaved status mappings.'),tone:'warning'};
  if(section==='basic'||!dirtyBasic)basic=basicValues(p);basicPersisted=basicValues(p);
  persisted=after;revision=p.revision;
 }
 $effect(()=>{if(project.revision!==revision)untrack(()=>receive(project,null));});
 function reset(section:Section){messages[section]=null;if(section==='basic'){basic={...basicPersisted};basicNameInvalid=false;}else if(section==='types'){types=typeRows(persisted.types);typeMigrations={};typeStatusMigrations={};}else if(section==='statuses'){statuses=statusRows(persisted.statuses);statusMigrations={};}else{links=linkRows(persisted.typeStatuses);mappingMigrations={};}}
 function change(section:Section){messages[section]=null;}
 const allowed=(typeId:number)=>links.filter(l=>l.typeId===typeId).sort((a,b)=>a.position-b.position).map(l=>({value:String(l.statusId),label:persisted.statuses.find(s=>s.id===l.statusId)?.name??''}));
 function toggle(typeId:number,statusId:number,checked:boolean){change('mappings');links=checked?[...links,{typeId,statusId,position:links.filter(l=>l.typeId===typeId).length,initial:false}]:links.filter(l=>l.typeId!==typeId||l.statusId!==statusId);}
 function initial(typeId:number,statusId:number){change('mappings');links=links.map(l=>l.typeId===typeId?{...l,initial:l.statusId===statusId}:l);}
 function linkOrder(typeId:number){return [...links.filter(l=>l.typeId===typeId).sort((a,b)=>a.position-b.position).map(l=>l.statusId),...persisted.statuses.filter(s=>!links.some(l=>l.typeId===typeId&&l.statusId===s.id)).map(s=>s.id)];}
 function reorderLinks(typeId:number,ids:number[]){change('mappings');links=[...links.filter(l=>l.typeId!==typeId),...ids.flatMap((id,position)=>{const link=links.find(l=>l.typeId===typeId&&l.statusId===id);return link?[{...link,position}]:[];})];}
 let removedTypes=$derived(persisted.types.filter(t=>!types.some(row=>row.id===t.id))),removedStatusLinks=$derived(persisted.typeStatuses.filter(l=>!statuses.some(s=>s.id===l.statusId))),changedInitials=$derived(persisted.typeStatuses.filter(l=>l.initial&&statuses.some(s=>s.id===l.statusId&&['done','cancelled'].includes(s.category)))),removedMappings=$derived(persisted.typeStatuses.filter(l=>!links.some(row=>row.typeId===l.typeId&&row.statusId===l.statusId)));
 const targetTypeStatuses=(typeId:number)=>typeId<0?persisted.statuses:persisted.statuses.filter(s=>persisted.typeStatuses.some(l=>l.typeId===typeId&&l.statusId===s.id));
 async function saveBasic(){
  if(!basic.name.trim()){basicNameInvalid=true;document.getElementById('project-name')?.focus();return;}
  saving='basic';messages.basic=null;try{const {engagementId,...fields}=basic;const p=await projectRequest<Project>(`/v1/projects/${project.id}`,'PATCH',{...fields,revision,...(engagementsAvailable&&engagementId!==basicPersisted.engagementId?{engagementId:engagementId?Number(engagementId):null}:{})});receive(p,'basic');messages.basic={text:tr('保存しました。','Saved.'),tone:'success'};onsaved(p);}catch(e){messages.basic={text:projectError(e,ja),tone:'error'};}finally{saving=null;}
 }
 async function save(section:SettingsSection){
  saving=section;messages[section]=null;try{const replacements=section==='types'?typeStatusMigrations:section==='statuses'?statusMigrations:mappingMigrations;const payload=settingsPayload(persisted,revision,section,{types,statuses,typeStatuses:links},replacements,typeMigrations);const p=await projectRequest<Project>(`/v1/projects/${project.id}/settings`,'PUT',payload);receive(p,section);if(section==='types'){typeMigrations={};typeStatusMigrations={};}else if(section==='statuses')statusMigrations={};else mappingMigrations={};messages[section]={text:tr('保存しました。','Saved.'),tone:'success'};onsaved(p);}catch(e){messages[section]={text:projectError(e,ja),tone:'error'};}finally{saving=null;}
 }
</script>
{#snippet message(section:Section)}{#if messages[section]}<StatusNotice message={messages[section]!.text} tone={messages[section]!.tone} onDismiss={()=>messages[section]=null}/>{/if}{/snippet}
{#snippet footer(section:Section,dirty:boolean,invalid=false)}<footer><ActionButton label={tr('変更を取り消す','Discard changes')} disabled={saving!==null||!dirty} onclick={()=>reset(section)}/><ActionButton label={tr('設定を保存','Save settings')} variant="primary" disabled={saving!==null||!dirty||invalid} onclick={()=>void (section==='basic'?saveBasic():save(section))}/></footer>{/snippet}
{#snippet visibilityHelp()}<p>{tr('参加者限定は参加者と権限を持つシステム管理者が閲覧できます。社内公開はプロジェクトの閲覧権限を持つ社員が閲覧できます。','Members only allows project members and authorized system administrators to view the project. Internal allows employees with project read permission to view it.')}</p>{/snippet}
{#snippet engagementHelp()}<p>{tr('関連する業務管理の案件を選択します。関連付けだけでは、案件の情報や参加者はコピーされません。','Select a related client engagement. Linking an engagement does not copy its information or participants.')}</p>{/snippet}
<div class="settings">
 {#if canProject(project,'update',true)}
 <section class="settings-card" data-settings-card="basic" aria-labelledby="project-basic-heading">
  <header><h2 id="project-basic-heading">{tr('基本情報','Basic information')}</h2></header>
  <div class="card-body basic-fields">{@render message('basic')}
   <div class="basic-field basic-name"><FormInput label={tr('名称','Name')} field="project-name" value={basic.name} placeholder={tr('例：社内システム開発','e.g. Internal system development')} error={basicNameInvalid?tr('名称を入力してください。','Enter a name.'):''} required maxlength={128} disabled={saving!==null} onValueChange={v=>{change('basic');basicNameInvalid=false;basic.name=v;}}/></div>
   <div class="basic-field basic-visibility"><SearchSelect label={tr('公開範囲','Visibility')} field="project-visibility" value={basic.visibility} help={visibilityHelp} options={[{value:'private',label:tr('参加者限定','Members only')},{value:'internal',label:tr('社内公開','Internal')}]} disabled={saving!==null} onSelect={v=>{change('basic');basic.visibility=v;}}/></div>
   <div class="basic-field basic-engagement"><SearchSelect label={tr('関連する案件','Engagement')} field="project-engagement" value={basic.engagementId} help={engagementHelp} options={engagementOptions} disabled={saving!==null||!engagementsAvailable} onSelect={v=>{change('basic');basic.engagementId=v;}}/></div>
   <div class="basic-field basic-status"><SearchSelect label={tr('状態','Status')} field="project-status" value={basic.status} options={['active','on_hold','completed','archived'].map((v,i)=>({value:v,label:[tr('進行中','Active'),tr('保留','On hold'),tr('完了','Completed'),tr('アーカイブ','Archived')][i]}))} disabled={saving!==null} onSelect={v=>{change('basic');basic.status=v;}}/></div>
  </div>{@render footer('basic',dirtyBasic)}
 </section>
 {/if}
 {#if canProject(project,'settings.manage',true)}

 <section class="settings-card" data-settings-card="types" aria-labelledby="project-types-heading">
  <header><h2 id="project-types-heading">{tr('種別','Types')}</h2></header><div class="card-body">{@render message('types')}
  <div class="column-head type-columns" aria-hidden="true"><span>{tr('種別名','Type name')}</span><span>{tr('マイルストーン','Milestone')}</span><span></span></div>
  <SortableList ids={types.map(t=>t.id)} label={tr('種別の順番を変更','Reorder types')} labelFor={id=>types.find(t=>t.id===id)?.name??''} disabled={saving==='types'} onreorder={ids=>{change('types');types=ids.map(id=>types.find(t=>t.id===id)!);}}>
   {#snippet children(id:number)}{@const type=types.find(t=>t.id===id)!}<div class="type-columns definition-row">
    <FormInput label={tr('種別名','Type name')} field={'type-name-'+id} showLabel={false} value={type.name} maxlength={64} disabled={saving==='types'} onValueChange={v=>{change('types');types=types.map(t=>t.id===id?{...t,name:v}:t);}}/>
    <div class="milestone-cell"><FormCheckbox label={tr('マイルストーン','Milestone')+' · '+type.name} showLabel={false} field={'type-milestone-'+id} checked={type.milestone??false} disabled={saving==='types'} onChange={v=>{change('types');types=types.map(t=>t.id===id?{...t,milestone:v}:t);}}/></div>
    <DeleteIconButton label={tr('種別を削除','Delete type')+' · '+type.name} disabled={saving!==null||types.length===1} onclick={()=>{change('types');types=types.filter(t=>t.id!==id);}}/>
   </div>{/snippet}
  </SortableList>
  <ActionButton label={tr('種別を追加','Add type')} disabled={saving!==null||types.length>=30} onclick={()=>{change('types');types=[...types,{id:next--,name:'',position:types.length,milestone:false}];}}/>
  {#if types.some(t=>t.id<0)}<p class="hint">{tr('新しい種別には保存済みの状態と初期状態を設定します。保存後に下のカードで変更できます。','New types start with saved statuses. Customize them in the status mapping card after saving.')}</p>{/if}
  {#each removedTypes as old}<div class="migration"><SearchSelect label={old.name+' → '+tr('移行先の種別（使用中の場合）','Replacement type (if used)')} field={'replace-type-'+old.id} value={typeMigrations[old.id]??''} options={types.map(t=>({value:String(t.id),label:t.name}))} onSelect={v=>{change('types');typeMigrations={...typeMigrations,[old.id]:v};}}/>
   {#each persisted.typeStatuses.filter(l=>l.typeId===old.id&&!targetTypeStatuses(Number(typeMigrations[old.id])).some(s=>s.id===l.statusId)) as oldLink}<SearchSelect label={persisted.statuses.find(s=>s.id===oldLink.statusId)?.name??''} field={`type-status-replacement-${old.id}-${oldLink.statusId}`} value={typeStatusMigrations[old.id+':'+oldLink.statusId]??''} options={targetTypeStatuses(Number(typeMigrations[old.id])).map(s=>({value:String(s.id),label:s.name}))} onSelect={v=>typeStatusMigrations={...typeStatusMigrations,[old.id+':'+oldLink.statusId]:v}}/>{/each}
  </div>{/each}
  </div>{@render footer('types',dirtyTypes,types.some(t=>!t.name.trim()))}
 </section>
 <section class="settings-card" data-settings-card="statuses" aria-labelledby="project-statuses-heading">
  <header><h2 id="project-statuses-heading">{tr('状態','Statuses')}</h2></header><div class="card-body">{@render message('statuses')}
  <div class="column-head status-columns" aria-hidden="true"><span>{tr('状態名','Status name')}</span><span>{tr('区分','Category')}</span><span></span></div>
  <SortableList ids={statuses.map(s=>s.id)} label={tr('状態の順番を変更','Reorder statuses')} labelFor={id=>statuses.find(s=>s.id===id)?.name??''} disabled={saving==='statuses'} onreorder={ids=>{change('statuses');statuses=ids.map(id=>statuses.find(s=>s.id===id)!);}}>
   {#snippet children(id:number)}{@const status=statuses.find(s=>s.id===id)!}<div class="status-columns definition-row">
    <FormInput label={tr('状態名','Status name')} field={'status-name-'+id} showLabel={false} value={status.name} maxlength={64} disabled={saving==='statuses'} onValueChange={v=>{change('statuses');statuses=statuses.map(s=>s.id===id?{...s,name:v}:s);}}/>
    <SearchSelect field={'status-category-'+id} label={tr('区分','Category')} showLabel={false} value={status.category} options={['open','active','done','cancelled'].map((v,i)=>({value:v,label:[tr('未着手','Open'),tr('進行中','Active'),tr('完了','Done'),tr('中止','Cancelled')][i]}))} searchable={false} disabled={saving==='statuses'} onSelect={v=>{change('statuses');statuses=statuses.map(s=>s.id===id?{...s,category:v}:s);}}/>
    <DeleteIconButton label={tr('状態を削除','Delete status')+' · '+status.name} disabled={saving!==null||statuses.length===1} onclick={()=>{change('statuses');statuses=statuses.filter(s=>s.id!==id);}}/>
   </div>{/snippet}
  </SortableList>
  <ActionButton label={tr('状態を追加','Add status')} disabled={saving!==null||statuses.length>=50} onclick={()=>{change('statuses');statuses=[...statuses,{id:next--,name:'',category:'open',position:statuses.length}];}}/>
  {#each removedStatusLinks as old}<SearchSelect label={(persisted.types.find(t=>t.id===old.typeId)?.name??'')+' / '+(persisted.statuses.find(s=>s.id===old.statusId)?.name??'')+' → '+tr('移行先','Replacement')} field={`replace-status-${old.typeId}-${old.statusId}`} value={statusMigrations[old.typeId+':'+old.statusId]??''} options={statuses.filter(s=>!old.initial||!['done','cancelled'].includes(s.category)).map(s=>({value:String(s.id),label:s.name}))} onSelect={v=>{change('statuses');statusMigrations={...statusMigrations,[old.typeId+':'+old.statusId]:v};}}/>{/each}
  {#each changedInitials as old}<SearchSelect label={(persisted.types.find(t=>t.id===old.typeId)?.name??'')+' · '+tr('新しい初期状態','New initial status')} field={'replace-initial-'+old.typeId} value={statusMigrations['initial:'+old.typeId]??''} options={statuses.filter(s=>!['done','cancelled'].includes(s.category)).map(s=>({value:String(s.id),label:s.name}))} onSelect={v=>{change('statuses');statusMigrations={...statusMigrations,['initial:'+old.typeId]:v};}}/>{/each}
  </div>{@render footer('statuses',dirtyStatuses,statuses.some(s=>!s.name.trim()))}
 </section>
 <section class="settings-card" data-settings-card="mappings" aria-labelledby="project-mappings-heading">
  <header><h2 id="project-mappings-heading">{tr('種別ごとの状態','Statuses by type')}</h2></header><div class="card-body">{@render message('mappings')}
  <p class="hint">{tr('保存済みの種別と状態を使用します。使用する状態を選び、ハンドルで表示順を変更してください。','Uses saved types and statuses. Select allowed statuses and drag their handles to change the order.')}</p>
  {#each persisted.types as type}<fieldset><legend>{type.name}</legend>
   <SearchSelect label={tr('初期状態','Initial status')} field={'initial-'+type.id} value={String(links.find(l=>l.typeId===type.id&&l.initial)?.statusId??'')} options={allowed(type.id).filter(o=>!['done','cancelled'].includes(persisted.statuses.find(s=>String(s.id)===o.value)?.category??''))} disabled={saving==='mappings'} searchable={false} onSelect={v=>initial(type.id,Number(v))}/>
   <SortableList ids={linkOrder(type.id)} label={tr('使用可能状態の順番を変更','Reorder allowed statuses')} labelFor={id=>persisted.statuses.find(s=>s.id===id)?.name??''} canDrag={id=>links.some(l=>l.typeId===type.id&&l.statusId===id)} disabled={saving==='mappings'} onreorder={ids=>reorderLinks(type.id,ids)}>
    {#snippet children(id:number)}<FormCheckbox field={`allow-${type.id}-${id}`} label={persisted.statuses.find(s=>s.id===id)?.name??''} checked={links.some(l=>l.typeId===type.id&&l.statusId===id)} disabled={saving==='mappings'} onChange={v=>toggle(type.id,id,v)}/>{/snippet}
   </SortableList>
  </fieldset>{/each}
  {#each removedMappings as old}<SearchSelect label={(persisted.types.find(t=>t.id===old.typeId)?.name??'')+' / '+(persisted.statuses.find(s=>s.id===old.statusId)?.name??'')+' → '+tr('移行先（使用中の場合）','Replacement (if used)')} field={`mapping-replacement-${old.typeId}-${old.statusId}`} value={mappingMigrations[old.typeId+':'+old.statusId]??''} options={allowed(old.typeId)} onSelect={v=>{change('mappings');mappingMigrations={...mappingMigrations,[old.typeId+':'+old.statusId]:v};}}/>{/each}
  </div>{@render footer('mappings',dirtyMappings)}
 </section>
{/if}
</div>
<style>
 .settings-card[data-settings-card="basic"] h2{font-size:var(--font-size-section)}.basic-fields :global(.required){color:var(--danger)}
 .basic-fields.card-body{display:flex;flex-wrap:wrap;align-items:start}.basic-field{flex:0 0 auto;width:10rem;max-width:100%;min-width:0}.basic-name,.basic-engagement{width:16rem}.basic-fields :global(.status-notice){flex-basis:100%}@media(max-width:700px),(min-width:701px) and (max-width:1024px) and (max-height:500px) and (any-pointer:coarse){.basic-field{width:100%}.basic-fields :global(input),.basic-fields :global(.form-select-trigger){min-height:44px}}
 .settings{display:grid;gap:20px;min-width:0}.settings-card{min-width:0;border:1px solid var(--border);border-radius:var(--sph-radius-8px);background:var(--surface);box-shadow:var(--shadow)}header{padding:16px 20px;border-bottom:1px solid var(--border)}h2{font-size:var(--font-size-body);margin:0;font-weight:600}.card-body{display:grid;gap:14px;padding:20px;min-width:0}.column-head{margin-left:40px;color:var(--muted);font-size:var(--font-size-support)}.type-columns{display:grid;grid-template-columns:minmax(0,1fr) 120px 32px;gap:12px;align-items:center}.status-columns{display:grid;grid-template-columns:minmax(0,1fr) minmax(112px,.55fr) 32px;gap:12px;align-items:center}.definition-row{min-height:36px}.milestone-cell{display:flex;align-items:center;justify-content:center;height:36px}.milestone-cell :global(.form-checkbox-field){justify-content:center}.column-head.type-columns>span:nth-child(2){text-align:center}footer{display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;padding:14px 20px;border-top:1px solid var(--border)}fieldset{min-width:0;border:1px solid var(--border);border-radius:var(--sph-radius-4px);padding:16px;display:grid;gap:12px}legend{font-weight:500}.hint{margin:0;font-size:var(--font-size-support);line-height:1.6;color:var(--muted)}.migration{display:grid;gap:12px}@media(max-width:700px){header,footer{padding:14px 12px}.card-body{padding:16px 12px}.type-columns{grid-template-columns:minmax(0,1fr) 100px 32px;gap:8px}.status-columns{gap:8px;grid-template-columns:minmax(0,1fr) 112px 32px}.milestone-cell,.definition-row{min-height:44px}.milestone-cell{height:44px}fieldset{padding:12px}}
</style>
