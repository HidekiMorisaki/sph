<script lang="ts">
 import type {MarkdownNode} from '#lib/project-markdown.js';
 import {referenceParts} from '#lib/project-markdown.js';
 import MarkdownNodes from './MarkdownNodes.svelte';
 import MarkdownCode from './MarkdownCode.svelte';
 import MarkdownImage from './MarkdownImage.svelte';
 let {nodes,links={},linkify=true}:{nodes:MarkdownNode[];links?:Record<string,string>;linkify?:boolean}=$props();
</script>
{#each nodes as node}
 {#if node.kind==='text'}
  {#if linkify&&!node.literal}{#each referenceParts(node.text??'') as part}{#if part.code&&links[part.code]}<a href={links[part.code]}>{part.text}</a>{:else}{part.text}{/if}{/each}{:else}{node.text}{/if}
 {:else if node.kind==='paragraph'}<p><MarkdownNodes nodes={node.children??[]} {links} {linkify}/></p>
 {:else if node.kind==='heading'}<svelte:element this={'h'+Math.max(1,Math.min(6,node.level??2))}><MarkdownNodes nodes={node.children??[]} {links} {linkify}/></svelte:element>
 {:else if node.kind==='strong'}<strong><MarkdownNodes nodes={node.children??[]} {links} {linkify}/></strong>
 {:else if node.kind==='em'}<em><MarkdownNodes nodes={node.children??[]} {links} {linkify}/></em>
 {:else if node.kind==='del'}<del><MarkdownNodes nodes={node.children??[]} {links} {linkify}/></del>
 {:else if node.kind==='quote'}<blockquote><MarkdownNodes nodes={node.children??[]} {links} {linkify}/></blockquote>
 {:else if node.kind==='break'}<br/>
 {:else if node.kind==='rule'}<hr/>
 {:else if node.kind==='inline-code'}<code class="inline-code">{node.text}</code>
 {:else if node.kind==='code'}<MarkdownCode source={node.text??''} language={node.language} title={node.title}/>
 {:else if node.kind==='link'}{#if node.href}<a href={node.href} rel="noopener noreferrer"><MarkdownNodes nodes={node.children??[]} linkify={false}/></a>{:else}<MarkdownNodes nodes={node.children??[]} linkify={false}/>{/if}
 {:else if node.kind==='image'}{#if node.href?.startsWith('sph-image:')}<MarkdownImage href={node.href} alt={node.text}/>{:else if node.href}<a href={node.href} rel="noopener noreferrer">{node.text||node.href}</a>{:else}<span>{node.text}</span>{/if}
 {:else if node.kind==='list'}{#if node.ordered}<ol start={node.start}><MarkdownNodes nodes={node.children??[]} {links} {linkify}/></ol>{:else}<ul><MarkdownNodes nodes={node.children??[]} {links} {linkify}/></ul>{/if}
 {:else if node.kind==='item'}<li>{#if node.checked!==undefined}<input type="checkbox" checked={node.checked} disabled aria-label={node.checked?'✓':'☐'}/>{/if}<MarkdownNodes nodes={node.children??[]} {links} {linkify}/></li>
 {:else if node.kind==='table'}<div class="markdown-table"><table><tbody><MarkdownNodes nodes={node.children??[]} {links} {linkify}/></tbody></table></div>
 {:else if node.kind==='row'}<tr><MarkdownNodes nodes={node.children??[]} {links} {linkify}/></tr>
 {:else if node.kind==='cell'}{#if node.header}<th scope="col"><MarkdownNodes nodes={node.children??[]} {links} {linkify}/></th>{:else}<td><MarkdownNodes nodes={node.children??[]} {links} {linkify}/></td>{/if}
 {/if}
{/each}
<style>
 p{margin:0 0 12px;white-space:normal}p:last-child{margin-bottom:0}h1,h2,h3,h4,h5,h6{margin:16px 0 8px;line-height:1.4;font-weight:600}h1{font-size:1.5em}h2{font-size:1.3em}h3{font-size:1.15em}h4,h5,h6{font-size:1em}a{color:var(--action-primary);text-decoration:underline;text-underline-offset:2px;overflow-wrap:anywhere}blockquote{border-left:3px solid var(--border);margin:12px 0;padding:4px 12px;color:var(--text-secondary)}ul,ol{margin:8px 0;padding-left:24px}li{margin:4px 0}.inline-code{font-family:ui-monospace,SFMono-Regular,Consolas,'Liberation Mono',monospace;background:var(--surface-hover);padding:2px 4px;border-radius:3px;white-space:break-spaces;overflow-wrap:anywhere}.markdown-table{max-width:100%;overflow:auto;margin:12px 0}table{border-collapse:collapse;min-width:100%}th,td{border:1px solid var(--border);padding:8px 12px;text-align:left;vertical-align:top}th{background:var(--surface-hover)}hr{border:0;border-top:1px solid var(--border);margin:16px 0}input[type=checkbox]{margin-right:8px}
</style>
