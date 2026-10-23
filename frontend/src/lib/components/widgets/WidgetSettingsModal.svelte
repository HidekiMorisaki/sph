<script lang="ts">
 import {untrack,onMount,tick} from 'svelte';import {COMPACT_CONTENT_QUERY} from '$lib/responsive-layout';import {apiData} from '$lib/api';import {localization} from '$lib/localization';
 import {runtimeConfiguration,widgetText,widgetPreview,widgetSizeLabel,widgetDimensions,widgetUsesCompactLayout,type WidgetData,type WidgetInstance,type WidgetSize,type WidgetRecord,type WidgetValues} from '$lib/widgets';
 import {widgetContentScale,WIDGET_GAP} from '$lib/widget-layout';
 import RuntimeFields from './RuntimeFields.svelte';
 import ModalActionButton from '../ModalActionButton.svelte';
 import FormInput from '../FormInput.svelte';
 import FormTextarea from '../FormTextarea.svelte';
 import DetailModal from '../DetailModal.svelte';import SearchSelect from '../SearchSelect.svelte';import SearchMultiSelect from '../SearchMultiSelect.svelte';import StatusNotice from '../StatusNotice.svelte';import WidgetContent from './WidgetContent.svelte';
 let {instance:initialInstance,columns,cellSize,returnFocus,busy,error,onClose,onApply,onRemove,onDismissError}:{instance:WidgetInstance;columns:number;cellSize:number;returnFocus:HTMLElement|null;busy:boolean;error:string;onClose:()=>void;onRemove:()=>Promise<boolean>;onDismissError:()=>void;onApply:(instance:WidgetInstance,record?:{recordKey:string;revision:number;values:WidgetValues})=>Promise<boolean>}=$props();
 const instance=untrack(()=>initialInstance);
 let lang:'ja'|'en'=$derived($localization.displayLanguage==='ja'?'ja':'en');let t=$derived(widgetText[lang]);
 let definition=$derived(instance.definition);
 let size=$state<WidgetSize>(untrack(()=>instance.size));
 let zones=$state<string[]>(untrack(()=>[...(instance.definition.storage?.initialRecords?.[0]?.values.timeZones as string[]??['Asia/Tokyo'])]));
 let design=$state(untrack(()=>instance.settings.clockDesign?.[0]??'digital'));
 let note=$state(untrack(()=>String(instance.definition.storage?.initialRecords?.[0]?.values.note??'')));
 let title=$state(untrack(()=>instance.settings.title?.[0]??''));
 let personalNote=$derived(definition.view.some(b=>b.type==='personal_note'));
 let clock=$derived(definition.capabilities.includes('world_clock'));
 let configurableZones=$derived(clock&&!!definition.storage?.fields.timeZones);
 let custom=$state<WidgetValues>(untrack(()=>runtimeConfiguration(instance.definition,instance.settings)));let runtimeValues=$state<WidgetValues>(untrack(()=>JSON.parse(JSON.stringify(instance.definition.storage?.initialRecords?.[0]?.values??{}))));
 let storageLoading=$state(!!untrack(()=>instance.definition.storage)&&(untrack(()=>instance.definition.runtime&&instance.definition.storage?.initialRecords?.length===1||instance.definition.capabilities.includes('world_clock')||instance.definition.view.some(b=>b.type==='personal_note'))));
 let originalValues=$state<WidgetValues|null>(null);let canEditContent=$state(false);
 let storageError=$state('');let recordRevision=$state(0);
 onMount(()=>{if(!storageLoading)return;const controller=new AbortController();void fetch(`/v1/employees/me/widget-instances/${instance.instanceKey}/records/${definition.storage?.initialRecords?.[0]?.recordKey??'default'}`,{cache:'no-store',signal:controller.signal}).then(async r=>{if(!r.ok)throw Error();const record=await apiData<WidgetRecord>(r);recordRevision=record.revision;originalValues=record.values;runtimeValues=structuredClone(record.values);canEditContent=record.operations?.update===true;if(personalNote)note=String(record.values.note??'');if(configurableZones)zones=[...(record.values.timeZones as string[])];}).catch(()=>{if(!controller.signal.aborted)storageError=t.failed;}).finally(()=>storageLoading=false);return()=>controller.abort();});
 let previewTitle=$derived(definition.runtime?custom.title:title);
 let options=$derived([...new Set([...Intl.supportedValuesOf('timeZone'),'UTC',...zones])].sort().map(value=>({value,label:value.replaceAll('_',' ')})));
 let previewSpace=$state<HTMLDivElement>();let previewWidth=$state(0);let previewStage=$state<HTMLDivElement>();let previewHeight=$state(0);let compactMode=$state(false);
 let compactTool=$derived(compactMode&&widgetUsesCompactLayout(definition));
 onMount(()=>{const query=matchMedia(COMPACT_CONTENT_QUERY);compactMode=query.matches;const update=()=>compactMode=query.matches;query.addEventListener('change',update);return()=>query.removeEventListener('change',update);});
 let dimensions=$derived(widgetDimensions(definition,size));
 let bodyWidth=$derived(Math.max(1,(compactTool?columns:Math.min(columns,dimensions.columns))*(cellSize+WIDGET_GAP)-WIDGET_GAP-26));
 let bodyHeight=$derived(compactTool?previewHeight:Math.max(1,dimensions.rows*(cellSize+WIDGET_GAP)-WIDGET_GAP-82));
 // Keep one scale for all sizes so changing the selection visibly changes the footprint.
 let widestBody=$derived(compactTool?bodyWidth:Math.max(...definition.sizes.map(id=>Math.min(columns,widgetDimensions(definition,id).columns)*(cellSize+WIDGET_GAP)-WIDGET_GAP-26),1));
 let previewScale=$derived(Math.min(1,previewWidth/widestBody));
 let actualData=$state<WidgetData|null>(null);let measurements=$state<HTMLDivElement>();let fits=$state<Record<string,boolean>>({});
 let preview=$derived({...actualData??widgetPreview(lang),world_clock:zones});
 function checkFit(){if(!measurements)return;const result:Record<string,boolean>={};for(const element of measurements.querySelectorAll<HTMLElement>('[data-measure-size]')){const id=element.dataset.measureSize!;const d=widgetDimensions(definition,id);result[id]=(definition.runtime||compactTool||personalNote||element.scrollHeight<=d.rows*cellSize+(d.rows-1)*WIDGET_GAP-82+1)&&(!!definition.runtime||element.scrollWidth<=element.clientWidth+1);}fits=result;}
 onMount(()=>{const controller=new AbortController();void fetch(`/v1/employees/me/widget-instances/${instance.instanceKey}/data`,{signal:controller.signal}).then(async r=>{if(r.ok)actualData=await apiData<WidgetData>(r);}).catch(()=>{});const stageObserver=new ResizeObserver(entries=>previewHeight=entries[0].contentRect.height);if(previewStage)stageObserver.observe(previewStage);const previewObserver=new ResizeObserver(entries=>previewWidth=entries[0].contentRect.width);if(previewSpace)previewObserver.observe(previewSpace);const observer=new ResizeObserver(checkFit);if(measurements)for(const child of measurements.children)observer.observe(child);return()=>{controller.abort();observer.disconnect();previewObserver.disconnect();stageObserver.disconnect();};});
 $effect(()=>{definition;preview;design;note;columns;cellSize;compactTool;void tick().then(checkFit);});
 let eligibleSizes=$derived(definition.sizes.filter(id=>fits[id]!==false));
 $effect(()=>{if(fits[size]===false&&eligibleSizes.length)size=eligibleSizes[0];});
 let invalidZones=$derived(configurableZones&&zones.length<1);
 let invalid=$derived(storageLoading||!!storageError||invalidZones||note.length>5000||title.length>40||/[\r\n\u2028\u2029\0]/u.test(title)||fits[size]===false);
 async function apply(){if(busy||invalid)return;const settings={...instance.settings};if(definition.runtime&&definition.configuration)settings.custom=[JSON.stringify(custom)];if(personalNote)settings.title=[title.trim()];if(clock)settings.clockDesign=[design];const values:WidgetValues=definition.runtime?runtimeValues:personalNote?{note}:{timeZones:[...zones]};const changed=(definition.runtime&&!!definition.storage&&definition.storage.initialRecords?.length===1||personalNote||configurableZones)&&JSON.stringify(values)!==JSON.stringify(originalValues);const record=changed?{recordKey:definition.storage?.initialRecords?.[0]?.recordKey??'default',revision:recordRevision,values}:undefined;if(await onApply({...instance,size,settings,enabled:true},record))onClose();}
</script>
<DetailModal title={t.settings} titleId="widget-settings-title" pretitle={instance.definition.name[lang]} closeLabel={t.cancel} {returnFocus} onClose={onClose} compactHeader dialogClass="widget-settings-dialog">
 <section class="widget-settings">
 {#if storageError}<StatusNotice message={storageError} tone="error" onDismiss={onClose}/>{/if}
 {#if error}<StatusNotice message={error} tone="error" onDismiss={onDismissError}/>{/if}

 <SearchSelect label={t.displaySize} field="widget-settings-size" value={size} searchable={false} disabled={busy||storageLoading||!!storageError} options={eligibleSizes.map(value=>({value,label:widgetSizeLabel(definition,value,lang)}))} onSelect={value=>size=value as WidgetSize}/>
 {#if definition.runtime}
 {#if definition.configuration}<RuntimeFields schema={definition.configuration} values={custom} {lang} disabled={busy||storageLoading} onChange={v=>custom=v}/>{/if}
 {#if definition.storage&&definition.storage.initialRecords?.length===1}<RuntimeFields schema={definition.storage} values={runtimeValues} {lang} disabled={busy||storageLoading||!canEditContent} onChange={v=>runtimeValues=v}/>{/if}
 {/if}
 {#if clock}
 {#if configurableZones}<SearchMultiSelect label={t.zoneSelection} field="widget-settings-zones" values={zones} {options} disabled={busy||storageLoading||!!storageError||!canEditContent} error={invalidZones?t.zoneLimit:''} onChange={values=>zones=values}/>{/if}
 <SearchSelect label={t.clockDesign} field="widget-settings-design" value={design} searchable={false} disabled={busy||storageLoading||!!storageError} options={[{value:'digital',label:t.digital},{value:'analog',label:t.analog}]} onSelect={value=>design=value}/>
 {/if}
 {#if personalNote}<FormInput label={lang==='ja'?'タイトル（任意・40文字まで）':'Title (optional, up to 40 characters)'} field="widget-settings-note-title" value={title} maxlength={40} disabled={busy||storageLoading||!!storageError} onValueChange={value=>title=value}/><FormTextarea label={lang==='ja'?'メモ（本人専用）':'Note (private)'} field="widget-settings-note" maxlength={5000} rows={8} disabled={busy||storageLoading||!!storageError||!canEditContent} value={note} placeholder={lang==='ja'?'例：今日の作業メモ':'e.g. Notes for today'} helpText={`${note.length} / 5,000`} onValueChange={value=>note=value}/>{/if}
 {#if !eligibleSizes.length}<p role="status">{t.noFittingSize}</p>{/if}
 <section class="preview" aria-label={t.preview} data-size={size}><h3>{t.preview} · {widgetSizeLabel(definition,size,lang,true)}{#if typeof previewTitle==='string'&&previewTitle.trim()} · {previewTitle.trim()}{/if}</h3><div class="preview-space" bind:this={previewSpace}><div class="preview-viewport" style={`width:${bodyWidth*previewScale}px;height:${bodyHeight*previewScale}px`}><div class="preview-stage" class:compact={compactTool} bind:this={previewStage} style={`width:${bodyWidth}px;height:${compactTool?'auto':bodyHeight+'px'};transform:scale(${previewScale})`}><WidgetContent configuration={custom} initialRecords={definition.storage?.initialRecords?.map(r=>({...r,values:runtimeValues}))??[]} {note} {definition} {size} data={preview} scale={widgetContentScale(cellSize)} clockDesign={design} previewOnly={true}/></div></div></div></section>

 </section>
 {#snippet actions()}<ModalActionButton label={t.remove} variant="danger" disabled={busy||storageLoading||!!storageError} onclick={()=>{if(confirm(t.confirmRemove))void onRemove().then(ok=>{if(ok)onClose();});}}/><span class="footer-spacer"></span><ModalActionButton label={t.cancel} variant="secondary" disabled={busy||storageLoading||!!storageError} onclick={onClose}/><ModalActionButton label={t.save} disabled={busy||invalid} onclick={()=>void apply()}/>{/snippet}
</DetailModal>
<div class="size-measurements" bind:this={measurements} inert aria-hidden="true">{#each definition.sizes as candidate}<div data-measure-size={candidate} style={`width:${(compactTool?columns:Math.min(columns,widgetDimensions(definition,candidate).columns))*(cellSize+WIDGET_GAP)-WIDGET_GAP-26}px`}><WidgetContent configuration={custom} initialRecords={definition.storage?.initialRecords?.map(r=>({...r,values:runtimeValues}))??[]} {note} {definition} size={candidate} data={preview} scale={widgetContentScale(cellSize)} clockDesign={design} measureOnly={true}/></div>{/each}</div>
<style>

 .size-measurements{position:fixed;left:-100000px;top:0;visibility:hidden;pointer-events:none}.size-measurements>div{display:flow-root;min-width:0}.widget-settings{display:grid;grid-template-columns:minmax(0,1fr);gap:16px;min-width:0}.preview{border:1px dashed var(--border);border-radius:7px;padding:16px;min-width:0}.preview-space{min-width:0}.preview-viewport{position:relative;overflow:hidden;outline:1px solid var(--border);border-radius:4px;background:var(--surface)}.preview-stage{position:absolute;top:0;left:0;transform-origin:top left}.preview-stage :global(.widget-content){height:100%}.preview-stage.compact :global(.widget-content){height:auto}.preview-stage :global(.clocks-wrap.preview-clocks),.preview-stage :global(.preview-clocks .clocks){height:100%}.preview h3{margin:0 0 12px;font-size:var(--font-size-body);overflow-wrap:anywhere}.footer-spacer{flex:1}:global(.widget-settings-dialog .app-detail-body){scrollbar-gutter:stable}:global(.widget-settings-dialog>.app-modal-footer){flex-wrap:wrap}
</style>
