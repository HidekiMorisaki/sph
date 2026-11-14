<script lang="ts">
 import {localization,formatEmployeeName} from '#lib/localization.js';
 import {inferPersonNameLocale} from '#lib/person-name.js';
 import {initialSearch,type SearchState} from '#lib/search.js';
 import {searchConfigurations} from '#lib/search-configurations.js';
 import {canProject,projectRequest,projectError,type Project,type Person} from '#lib/projects.js';
 import SearchPanel from '../SearchPanel.svelte';
 import ViewportListPage from '../ViewportListPage.svelte';
 import PageTabs from '../PageTabs.svelte';
 import SearchSelect from '../SearchSelect.svelte';
 import ActionButton from '../ActionButton.svelte';
 import DeleteIconButton from '../DeleteIconButton.svelte';
 import StatusNotice from '../StatusNotice.svelte';
 import MasterList from '../MasterList.svelte';
 let {project,userId,onchanged}:{project:Project;userId:number|null;onchanged:(p:Project)=>void}=$props();
 let ja=$derived($localization.displayLanguage==='ja');const tr=(j:string,e:string)=>ja?j:e;
 let canManage=$derived(project.status!=='archived'&&canProject(project,'members.manage',true));
 let view=$state('members'),searchState=$state<SearchState>(initialSearch('projectMembers')),busy=$state(false),error=$state('');
 let candidateRoles=$state<Record<number,string>>({});
 let configuration=$derived({...searchConfigurations.projectMembers,fieldsEndpoint:`/v1/project-member-search-fields?projectId=${project.id}&view=${view}`});
 let title=$derived(view==='members'?tr('参加者','Members'):tr('追加候補の社員','Employees to add'));
 const roles=()=>['manager','editor','viewer'].map((value,i)=>({value,label:[tr('管理者','Manager'),tr('編集者','Editor'),tr('閲覧者','Viewer')][i]}));
 const fullName=(employee:Person)=>formatEmployeeName({...employee,middleName:null},$localization);
 const graphemes=new Intl.Segmenter(undefined,{granularity:'grapheme'});
 function monogram(employee:Person){
  const locale=inferPersonNameLocale(employee)==='ja'?'ja':'en';
  const name=locale==='ja'?employee.firstName:employee.lastName;
  const first=graphemes.segment(name.trim())[Symbol.iterator]().next().value?.segment??'';
  const upper=first.toLocaleUpperCase(locale);
  return [...graphemes.segment(upper)].length===1?upper:first;
 }
 $effect(()=>{if(!canManage&&view==='candidates')view='members';});
 async function update(employeeId:number,nextRole:string){busy=true;error='';try{const p=await projectRequest<Project>(`/v1/projects/${project.id}/members/${employeeId}`,'PATCH',{revision:project.revision,role:nextRole});delete candidateRoles[employeeId];onchanged(p);}catch(e){error=projectError(e,ja);}finally{busy=false;}}
</script>
{#snippet employeeCell(employee:Person)}
 <div class="employee-cell"><span class="avatar" aria-hidden="true">{monogram(employee)}</span><div><strong>{fullName(employee)}</strong><small>{employee.employeeCode}</small></div></div>
{/snippet}
{#snippet roleCell(employee:Person)}
 {@const member=project.members.find(m=>m.employeeId===employee.id)}
 {#if canManage}<div class="member-role"><SearchSelect label={tr('役割','Role')} showLabel={false} field={'member-role-'+employee.id} value={view==='members'?member?.role??'viewer':candidateRoles[employee.id]??'editor'} options={roles()} searchable={false} disabled={busy||searchState.loading} onSelect={value=>{if(view==='members')void update(employee.id,value);else candidateRoles[employee.id]=value;}}/></div>
 {:else}<span>{roles().find(r=>r.value===member?.role)?.label??member?.role}</span>{/if}
{/snippet}
{#snippet memberActions(employee:Person)}
 {#if canManage}<div class="member-actions">{#if view==='members'}<DeleteIconButton label={tr('参加を解除','Remove member')} disabled={busy||searchState.loading} onclick={()=>{if(confirm(tr('参加を解除しますか？','Remove this member?')))void update(employee.id,'removed');}}/>
 {:else}<ActionButton label={tr('参加者を追加','Add member')} variant="primary" disabled={busy||searchState.loading} onclick={()=>void update(employee.id,candidateRoles[employee.id]??'editor')}/>{/if}</div>{/if}
{/snippet}
{#snippet mobileEmployee(employee:Person)}
 <div class="mobile-employee">{@render employeeCell(employee)}<div class="mobile-member-controls">{@render roleCell(employee)}{@render memberActions(employee)}</div></div>
{/snippet}
{#snippet memberSearchTabs()}
 <PageTabs embedded idPrefix="project-member-search" panelPrefix="project-member-search-panel" label={tr('検索対象','Search scope')} bind:active={view} tabs={[{id:'members',label:tr('登録済み参加者','Current members')},...(canManage?[{id:'candidates',label:tr('追加候補の社員','Employees to add')}]:[])]}/>
{/snippet}
<div class="member-page">
 <ViewportListPage>
 {#if userId}<SearchPanel parentTabs={memberSearchTabs} panelId={'project-member-search-panel-'+view} panelLabelledBy={'project-member-search-'+view+'-tab'} target="projectMembers" {configuration} storageNamespace={'project-members-'+project.id} {userId} bind:searchState onRestoreOptions={()=>{}}/>{/if}
 {#if error}<StatusNotice message={error} tone="error" onDismiss={()=>error=''}/>{/if}
 <div class="member-results" aria-busy={searchState.loading||busy}>
 {#key view+':'+project.revision}
 <MasterList bind:searchState endpoint={`/v1/project-member-searches?projectId=${project.id}&view=${view}`} {title} listHeading={title} description="" initialSortBy="lastName" pageSizeStorageKey="project-members-page-size" minTableWidth={720} mobileItem={mobileEmployee} loadingLabel={tr('検索中…','Searching…')} emptyLabel={view==='members'?tr('検索条件に一致する参加者はいません。','No members match your search.'):tr('検索条件に一致する追加可能な社員はいません。','No employees are available to add for these conditions.')} columns={[
  {key:'lastName',label:tr('従業員','Employee'),width:40,cell:employeeCell},
  {key:'employeeCode',label:tr('社員コード','Employee code'),width:20,value:(employee:Person)=>employee.employeeCode},
  {key:'role',label:tr('役割','Role'),width:20,cell:roleCell,sortable:false},
  ...(canManage?[{key:'actions',label:tr('操作','Actions'),width:20,cell:memberActions,sortable:false}]:[])
 ]}/>
 {/key}
 </div></ViewportListPage>
</div>
<style>

 .member-page{min-width:0}.member-results{min-width:0}
 .employee-cell{display:flex;align-items:center;gap:var(--sph-space-8px)}.employee-cell>div{min-width:0}.employee-cell strong{display:block;min-width:0;overflow:hidden;color:var(--text);font-weight:var(--sph-weight-500);text-overflow:ellipsis;white-space:nowrap}.employee-cell small{display:block;color:var(--muted);font-size:var(--font-size-support)}
 .avatar{display:grid;flex:0 0 24px;height:24px;place-items:center;background:var(--sph-color-accent);color:var(--sph-color-on-emphasis);border-radius:50%;font-size:var(--font-size-support);font-weight:var(--sph-weight-600)}
 .member-role{min-width:0;max-width:200px}.member-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
 .mobile-member-controls{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:var(--sph-space-8px) 0 0 var(--sph-space-32px)}.mobile-member-controls .member-role{flex:1}.mobile-member-controls .member-actions{flex:none}
 @media(max-width:700px),(min-width:701px) and (max-width:1024px) and (max-height:500px) and (any-pointer:coarse){.mobile-employee .employee-cell strong{white-space:normal;overflow-wrap:anywhere}.mobile-member-controls{flex-wrap:wrap}.mobile-member-controls .member-role{min-width:100px}}
</style>
