<script lang="ts">
 import {localization} from '$lib/localization';
 import {widgetText,type WidgetInstance} from '$lib/widgets';
 import DetailModal from '../DetailModal.svelte';
 let {instance,returnFocus,onClose}:{instance:WidgetInstance;returnFocus:HTMLElement|null;onClose:()=>void}=$props();
 let lang:'ja'|'en'=$derived($localization.displayLanguage==='ja'?'ja':'en');
 let t=$derived(widgetText[lang]);
 let definition=$derived(instance.definition);
 let author=$derived(instance.information?.author ?? definition.author ?? definition.provider);
 let description=$derived((instance.information?.description ?? definition.description)?.[lang]);
</script>

<DetailModal title={t.information} titleId="widget-information-title" pretitle={definition.name[lang]} closeLabel={t.close} {returnFocus} {onClose} compactHeader>
 <section class="app-detail-section">
  <h3>{t.widgetOverview}</h3>
  <dl class="app-detail-grid">
   <div><dt>{t.author}</dt><dd data-widget-author>{author}</dd></div>
   <div><dt>{t.version}</dt><dd data-widget-version>{definition.version}</dd></div>
   <div><dt>{t.provider}</dt><dd>{definition.provider}</dd></div>
   <div><dt>{t.license}</dt><dd><a href={definition.license.url} target="_blank" rel="noopener noreferrer">{definition.license.name}</a></dd></div>
  </dl>
 </section>
 <section class="app-detail-section">
  <h3>{t.description}</h3>
  <p class="description" data-widget-description>{description ?? t.noDescription}</p>
 </section>
</DetailModal>

<style>
 .description{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.6;margin:0}
</style>
