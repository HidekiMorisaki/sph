<script lang="ts">
 import {onDestroy} from 'svelte';
 import {localization} from '$lib/localization';
 import {highlightProjectCode} from '$lib/project-code-highlight';
 import type {SyntaxToken} from '$lib/project-code-tokens';
 import {codeLanguageOptions} from '$lib/project-markdown-editor';
 import ActionButton from '$lib/components/ActionButton.svelte';
 let {source,language='text'}:{source:string;language?:string}=$props();
 let message=$state(''),timer:ReturnType<typeof setTimeout>|undefined;
 let tokens=$state<SyntaxToken[]|null>(null);
 let languageName=$derived(codeLanguageOptions.find(option=>option.id===language||option.aliases?.includes(language))?.name??language);
 $effect(()=>{const currentSource=source,job=highlightProjectCode(currentSource,language.toLowerCase());tokens=null;let cancelled=false;void job.result.then(result=>{if(!cancelled)tokens=result;});return ()=>{cancelled=true;job.cancel();};});
 onDestroy(()=>clearTimeout(timer));
 let ja=$derived($localization.displayLanguage==='ja');
 async function copy(){try{await navigator.clipboard.writeText(source);message=ja?'コピーしました':'Copied';}catch{message=ja?'コピーできませんでした。コードを選択してコピーしてください。':'Copy failed. Select the code to copy it.';}clearTimeout(timer);timer=setTimeout(()=>message='',3000);}
</script>
<section class="markdown-code" aria-label={languageName}>
 <header><span>{languageName||'text'}</span><ActionButton label={ja?'コードをコピー':'Copy code'} onclick={copy}/></header>
 <!-- svelte-ignore a11y_no_noninteractive_tabindex (The read-only code region must support keyboard scrolling and selection.) -->
 <pre tabindex="0" role="region" aria-label={ja?'コード':'Code'}><code>{#if tokens}{#each tokens as token}<span class={'syntax-'+token.kind}>{token.text}</span>{/each}{:else}{source}{/if}</code></pre>
 <span class="copy-result" role="status">{message}</span>
</section>
<style>
 pre{box-sizing:border-box;width:100%;min-width:0}
 .markdown-code{min-width:0;max-width:100%;border:1px solid var(--border);border-radius:var(--sph-radius-4px);background:var(--surface-hover);overflow:hidden;margin:12px 0}.markdown-code header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:6px 12px;border-bottom:1px solid var(--border);font-size:var(--font-size-support);color:var(--muted)}pre{margin:0;max-width:100%;padding:12px;overflow:auto;white-space:pre;tab-size:4;font-family:ui-monospace,SFMono-Regular,Consolas,'Liberation Mono',monospace;font-size:var(--font-size-body);line-height:1.6;font-variant-ligatures:none;letter-spacing:normal;color:var(--text)}code{font:inherit}pre:focus-visible{outline:2px solid var(--action-primary);outline-offset:-2px}.copy-result{display:block;padding:0 12px;font-size:var(--font-size-support);color:var(--muted)}.copy-result:not(:empty){padding-block:8px}
 .syntax-keyword,.syntax-literal,.syntax-operator{color:var(--sph-color-syntax-keyword-light)}.syntax-string,.syntax-regexp,.syntax-addition{color:var(--sph-color-syntax-string-light)}.syntax-number{color:var(--sph-color-syntax-number-light)}.syntax-comment,.syntax-quote{color:var(--sph-color-syntax-comment-light)}.syntax-title,.syntax-function,.syntax-built_in{color:var(--sph-color-syntax-function-light)}.syntax-attr,.syntax-attribute,.syntax-tag,.syntax-name,.syntax-type,.syntax-property,.syntax-section,.syntax-meta,.syntax-symbol{color:var(--sph-color-syntax-key-light)}.syntax-deletion{color:var(--danger)}
 :global(html[data-theme='dark']) .syntax-keyword,:global(html[data-theme='dark']) .syntax-literal,:global(html[data-theme='dark']) .syntax-operator{color:var(--sph-color-syntax-keyword-dark)}:global(html[data-theme='dark']) .syntax-string,:global(html[data-theme='dark']) .syntax-regexp,:global(html[data-theme='dark']) .syntax-addition{color:var(--sph-color-syntax-string-dark)}:global(html[data-theme='dark']) .syntax-number{color:var(--sph-color-syntax-number-dark)}:global(html[data-theme='dark']) .syntax-comment,:global(html[data-theme='dark']) .syntax-quote{color:var(--sph-color-syntax-comment-dark)}:global(html[data-theme='dark']) .syntax-title,:global(html[data-theme='dark']) .syntax-function,:global(html[data-theme='dark']) .syntax-built_in{color:var(--sph-color-syntax-function-dark)}:global(html[data-theme='dark']) .syntax-attr,:global(html[data-theme='dark']) .syntax-attribute,:global(html[data-theme='dark']) .syntax-tag,:global(html[data-theme='dark']) .syntax-name,:global(html[data-theme='dark']) .syntax-type,:global(html[data-theme='dark']) .syntax-property,:global(html[data-theme='dark']) .syntax-section,:global(html[data-theme='dark']) .syntax-meta,:global(html[data-theme='dark']) .syntax-symbol{color:var(--sph-color-syntax-key-dark)}
</style>
