<script lang="ts">
 import {guideInline} from '$lib/guide-markdown';
 let {text}:{text:string}=$props();
</script>
{#each guideInline(text) as part}{#if part.kind==='code'}<code>{part.text}</code>{:else if part.kind==='strong'}<strong>{part.text}</strong>{:else if part.kind==='link'}<a href={part.href} rel={part.href?.startsWith('https:')?'noopener noreferrer':undefined}>{part.text}</a>{:else}{part.text}{/if}{/each}
