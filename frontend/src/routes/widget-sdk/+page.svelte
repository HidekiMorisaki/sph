<script lang="ts">
 import {page} from '$app/state';
 import AssetManagementShell from '$lib/components/AssetManagementShell.svelte';
 import GuideInline from '$lib/components/GuideInline.svelte';
 import StatusNotice from '$lib/components/StatusNotice.svelte';
 import ModalActionButton from '$lib/components/ModalActionButton.svelte';
 import {localization} from '$lib/localization';
 import {parseGuide,type GuideBlock} from '$lib/guide-markdown';
 let ja=$derived($localization.displayLanguage==='ja');
 let storage=$derived(page.url.searchParams.get('document')==='storage');
 let title=$derived(storage?(ja?'ウィジェット保存仕様':'Widget storage guide'):(ja?'ウィジェットSDK・配布手順':'Widget SDK and distribution guide'));
 let blocks=$state<GuideBlock[]>([]),loading=$state(true),failed=$state(false),retry=$state(0);
 let headings=$derived(blocks.filter(block=>block.kind==='heading'&&block.level>1));
 $effect(()=>{
  const path=storage?'/widget-storage.md':'/widget-sdk.md?v=2';retry;
  const controller=new AbortController();loading=true;failed=false;blocks=[];
  void fetch(path,{cache:'no-store',signal:controller.signal}).then(async response=>{if(!response.ok)throw Error('Guide unavailable');const parsed=parseGuide(await response.text());if(!parsed.some(block=>block.kind==='heading'))throw Error('Invalid guide');if(!controller.signal.aborted)blocks=parsed;}).catch(()=>{if(!controller.signal.aborted)failed=true;}).finally(()=>{if(!controller.signal.aborted)loading=false;});
  return()=>controller.abort();
 });
</script>
<AssetManagementShell {title}>
 <div class="guide-page" id="guide-top">
  <nav class="guide-toolbar" aria-label={ja?'開発資料':'Development guides'}>
   <a href="/widget-editor">{ja?'ウィジェット開発へ':'Widget editor'}</a>
   <a href="/widget-sdk" aria-current={!storage?'page':undefined}>SDK</a>
   <a href="/widget-sdk?document=storage" aria-current={storage?'page':undefined}>{ja?'保存仕様':'Storage'}</a>
   <a href={storage?'/widget-storage.md':'/widget-sdk.md?v=2'} download>{ja?'Markdownをダウンロード':'Download Markdown'}</a>
  </nav>
  {#if loading}<p role="status">{ja?'資料を読み込み中…':'Loading guide…'}</p>
  {:else if failed}<StatusNotice message={ja?'資料を読み込めませんでした。再試行してください。':'Unable to load the guide. Please retry.'} tone="error" onDismiss={()=>retry++}/><ModalActionButton label={ja?'再試行':'Retry'} onclick={()=>retry++}/>
  {:else}
   <div class="guide-layout">
    <nav class="guide-toc" aria-label={ja?'目次':'Contents'}><h2>{ja?'目次':'Contents'}</h2><ul>{#each headings as heading}{#if heading.kind==='heading'}<li class:subheading={heading.level>2}><a href={'#'+heading.id}><GuideInline text={heading.text}/></a></li>{/if}{/each}</ul></nav>
    <article class="guide-content" aria-label={title}>
     {#each blocks as block}
      {#if block.kind==='heading'}
       {#if block.level===1}<h1 id={block.id}>{block.text}</h1>{:else if block.level===2}<h2 id={block.id}>{block.text}</h2>{:else}<h3 id={block.id}>{block.text}</h3>{/if}
      {:else if block.kind==='paragraph'}<p><GuideInline text={block.text}/></p>
      {:else if block.kind==='code'}<pre aria-label={block.language||'Code'}><code>{block.text}</code></pre>
      {:else if block.kind==='list'}{#if block.ordered}<ol>{#each block.items as item}<li><GuideInline text={item}/></li>{/each}</ol>{:else}<ul>{#each block.items as item}<li><GuideInline text={item}/></li>{/each}</ul>{/if}
      {:else if block.kind==='table'}<div class="guide-table" role="region" aria-label={ja?'仕様表':'Specification table'}><table><thead><tr>{#each block.headers as header}<th scope="col"><GuideInline text={header}/></th>{/each}</tr></thead><tbody>{#each block.rows as row}<tr>{#each row as cell}<td><GuideInline text={cell}/></td>{/each}</tr>{/each}</tbody></table></div>
      {/if}
     {/each}
     <p class="guide-back"><a href="#guide-top">{ja?'ページ先頭へ':'Back to top'}</a></p>
    </article>
   </div>
  {/if}
 </div>
</AssetManagementShell>
<style>
 .guide-page{min-width:0;max-width:1400px;margin:0 auto}.guide-toolbar{display:flex;flex-wrap:wrap;gap:8px 20px;padding:16px;margin-bottom:16px;border:1px solid var(--border);border-radius:7px;background:var(--surface)}.guide-toolbar a{display:inline-flex;align-items:center;min-height:36px}.guide-toolbar [aria-current=page]{font-weight:600;color:var(--text)}.guide-layout{display:grid;grid-template-columns:220px minmax(0,1fr);align-items:start;gap:16px}.guide-toc,.guide-content{min-width:0;background:var(--surface);border:1px solid var(--border);border-radius:7px;padding:20px}.guide-toc{position:sticky;top:88px}.guide-toc h2{font-size:var(--font-size-section);margin:0 0 12px}.guide-toc ul{list-style:none;margin:0;padding:0}.guide-toc li+li{margin-top:8px}.guide-toc li.subheading{padding-left:12px}.guide-toc a{display:block;overflow-wrap:anywhere;line-height:1.6}.guide-content{line-height:1.8;overflow-wrap:anywhere}.guide-content h1{font-size:24px;margin:0 0 20px;line-height:1.5}.guide-content h2{font-size:20px;margin:32px 0 12px}.guide-content h3{font-size:18px;margin:24px 0 12px}.guide-content :is(h1,h2,h3){scroll-margin-top:100px}.guide-content p{margin:12px 0}.guide-content li+li{margin-top:8px}.guide-content pre{max-width:100%;overflow:auto;padding:16px;background:var(--surface-secondary);border:1px solid var(--border);border-radius:4px;line-height:1.6;font-size:14px;white-space:pre-wrap;overflow-wrap:anywhere}.guide-content :global(code){font-family:ui-monospace,Consolas,monospace;font-size:.94em}.guide-content :global(p code),.guide-content :global(li code),.guide-content :global(td code){background:var(--surface-secondary);border-radius:3px;padding:1px 3px}.guide-page :global(a){color:var(--action-primary);text-underline-offset:3px}.guide-page :global(a:focus-visible){outline:2px solid var(--action-primary);outline-offset:3px}.guide-table{max-width:100%;overflow:auto;margin:16px 0;border:1px solid var(--border);border-radius:4px}.guide-table table{border-collapse:collapse;width:100%;font-size:var(--font-size-body)}.guide-table th,.guide-table td{padding:12px;text-align:left;vertical-align:top;border-bottom:1px solid var(--border)}.guide-table th{background:var(--surface-secondary);font-weight:600}.guide-table tr:last-child td{border-bottom:0}.guide-back{padding-top:20px;border-top:1px solid var(--border)}
 @media(max-width:1000px){.guide-layout{grid-template-columns:minmax(0,1fr)}.guide-toc{position:static}.guide-toc ul{display:flex;flex-wrap:wrap;gap:8px 20px}.guide-toc li+li{margin:0}.guide-toc li.subheading{padding-left:0}.guide-content,.guide-toc{padding:16px}.guide-toolbar a{min-height:44px}.guide-content h1{font-size:22px}}
</style>
