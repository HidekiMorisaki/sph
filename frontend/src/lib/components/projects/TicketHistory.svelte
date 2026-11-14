<script lang="ts">
 import {onDestroy} from 'svelte';
 import {localization,formatTimestamp} from '#lib/localization.js';
 import {historyTitle,historyLines} from '#lib/project-history.js';
 import {lineDiff,descriptionChange,withoutDescription} from '#lib/project-history-diff.js';
 import {personName,type Project,type History} from '#lib/projects.js';
 import ActionButton from '#lib/components/ActionButton.svelte';
 import LoadingSpinner from '#lib/components/LoadingSpinner.svelte';
 let {project,ticketId,revision,active}:{project:Project;ticketId:number;revision:number;active:boolean}=$props();
 let ja=$derived($localization.displayLanguage==='ja');const tr=(j:string,e:string)=>ja?j:e;
 let entries=$state<History[]>([]),total=$state(0),loading=$state(false),error=$state(false),loaded=$state('');let sequence=0;
 $effect(()=>{const key=`${project.id}/${ticketId}/${revision}`;if(active&&loaded!==key){loaded=key;void load(false);}});
 onDestroy(()=>{sequence++;});
 async function load(more:boolean){const request=++sequence;loading=true;error=false;if(!more){entries=[];total=0;}try{const r=await fetch(`/v1/projects/${project.id}/tickets/${ticketId}/history?limit=100&offset=${more?entries.length:0}&sortOrder=desc`);if(!r.ok)throw Error();const payload=await r.json();if(request!==sequence)return;entries=more?[...entries,...payload.data]:payload.data;total=payload.meta.total;}catch{if(request===sequence)error=true;}finally{if(request===sequence)loading=false;}}
</script>
<section class="app-detail-section ticket-history" aria-label={tr('履歴','History')} aria-busy={loading}>
 {#each entries as entry (entry.id)}
 {@const change=descriptionChange(entry.detail)}
 {@const lines=historyLines(withoutDescription(entry.detail),project,ja)}
 <article><strong>{historyTitle(entry.kind,ja)}</strong><small>{formatTimestamp(entry.createdAt,$localization)} · {personName(entry.actor)}</small>
 {#if lines.length}<ul>{#each lines as line}<li>{line}</li>{/each}</ul>{/if}
 {#if change}<div class="description-diff" aria-label={tr('説明の差分','Description diff')}><h4>{tr('説明の差分','Description diff')}</h4><pre>{#each lineDiff(change.before,change.after) as line}<span class:added={line.kind==='added'} class:removed={line.kind==='removed'}><span aria-label={line.kind==='added'?tr('追加','Added'):line.kind==='removed'?tr('削除','Removed'):tr('変更なし','Unchanged')}>{line.kind==='added'?'+':line.kind==='removed'?'−':' '}</span> {line.text}{'\n'}</span>{/each}</pre></div>{/if}
 </article>{/each}
 {#if error}<p role="alert">{tr('履歴を取得できませんでした。','Unable to load history.')}</p><ActionButton label={tr('再読み込み','Reload')} onclick={()=>void load(entries.length>0)}/>{:else if loading}<LoadingSpinner label={tr('履歴を読み込み中…','Loading history…')} compact/>{:else if !entries.length}<p>{tr('履歴はありません。','No history recorded yet.')}</p>{/if}
 {#if !loading&&!error&&entries.length<total}<ActionButton label={tr('さらに読み込む','Load more')} onclick={()=>void load(true)}/>{/if}
</section>
<style>
 article{display:grid;gap:8px;padding:12px 0;border-bottom:1px solid var(--border);min-width:0}article:last-of-type{border-bottom:0}small{color:var(--muted)}li{white-space:pre-wrap;overflow-wrap:anywhere}h4{margin:0 0 8px;font-size:var(--font-size-body)}pre{margin:0;border:1px solid var(--border);border-radius:5px;white-space:pre-wrap;overflow-wrap:anywhere;font-size:var(--font-size-support)}pre>span{display:block;padding:0 8px;min-height:1.5em}.added{background:color-mix(in srgb,#16a34a 15%,var(--surface))}.removed{background:color-mix(in srgb,#e11d48 15%,var(--surface))}
</style>
