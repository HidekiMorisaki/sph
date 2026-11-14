<script lang="ts">
 import {parseProjectMarkdown,referenceCandidates,resolveMarkdownReferences} from '#lib/project-markdown.js';
 import MarkdownNodes from './MarkdownNodes.svelte';
 let {source}:{source:string}=$props();
 let nodes=$derived(parseProjectMarkdown(source));
 let links=$state<Record<string,string>>({});
 $effect(()=>{
  const codes=referenceCandidates(nodes),controller=new AbortController();links={};
  const timer=setTimeout(()=>{if(codes.length)void resolveMarkdownReferences(codes,controller.signal).then(rows=>{if(!controller.signal.aborted)links=Object.fromEntries(rows.map(row=>[row.code,row.href]));}).catch(()=>{/* Keep text on lookup failure. */});},250);
  return ()=>{clearTimeout(timer);controller.abort();};
 });
</script>
<div class="markdown-body"><MarkdownNodes {nodes} {links}/></div>
<style>.markdown-body{min-width:0;max-width:100%;contain:inline-size;overflow:hidden;color:var(--text-secondary);font-size:var(--font-size-body);line-height:1.7;overflow-wrap:anywhere;white-space:normal}</style>
