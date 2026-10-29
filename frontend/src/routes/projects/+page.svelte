<script lang="ts">
 import {onMount} from 'svelte';
 import {goto} from '$app/navigation';
 import AssetManagementShell from '$lib/components/AssetManagementShell.svelte';
 import ViewportListPage from '$lib/components/ViewportListPage.svelte';
 import MasterPageHeader from '$lib/components/MasterPageHeader.svelte';
 import MasterList from '$lib/components/MasterList.svelte';
 import SearchPanel from '$lib/components/SearchPanel.svelte';
 import ActionButton from '$lib/components/ActionButton.svelte';
 import ProjectColumnSettings from '$lib/components/projects/ProjectColumnSettings.svelte';
 import {projectColumns,defaultProjectColumns} from '$lib/project-columns';
 import AddButton from '$lib/components/AddButton.svelte';
 import StatusNotice from '$lib/components/StatusNotice.svelte';
 import ProjectForm from '$lib/components/projects/ProjectForm.svelte';
 import {localization} from '$lib/localization';
 import {initialSearch} from '$lib/search';
 import {readSessionUser} from '$lib/client-session';
 import {canOperate,type SessionUser} from '$lib/auth';
 import {projectError,projectRequest,type Project} from '$lib/projects';
 type ProjectListRow=Project&{updatedAt:string};
 let user=$state<SessionUser|null>(null),error=$state(''),creating=$state(false),trigger=$state<HTMLElement|null>(null),searchState=$state(initialSearch('projects')),engagements=$state<Array<{id:number;name:string}>>([]);
 let columns=$state([...defaultProjectColumns]),columnsReady=$state(false),columnError=$state(false),columnOpen=$state(false),columnTrigger=$state<HTMLElement|null>(null);
 let ja=$derived($localization.displayLanguage==='ja');const t=(j:string,e:string)=>ja?j:e;
 onMount(()=>{void(async()=>{try{user=await readSessionUser();if(user)await loadColumns();if(user&&canOperate(user,'engagements.read')){let offset=0;while(true){const rows=await projectRequest<Array<{id:number;name:string}>>('/v1/engagements?limit=500&offset='+offset);engagements.push(...rows);if(rows.length<500)break;offset+=500;}}}catch(e){error=projectError(e,ja);}})();});
 async function loadColumns(){columnError=false;try{const p=await projectRequest<{employeeId:number;columns:string[]}>('/v1/personal-settings/project-columns');if(p.employeeId!==user?.id)throw Error();columns=p.columns;columnsReady=true;}catch{columnError=true;}}
 const label=(key:string)=>projectColumns.find(c=>c[0]===key)?.[ja?1:2]??key;
 function value(p:ProjectListRow,key:string){switch(key){case 'code':return p.code;case 'name':return p.name;case 'status':return ({active:t('進行中','Active'),on_hold:t('保留','On hold'),completed:t('完了','Completed'),archived:t('アーカイブ','Archived')} as Record<string,string>)[p.status]??p.status;case 'visibility':return p.visibility==='private'?t('参加者限定','Members only'):t('社内公開','Internal');case 'updatedAt':return String(p.updatedAt).slice(0,10);default:return '';}}
 const widths:Record<string,number>={code:15,name:35,status:15,visibility:15,updatedAt:20};
 let totalWidth=$derived(columns.reduce((sum,key)=>sum+widths[key],0));
 let displayColumns=$derived(columns.map(key=>({key,label:label(key),width:widths[key]/totalWidth*100,value:(p:ProjectListRow)=>value(p,key)})));
</script>
{#snippet actions()}<ActionButton label={t('表示項目','Display columns')} disabled={!columnsReady||!canOperate(user,'projects.preferences.update')} onclick={e=>{columnTrigger=e.currentTarget as HTMLElement;columnOpen=true;}}/>{#if canOperate(user,'projects.create')}<AddButton iconOnly label={t('プロジェクトを作成','Create project')} onclick={e=>{trigger=e.currentTarget as HTMLElement;creating=true;}}/>{/if}{/snippet}
{#snippet mobileProject(item:ProjectListRow)}<div class="mobile-project">{#each columns as key}<p data-column={key}><span>{label(key)}</span>{value(item,key)}</p>{/each}</div>{/snippet}
<AssetManagementShell title={t('プロジェクト一覧','Project list')}><ViewportListPage><MasterPageHeader title={t('プロジェクト一覧','Project list')}/>
 {#if error}<StatusNotice message={error} tone="error" onDismiss={()=>error=''}/>{/if}
 {#if columnError}<StatusNotice message={t('表示項目設定を取得できませんでした。','Unable to load column preferences.')} tone="error" onDismiss={()=>columnError=false}/>{/if}
 {#if !columnsReady&&user}<ActionButton label={t('表示項目設定を再取得','Retry column preferences')} onclick={loadColumns}/>{/if}
 {#if user}<SearchPanel target="projects" storageNamespace="projects-v1" userId={user.id} bind:searchState onRestoreOptions={()=>{}}/>{/if}
 <MasterList pageSizeStorageKey="projects-v1:list:size" sortStorageKey="projects-v1:list:sort" bind:searchState mobileItem={mobileProject} endpoint="/v1/project-searches" title={t('プロジェクト一覧','Project list')} listHeading={t('プロジェクト','Projects')} description="" initialSortBy="name" headerActions={actions} canDetail onDetail={item=>void goto('/projects/'+item.code+'/overview')} minTableWidth={640} columns={displayColumns}/>
</ViewportListPage></AssetManagementShell>
{#if creating}<ProjectForm {engagements} returnFocus={trigger} onclose={()=>creating=false} onsaved={p=>{creating=false;void goto('/projects/'+p.code+'/overview');}}/>{/if}
{#if columnOpen&&user}<ProjectColumnSettings {columns} userId={user.id} returnFocus={columnTrigger} onclose={()=>columnOpen=false} onsaved={next=>{columns=next;columnOpen=false;}}/>{/if}
<style>.mobile-project{display:grid;gap:6px;min-width:0;overflow-wrap:anywhere}.mobile-project p{display:flex;gap:12px;margin:0;font-size:var(--font-size-support);color:var(--text)}.mobile-project p span{flex:0 0 110px;color:var(--muted)}</style>
