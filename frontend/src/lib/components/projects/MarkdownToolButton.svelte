<script lang="ts">
 import ActionButton from '$lib/components/ActionButton.svelte';
 let {kind,label,disabled=false,onclick,class:className=''}:{kind:'bold'|'italic'|'strike'|'link'|'code'|'image'|'preview'|'table'|'bullet-list'|'ordered-list'|'task-list';label:string;disabled?:boolean;onclick:()=>void;class?:string}=$props();
</script>
<ActionButton ariaLabel={label} title={label} {disabled} {onclick} class={'markdown-tool '+className}>
 <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  {#if kind==='bold'}<path d="M7 4h6a4 4 0 0 1 0 8H7zm0 8h7a4 4 0 0 1 0 8H7z"/>
  {:else if kind==='italic'}<path d="M10 4h9M5 20h9M15 4 9 20"/>
  {:else if kind==='strike'}<path d="M17 6c-1-3-10-3-10 1 0 2 2 3 5 4m-5 7c1 3 10 3 10-1 0-2-2-3-5-4M3 12h18"/>
  {:else if kind==='table'}<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M3 15h18M10 9v11"/>
  {:else if kind==='bullet-list'}<circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/><path d="M9 6h12M9 12h12M9 18h12"/>
  {:else if kind==='ordered-list'}<path d="m3 4 2-1v6M3 9h4M3 15c0-3 4-3 4-1 0 1-1 2-4 5h4M11 6h10M11 12h10M11 18h10"/>
  {:else if kind==='task-list'}<rect x="3" y="14" width="5" height="5" rx="1"/><path d="m3 6 2 2 4-4M12 6h9M12 16h9"/>
  {:else if kind==='link'}<path d="m10 14 4-4m-6 1-2 2a4.24 4.24 0 0 0 6 6l2-2m-4-10 2-2a4.24 4.24 0 0 1 6 6l-2 2"/>
  {:else if kind==='code'}<path d="m7 7-5 5 5 5m10-10 5 5-5 5M14 4l-4 16"/>
  {:else if kind==='image'}<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8" cy="8" r="1.5"/><path d="m3 17 5-5 4 4 4-6 5 7"/>
  {:else}<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M12 4v16m3-11 3 3-3 3"/>{/if}
 </svg>
</ActionButton>
<style>:global(.markdown-tool.app-modal-action){width:36px;min-width:36px;padding:0}svg{display:block;flex:none}@media(max-width:700px),(min-width:701px) and (max-width:1024px) and (max-height:500px) and (any-pointer:coarse){:global(.markdown-tool.app-modal-action){width:44px;min-width:44px}}</style>
