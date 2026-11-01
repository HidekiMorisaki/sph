<script lang="ts">
 import {untrack} from 'svelte';
 import {beforeNavigate} from '$app/navigation';
 import {localization} from '$lib/localization';
 import {projectRequest,projectError,type Project} from '$lib/projects';
 import MarkdownEditor from './MarkdownEditor.svelte';
 import ActionButton from '$lib/components/ActionButton.svelte';
 import StatusNotice from '$lib/components/StatusNotice.svelte';
 let {project,onclose,onsaved}:{project:Project;onclose:()=>void;onsaved:(project:Project)=>void}=$props();
 const original=untrack(()=>project.description),revision=untrack(()=>project.revision);
 let value=$state(original),busy=$state(false),uploading=$state(false),error=$state(''),completed=false;
 let dirty=$derived(value!==original),ja=$derived($localization.displayLanguage==='ja');const tr=(j:string,e:string)=>ja?j:e;
 function discard(){return !dirty||confirm(tr('説明の変更を破棄しますか？','Discard description changes?'));}
 function close(){if(!busy&&!uploading&&discard())onclose();}
 beforeNavigate(n=>{if(busy||uploading||!completed&&!discard())n.cancel();});
 async function save(){if(busy||uploading||!dirty)return;busy=true;error='';try{const updated=await projectRequest<Project>('/v1/projects/'+project.id,'PATCH',{description:value,revision});completed=true;onsaved(updated);}catch(e){error=projectError(e,ja);}finally{busy=false;}}
</script>
<svelte:window onbeforeunload={event=>{if(!completed&&(dirty||busy||uploading)){event.preventDefault();event.returnValue='';}}}/>
<div class="description-editor">
 {#if error}<StatusNotice tone="error" message={error} onDismiss={()=>error=''}/>{/if}
 <MarkdownEditor label={tr('説明','Description')} field="project-description-inline" labelToolbar {value} maxlength={5000} disabled={busy} imageContext={{target:'project',project:project.code}} onUploadState={v=>uploading=v} onValueChange={v=>value=v}/>
 <div class="description-actions"><ActionButton label={tr('キャンセル','Cancel')} disabled={busy||uploading} onclick={close}/><ActionButton label={tr('保存','Save')} variant="primary" disabled={busy||uploading||!dirty} onclick={()=>void save()}/></div>
</div>
<style>.description-editor{display:grid;gap:12px;min-width:0}.description-actions{display:flex;justify-content:flex-end;gap:8px}</style>
