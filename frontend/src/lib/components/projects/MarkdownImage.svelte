<script lang="ts">
 import {localization} from '$lib/localization';
 import {markdownImagePattern} from '$lib/project-markdown';
 let {href,alt=''}:{href:string;alt?:string}=$props();
 let url=$state(''),failed=$state(false);
 $effect(()=>{
  const key=markdownImagePattern.exec(href)?.[1],controller=new AbortController();url='';failed=false;
  if(key)void fetch('/v1/project-markdown-images/'+key,{signal:controller.signal,cache:'no-store'}).then(async r=>{
   if(!r.ok)throw Error();const {data}=await r.json();
   if(!['image/png','image/jpeg','image/webp'].includes(data.mime)||typeof data.data!=='string'||data.data.length>14*1024*1024||!/^[A-Za-z0-9+/]*={0,2}$/.test(data.data))throw Error();
   if(!controller.signal.aborted)url='data:'+data.mime+';base64,'+data.data;
  }).catch(()=>{if(!controller.signal.aborted)failed=true;});
  else failed=true;
  return ()=>controller.abort();
 });
</script>
{#if url}<img src={url} {alt} loading="lazy"/>{:else}<span class="image-status">{alt} {$localization.displayLanguage==='ja'?(failed?'（画像を表示できません）':'（画像を読み込み中…）'):(failed?'(Image unavailable)':'(Loading image…)')}</span>{/if}
<style>img{display:inline-block;max-width:100%;height:auto;vertical-align:middle}.image-status{font-size:var(--font-size-support);color:var(--muted)}</style>
