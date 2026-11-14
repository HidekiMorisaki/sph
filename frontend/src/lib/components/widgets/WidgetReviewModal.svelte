<script lang="ts">
 import {onMount,untrack} from 'svelte';
 import {localization} from '#lib/localization.js';
 import {runtimeConfiguration,widgetDefaultSize,widgetDimensions,widgetPreview,widgetSizeLabel,widgetText,type WidgetRelease,type WidgetSize,type WidgetValues} from '#lib/widgets.js';
 import {WIDGET_CONTENT_BASE_SIZE,WIDGET_GAP} from '#lib/widget-layout.js';
 import {previewValues} from '#lib/widget-record-values.js';
 import DetailModal from '../DetailModal.svelte';
 import DetailTabs from '../DetailTabs.svelte';
 import ModalActionButton from '../ModalActionButton.svelte';
 import SearchSelect from '../SearchSelect.svelte';
 import FormCheckbox from '../FormCheckbox.svelte';
 import StatusNotice from '../StatusNotice.svelte';
 import RuntimeFields from './RuntimeFields.svelte';
 import WidgetContent from './WidgetContent.svelte';

 let {release,returnFocus,busy,message,failed,pendingReason,onClose,onDismiss,onAllow}:{release:WidgetRelease;returnFocus:HTMLElement|null;busy:boolean;message:string;failed:boolean;pendingReason?:string;onClose:()=>void;onDismiss:()=>void;onAllow:()=>Promise<void>}=$props();
 let lang:'ja'|'en'=$derived($localization.displayLanguage==='ja'?'ja':'en');
 let t=$derived(widgetText[lang]);
 let definition=$derived(release.definition);
 let active=$state('overview');
 let reviewed=$state(false);
 let executePreview=$state(false);
 let size=$state<WidgetSize>(untrack(()=>widgetDefaultSize(release.definition)));
 let configuration=$state<WidgetValues>(untrack(()=>runtimeConfiguration(release.definition)));
 let clockDesign=$state('digital');
 let previewSpace=$state<HTMLDivElement>();
 let previewWidth=$state(0);
 const bodyWidth=(columns:number)=>columns*(WIDGET_CONTENT_BASE_SIZE+WIDGET_GAP)-WIDGET_GAP-26;
 let dimensions=$derived(widgetDimensions(definition,size));
 let stageWidth=$derived(bodyWidth(dimensions.columns));
 let stageHeight=$derived(dimensions.rows*(WIDGET_CONTENT_BASE_SIZE+WIDGET_GAP)-WIDGET_GAP-82);
 // Use one reference scale so every declared footprint remains distinguishable,
 // including wide sizes on phones. Previewing never changes the saved layout.
 let previewScale=$derived(Math.min(1,previewWidth/Math.max(...definition.sizes.map(id=>bodyWidth(widgetDimensions(definition,id).columns)))));
 onMount(()=>{
  const observer=new ResizeObserver(entries=>{const width=entries[0].contentRect.width;if(width>0)previewWidth=width;});
  if(previewSpace)observer.observe(previewSpace);
  return()=>observer.disconnect();
 });
 let versions=$derived(release.versions??[{id:release.id,digest:release.digest,version:release.version,allowed:!!release.approval?.allowed,usageCount:release.usageCount??0}]);
 let configurationError=$derived.by(()=>{try{if(definition.configuration)previewValues(definition.configuration,configuration);return false;}catch{return true;}});
 const userCount=(count:number)=>lang==='ja'?`${count}人`:`${count} user(s)`;
 let tokens=$derived.by(()=>{
  const json=JSON.stringify(definition,null,2);
  return [...json.matchAll(/"(?:\\.|[^"\\])*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null|\s+|[^\s]/g)].map(match=>{
   const text=match[0];
   const kind=text.startsWith('"')?(json.slice(match.index!+text.length).trimStart().startsWith(':')?'key':'string'):/^-?\d/.test(text)?'number':text==='true'||text==='false'?'boolean':text==='null'?'null':'plain';
   return {text,kind};
  });
 });
</script>

 {#snippet overview()}
 <section class="app-detail-section"><h3>{lang==='ja'?'基本情報':'Basic information'}</h3>
  <dl class="app-detail-grid">
   <div><dt>{lang==='ja'?'ウィジェット名':'Widget name'}</dt><dd>{definition.name[lang]}</dd></div>
   <div><dt>{t.version}</dt><dd>{release.version}</dd></div>
   <div><dt>{t.provider}</dt><dd>{definition.provider}</dd></div>
   <div><dt>{lang==='ja'?'開発者':'Developer'}</dt><dd>{definition.author??definition.provider}</dd></div>
   <div class="app-detail-wide"><dt>{t.description}</dt><dd class="description">{definition.description?.[lang]??t.noDescription}</dd></div>
  </dl>
 </section>
 <section class="app-detail-section"><h3>{t.preview}</h3>
  <div class="preview-controls">
   <SearchSelect label={t.displaySize} field="widget-review-size" value={size} searchable={false} disabled={busy} options={definition.sizes.map(value=>({value,label:widgetSizeLabel(definition,value,lang)}))} onSelect={value=>size=value as WidgetSize}/>
   {#if definition.configuration}<RuntimeFields schema={definition.configuration} values={configuration} {lang} disabled={busy} onChange={value=>configuration=value}/>{/if}
   {#if !definition.runtime&&definition.capabilities.includes('world_clock')}<SearchSelect label={t.clockDesign} field="widget-review-clock-design" value={clockDesign} searchable={false} disabled={busy} options={[{value:'digital',label:t.digital},{value:'analog',label:t.analog}]} onSelect={value=>clockDesign=value}/>{/if}
  </div>
  {#if configurationError}<p role="status">{lang==='ja'?'プレビューの設定内容を確認してください。':'Check the preview settings.'}</p>{/if}
  <div class="preview" bind:this={previewSpace} data-preview-version={release.version} data-preview-size={size}>
   {#if definition.runtime&&!executePreview}<ModalActionButton label={lang==='ja'?'プレビューを実行':'Run preview'} disabled={busy||configurationError} onclick={()=>executePreview=true}/>
   {:else if !configurationError}<div class="preview-viewport" style:width={`${stageWidth*previewScale}px`} style:height={`${stageHeight*previewScale}px`}><div class="sized-preview-stage" style:width={`${stageWidth}px`} style:height={`${stageHeight}px`} style:transform={`scale(${previewScale})`}><WidgetContent {definition} {size} {configuration} {clockDesign} data={widgetPreview(lang)} initialRecords={definition.storage?.initialRecords??[]} previewOnly={true} fixedPreview={true}/></div></div>{/if}
  </div>
 </section>
 {/snippet}
 {#snippet history()}
 {#if pendingReason}<section class="app-detail-section"><h3>{lang==='ja'?'更新保留':'Update pending'}</h3><p>{pendingReason}</p></section>{/if}
 {#each versions as version (version.id)}<section class="app-detail-section" data-widget-history-version={version.version}><h3>{version.version}</h3><dl class="app-detail-grid">
  <div><dt>{lang==='ja'?'最新版':'Latest version'}</dt><dd>{version.id===release.id?(lang==='ja'?'はい':'Yes'):(lang==='ja'?'いいえ':'No')}</dd></div>
 </dl></section>{/each}
 {/snippet}
 {#snippet usage()}
 <section class="app-detail-section"><h3>{lang==='ja'?'全バージョンの利用状況':'Usage across versions'}</h3><dl class="app-detail-grid">
  <div><dt>{lang==='ja'?'利用人数':'Users'}</dt><dd>{userCount(release.usageCount??0)}</dd></div>
 </dl><p>{lang==='ja'?'同じ人の複数配置は1人として集計します。非表示の配置も含みます。':'Multiple placements by the same person count as one user. Hidden placements are included.'}</p></section>
 {#each versions as version (version.id)}<section class="app-detail-section" data-widget-usage-version={version.version}><h3>{version.version}</h3><dl class="app-detail-grid"><div><dt>{lang==='ja'?'利用人数':'Users'}</dt><dd>{userCount(version.usageCount)}</dd></div></dl></section>{/each}
 {/snippet}
 {#snippet definitionPanel()}
 <section class="app-detail-section"><h3>{lang==='ja'?'権限・ライセンス':'Capabilities and license'}</h3><dl class="app-detail-grid">
  <div class="app-detail-wide"><dt>{lang==='ja'?'宣言されたデータ':'Declared data'}</dt><dd>{definition.runtime?(lang==='ja'?'独自JavaScript（隔離実行）':'Custom JavaScript (isolated)')+(definition.storage?(lang==='ja'?'・本人専用の保存データ':' · Private widget records'):''):definition.capabilities.join(', ')||'—'}</dd></div>
  <div><dt>{t.license}</dt><dd><a href={definition.license.url} target="_blank" rel="noopener noreferrer">{definition.license.name}</a></dd></div>
  <div><dt>{lang==='ja'?'取得元':'Source'}</dt><dd>{release.source.name}</dd></div>
  <div class="app-detail-wide"><dt>SHA-256</dt><dd>{release.digest}</dd></div>
 </dl></section>
 <section class="app-detail-section"><h3>{lang==='ja'?'定義全体':'Complete definition'}</h3><pre class="definition-json"><code>{#each tokens as token}<span class={`json-${token.kind}`}>{token.text}</span>{/each}</code></pre></section>
 {/snippet}

<DetailModal title={t.review} titleId="widget-review-title" pretitle={definition.name[lang]} closeLabel={t.cancel} {returnFocus} {onClose} compactHeader dialogClass="widget-review-dialog">
 {#if message&&failed}<StatusNotice {message} tone="error" {onDismiss}/>{/if}
 <DetailTabs bind:active label={t.review} idPrefix="widget-review" tabs={[
  {id:'overview',label:lang==='ja'?'概要':'Overview',content:overview},
  {id:'versions',label:lang==='ja'?'バージョン履歴':'Version history',content:history},
  {id:'usage',label:lang==='ja'?'利用状況':'Usage',content:usage},
  {id:'definition',label:lang==='ja'?'定義情報':'Definition',content:definitionPanel}
 ]}/>

 {#snippet actions()}
 <div class="review-actions">
  {#if !release.approval?.allowed}<FormCheckbox field="widget-review-consent" disabled={busy} checked={reviewed} onChange={value=>reviewed=value} label={lang==='ja'?'全バージョンの内容、データ権限、利用条件を確認しました。':'I reviewed all versions, their data capabilities and license terms.'}/>{/if}
  <div class="review-buttons"><ModalActionButton label={t.cancel} variant="secondary" disabled={busy} onclick={onClose}/>{#if !release.approval?.allowed}<ModalActionButton label={t.allow} disabled={!reviewed||busy} onclick={onAllow}/>{/if}</div>
 </div>
 {/snippet}
</DetailModal>

<style>
 :global(.widget-review-dialog .app-detail-body){scrollbar-gutter:stable}
 .preview-viewport{position:relative;max-width:100%;overflow:hidden;outline:1px solid var(--border);border-radius:var(--sph-radius-4px);background:var(--surface)}.sized-preview-stage{position:absolute;top:0;left:0;transform-origin:top left}.sized-preview-stage :global(.widget-content){height:100%}.sized-preview-stage :global(.clocks-wrap.preview-clocks),.sized-preview-stage :global(.preview-clocks .clocks){height:100%}
 .preview-controls,.review-actions{display:grid;gap:var(--sph-space-12px);min-width:0}.preview{min-width:0;margin-top:var(--sph-space-12px)}.review-actions{width:100%}.review-buttons{display:flex;justify-content:flex-end;flex-wrap:wrap;gap:var(--sph-space-8px)}.description{white-space:pre-wrap}p{line-height:var(--sph-leading-1-6);overflow-wrap:anywhere}.definition-json{margin:0;padding:var(--sph-space-16px);border:1px solid var(--border);border-radius:var(--sph-radius-6px);background:var(--surface-secondary);color:var(--text);white-space:pre-wrap;overflow-wrap:anywhere;font-size:var(--font-size-support);line-height:var(--sph-leading-1-6);max-width:100%;min-width:0}.definition-json code{font-family:var(--sph-font-family-mono-extended)}.json-key{color:var(--sph-color-syntax-key-light)}.json-string{color:var(--sph-color-syntax-string-light)}.json-number{color:var(--sph-color-syntax-number-light)}.json-boolean{color:var(--sph-color-syntax-keyword-light)}.json-null{color:var(--sph-color-syntax-function-light)}:global([data-theme='dark']) .json-key{color:var(--sph-color-syntax-key-dark)}:global([data-theme='dark']) .json-string{color:var(--sph-color-syntax-string-dark)}:global([data-theme='dark']) .json-number{color:var(--sph-color-syntax-number-dark)}:global([data-theme='dark']) .json-boolean{color:var(--sph-color-syntax-keyword-dark)}:global([data-theme='dark']) .json-null{color:var(--sph-color-syntax-function-dark)}
</style>
