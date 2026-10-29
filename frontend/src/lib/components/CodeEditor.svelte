<script lang="ts">
	import { highlightCode, type CodeLanguage } from '$lib/code-highlight';
	let { label, field, value = $bindable(''), language, onValueChange }: {
		label: string; field: string; value?: string; language: CodeLanguage; onValueChange?: () => void;
	} = $props();
	let left = $state(0), top = $state(0);
	let tokens = $derived(highlightCode(value, language));
</script>

<label for={field}>{label}</label>
<div class="code-editor" data-language={language}>
	<div class="highlight-viewport" aria-hidden="true"><pre style:transform={`translate(${-left}px, ${-top}px)`}><code>{#each tokens as token}<span class={`token-${token.kind}`}>{token.text}</span>{/each}{'\n'}</code></pre></div>
	<textarea id={field} class="source" bind:value spellcheck="false" autocapitalize="off" autocomplete="off" wrap="off" oninput={() => onValueChange?.()} onscroll={event => { left = event.currentTarget.scrollLeft; top = event.currentTarget.scrollTop; }}></textarea>
</div>

<style>
	label{display:block;margin-bottom:var(--sph-space-6px);color:var(--text);font-size:var(--font-size-support);font-weight:var(--sph-weight-500)}
	.code-editor{position:relative;min-width:0;background:var(--surface);border:1px solid var(--border);border-radius:var(--sph-radius-4px);overflow:hidden}
	.code-editor:hover{border-color:var(--muted)}.code-editor:focus-within{border-color:var(--sph-color-accent);box-shadow:var(--sph-shadow-focus)}
	.highlight-viewport{position:absolute;inset:0;overflow:hidden;pointer-events:none}
	pre,.source{box-sizing:border-box;margin:0;padding:var(--sph-space-12px);font:var(--sph-font-lib-components-codeeditor);letter-spacing:normal;tab-size:2;white-space:pre;font-variant-ligatures:none;text-align:left}
	pre{width:max-content;min-width:100%;color:var(--text);transform-origin:top left}code{font:inherit}
	.source{position:relative;display:block;width:100%;min-height:440px;resize:vertical;border:0;border-radius:0;outline:none;background:transparent;color:transparent;caret-color:var(--text);-webkit-text-fill-color:transparent;overflow:auto}
	.source::selection{background:var(--sph-color-accent-overlay-25)}
	.token-key,.token-tag{color:var(--sph-color-syntax-key-light)}.token-string{color:var(--sph-color-syntax-string-light)}.token-number{color:var(--sph-color-syntax-number-light)}.token-keyword,.token-literal{color:var(--sph-color-syntax-keyword-light)}.token-function{color:var(--sph-color-syntax-function-light)}.token-comment{color:var(--sph-color-syntax-comment-light)}
	:global(html[data-theme='dark']) .token-key,:global(html[data-theme='dark']) .token-tag{color:var(--sph-color-syntax-key-dark)}:global(html[data-theme='dark']) .token-string{color:var(--sph-color-syntax-string-dark)}:global(html[data-theme='dark']) .token-number{color:var(--sph-color-syntax-number-dark)}:global(html[data-theme='dark']) .token-keyword,:global(html[data-theme='dark']) .token-literal{color:var(--sph-color-syntax-keyword-dark)}:global(html[data-theme='dark']) .token-function{color:var(--sph-color-syntax-function-dark)}:global(html[data-theme='dark']) .token-comment{color:var(--sph-color-syntax-comment-dark)}
	@media(forced-colors:active){.highlight-viewport{display:none}.source{color:CanvasText;-webkit-text-fill-color:CanvasText;caret-color:CanvasText}}
	@media(max-width:700px),(min-width:701px) and (max-width:1024px) and (max-height:500px) and (any-pointer:coarse){.source{min-height:280px}}
</style>
