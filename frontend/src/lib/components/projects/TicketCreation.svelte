<script lang="ts">
 import {onMount} from 'svelte';
 import {localization} from '#lib/localization.js';
 import {canProject,projectRequest,projectError,type Project,type Ticket,type TicketDetail,type Relation} from '#lib/projects.js';
 import DetailModal from '../DetailModal.svelte';
 import SearchSelect from '../SearchSelect.svelte';
 import ActionButton from '../ActionButton.svelte';
 import StatusNotice from '../StatusNotice.svelte';
 import TicketModal from './TicketModal.svelte';
 let {employeeId,returnFocus,onclose,oncreated}:{employeeId:number;returnFocus:HTMLElement|null;onclose:()=>void;oncreated:(ticket:TicketDetail)=>Promise<void>}=$props();
 let ja=$derived($localization.displayLanguage==='ja');const tr=(j:string,e:string)=>ja?j:e;
 let candidates=$state<Array<Pick<Project,'id'|'code'|'name'|'status'>>>([]),selected=$state(''),project=$state<Project|null>(null),tickets=$state<Ticket[]>([]),relations=$state<Relation[]>([]),loading=$state(false),selecting=$state(false),busy=$state(false),hasMore=$state(false),composing=$state(false),error=$state('');
 let disposed=false,generation=0;
 const supported=(p:Pick<Project,'code'|'status'>)=>p.status!=='archived'&&/^[A-Z][A-Z0-9_]{0,63}$/.test(p.code);
 async function load(more=false){loading=true;error='';try{const rows=await projectRequest<Array<Pick<Project,'id'|'code'|'name'|'status'>>>('/v1/projects?limit=100&offset='+(more?candidates.length:0)+'&sortBy=code&sortOrder=asc');if(disposed)return;candidates=more?[...candidates,...rows]:rows;hasMore=rows.length===100;}catch(e){if(!disposed)error=projectError(e,ja);}finally{if(!disposed)loading=false;}}
 async function select(value:string){selected=value;project=null;error='';selecting=false;const request=++generation;if(!value)return;selecting=true;try{const p=await projectRequest<Project>('/v1/projects/'+value);if(disposed||request!==generation)return;if(!supported(p)||!canProject(p,'tickets.create')){error=tr('このプロジェクトではチケットを作成できません。作成権限のあるプロジェクトを選択してください。','You cannot create tickets in this project. Choose one where you have creation permission.');return;}project=p;}catch(e){if(!disposed&&request===generation)error=projectError(e,ja);}finally{if(!disposed&&request===generation)selecting=false;}}
 async function next(){if(!project||busy||selecting)return;busy=true;error='';try{const r=await fetch('/v1/projects/'+project.id+'/tickets?limit=500&sortBy=position');if(!r.ok)throw Error();const p=await r.json();if(disposed)return;tickets=p.data;relations=p.meta.relations;composing=true;}catch(e){if(!disposed)error=projectError(e,ja);}finally{if(!disposed)busy=false;}}
 onMount(()=>{void load();return()=>{disposed=true;generation++;};});
</script>
{#snippet projectHelp()}<p>{tr('作成先のプロジェクトを選んで「次へ」を押してください。アーカイブ済みのプロジェクトや作成権限のないプロジェクトには作成できません。','Choose a project and select Next. Archived projects and projects without creation permission cannot accept new tickets.')}</p>{/snippet}
{#if composing&&project}
 <TicketModal {project} {tickets} {relations} {employeeId} {returnFocus} {onclose} onchanged={async ticket=>{if(ticket)await oncreated(ticket);}}/>
{:else}
 <DetailModal title={tr('チケットを作成','Create ticket')} titleId="ticket-project-choice-title" closeLabel={tr('閉じる','Close')} {returnFocus} onClose={()=>{if(!busy)onclose();}}>
  {#if error}<StatusNotice message={error} tone="error" onDismiss={()=>error=''}/>{/if}
  <div class="project-choice"><SearchSelect label={tr('プロジェクト','Project')} field="ticket-new-project" value={selected} help={projectHelp} required disabled={loading||busy} options={[{value:'',label:tr('プロジェクトを選択','Select a project')},...candidates.filter(supported).map(p=>({value:String(p.id),label:p.code+' · '+p.name}))]} onSelect={value=>void select(value)}/></div>
  {#if !loading&&!candidates.filter(supported).length}<p>{tr('読み込み済みの候補に、選択できるプロジェクトはありません。','None of the loaded projects are available for selection.')}</p>{/if}
  {#if hasMore}<ActionButton label={tr('候補をさらに読み込む','Load more projects')} disabled={loading||busy} onclick={()=>void load(true)}/>{/if}
  {#if error&&!candidates.length}<ActionButton label={tr('再試行','Retry')} disabled={loading} onclick={()=>void load()}/>{/if}
  {#snippet actions()}<ActionButton label={tr('キャンセル','Cancel')} disabled={busy} onclick={onclose}/><ActionButton label={tr('次へ','Next')} variant="primary" disabled={!project||loading||selecting||busy} onclick={()=>void next()}/>{/snippet}
 </DetailModal>
{/if}
<style>.project-choice{width:calc((100% - 16px)/2);min-width:0}p{color:var(--muted);font-size:var(--font-size-support)}@media(max-width:700px),(min-width:701px) and (max-width:1024px) and (max-height:500px) and (any-pointer:coarse){.project-choice{width:100%}}</style>
