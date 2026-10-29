<script lang="ts">
 import {untrack} from 'svelte';
 import {beforeNavigate} from '$app/navigation';
 import {localization} from '$lib/localization';
 import type {Project} from '$lib/projects';
 import {projectRequest,projectError} from '$lib/projects';
 import DetailModal from '$lib/components/DetailModal.svelte';
 import FormInput from '$lib/components/FormInput.svelte';
 import FormTextarea from '$lib/components/FormTextarea.svelte';
 import SearchSelect from '$lib/components/SearchSelect.svelte';
 import ActionButton from '$lib/components/ActionButton.svelte';
 import StatusNotice from '$lib/components/StatusNotice.svelte';
 import DiscardChangesDialog from '$lib/components/DiscardChangesDialog.svelte';
 let {project=null,onclose,onsaved,returnFocus=null,engagements=[]}:{project?:Project|null;onclose:()=>void;onsaved:(p:Project)=>void;returnFocus?:HTMLElement|null;engagements?:Array<{id:number;name:string}>}=$props();
 let ja=$derived($localization.displayLanguage==='ja');const t=(j:string,e:string)=>ja?j:e;
 let code=$state(untrack(()=>project?.code??''));
 let name=$state(untrack(()=>project?.name??'')),description=$state(untrack(()=>project?.description??'')),visibility=$state(untrack(()=>project?.visibility??'private')),status=$state(untrack(()=>project?.status??'active')),engagementId=$state(untrack(()=>String(project?.engagement?.id??'')));
 const initial=untrack(()=>JSON.stringify({code,name,description,visibility,status,engagementId}));let dirty=$derived(JSON.stringify({code,name,description,visibility,status,engagementId})!==initial),discard=$state(false),completed=$state(false),busy=$state(false),error=$state('');
 function close(){if(busy)return;if(dirty)discard=true;else onclose();}
 beforeNavigate(n=>{if(dirty&&!completed&&!confirm(t('入力を破棄して移動しますか？','Discard changes and leave?')))n.cancel();});
 async function save(){busy=true;error='';try{const p=await projectRequest<Project>('/v1/projects'+(project?'/'+project.id:''),project?'PATCH':'POST',{name,description,visibility,...(!project?{code}:{}),...(project?{status,revision:project.revision}:{}),...(engagements.length?{engagementId:engagementId?Number(engagementId):null}:{})});completed=true;onsaved(p);}catch(e){error=projectError(e,ja);}finally{busy=false;}}
</script>
{#snippet codeHelp()}<p>{t('英字で始まる半角大文字英数字と _（1〜64文字）。ハイフンは使用できません。登録後は変更できません。','Use 1–64 uppercase ASCII letters, digits or underscores, starting with a letter. Hyphens are not allowed. The code cannot be changed after creation.')}</p>{/snippet}
{#snippet visibilityHelp()}<p>{t('参加者限定は参加者と権限を持つシステム管理者が閲覧できます。社内公開はプロジェクトの閲覧権限を持つ社員が閲覧できます。','Members only allows project members and authorized system administrators to view the project. Internal allows employees with project read permission to view it.')}</p>{/snippet}
{#snippet engagementHelp()}<p>{t('関連する業務管理の案件を選択します。関連付けだけでは、案件の情報や参加者はコピーされません。','Select a related client engagement. Linking an engagement does not copy its information or participants.')}</p>{/snippet}
<DetailModal title={project?t('プロジェクトを編集','Edit project'):t('プロジェクトを作成','Create project')} titleId="project-form-title" closeLabel={t('閉じる','Close')} {returnFocus} onClose={close}>
 {#if error}<StatusNotice message={error} tone="error" onDismiss={()=>error=''}/>{/if}
 <div class="project-fields">
 <FormInput label={t('プロジェクトコード','Project code')} field="project-code" value={code} placeholder={t('例：DEVELOP_001','e.g. DEVELOP_001')} help={codeHelp} required maxlength={64} disabled={busy||Boolean(project)} onValueChange={v=>code=v.replace(/[a-z]/g,c=>c.toUpperCase())}/>
 <FormInput label={t('名称','Name')} field="project-name" value={name} placeholder={t('例：社内システム開発','e.g. Internal system development')} required maxlength={128} disabled={busy} onValueChange={v=>name=v}/>
 <SearchSelect label={t('公開範囲','Visibility')} field="project-visibility" value={visibility} help={visibilityHelp} options={[{value:'private',label:t('参加者限定','Members only')},{value:'internal',label:t('社内公開','Internal')}]} searchable={false} disabled={busy} onSelect={v=>visibility=v}/>
 {#if engagements.length}<SearchSelect label={t('関連する案件','Engagement')} field="project-engagement" value={engagementId} help={engagementHelp} options={[{value:'',label:t('なし','None')},...engagements.map(e=>({value:String(e.id),label:e.name}))]} disabled={busy} onSelect={v=>engagementId=v}/>{/if}
 {#if project}<SearchSelect label={t('状態','Status')} field="project-status" value={status} options={['active','on_hold','completed','archived'].map((v,i)=>({value:v,label:[t('進行中','Active'),t('保留','On hold'),t('完了','Completed'),t('アーカイブ','Archived')][i]}))} searchable={false} disabled={busy} onSelect={v=>status=v}/>{/if}
 <div class="field-wide"><FormTextarea label={t('説明','Description')} field="project-description" value={description} placeholder={t('例：社内業務を効率化するシステムを開発します。','e.g. Develop a system to streamline internal operations.')} maxlength={5000} disabled={busy} onValueChange={v=>description=v}/></div>
 </div>
 {#snippet actions()}<ActionButton label={t('キャンセル','Cancel')} disabled={busy} onclick={close}/><ActionButton label={t('保存','Save')} variant="primary" disabled={busy||!name.trim()||!code.trim()} onclick={save}/>{/snippet}
</DetailModal>
{#if discard}<DiscardChangesDialog onContinue={()=>discard=false} onDiscard={()=>{discard=false;onclose();}}/>{/if}
<style>.project-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;min-width:0;align-items:start}.field-wide{grid-column:1/-1;min-width:0}@media(max-width:700px),(min-width:701px) and (max-width:1024px) and (max-height:500px) and (any-pointer:coarse){.project-fields{grid-template-columns:minmax(0,1fr)}}</style>
