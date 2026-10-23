<script lang="ts">
 import { operationAccess } from '$lib/operation-access';
 const allowedOperation = operationAccess();
 import {onMount,tick,untrack} from 'svelte';import {apiData} from '$lib/api';import type {SessionUser} from '$lib/auth';
 import {COMPACT_CONTENT_QUERY} from '$lib/responsive-layout';
 import {localization} from '$lib/localization';import {localeMessages} from '$lib/locale-messages';
 import {runtimeConfiguration,widgetDefaultSize,widgetPreview,widgetText,widgetDimensions,widgetUsesCompactLayout,widgetSizeLabel,latestWidgetReleases,type WidgetLayout,type WidgetInstance,type WidgetRelease,type WidgetSize,type WidgetValues} from '$lib/widgets';
 import MasterPageHeader from './MasterPageHeader.svelte';import StatusNotice from './StatusNotice.svelte';
 import DetailModal from './DetailModal.svelte';import SearchSelect from './SearchSelect.svelte';import SearchMultiSelect from './SearchMultiSelect.svelte';import FormInput from './FormInput.svelte';import {placeWidgets,planWidgetMove,widgetAnchor,anchorSettings,widgetColumns,widgetCellSize,WIDGET_COLUMN_WIDTH,widgetContentScale,WIDGET_GAP,WIDGET_MAX_ROW,type WidgetMove,type WidgetPosition} from '$lib/widget-layout';
 import RuntimeFields from './widgets/RuntimeFields.svelte';
 import FormTextarea from './FormTextarea.svelte';
 import WidgetSettingsModal from './widgets/WidgetSettingsModal.svelte';
 import WidgetInformationModal from './widgets/WidgetInformationModal.svelte';
 import WidgetCard from './widgets/WidgetCard.svelte';import WidgetContent from './widgets/WidgetContent.svelte';
 let {user}:{user:SessionUser}=$props();let lang:'ja'|'en'=$derived($localization.displayLanguage==='ja'?'ja':'en');let t=$derived(widgetText[lang]);
 let saved=$state<WidgetLayout>({revision:0,instances:[]});let instances=$state<WidgetInstance[]>([]);let releases=$state<WidgetRelease[]>([]);
 // Moving an existing card's DOM reloads its sandbox iframe. Keep mounted cards
 // in insertion order; layout positions and CSS order follow the saved/preview order.
 let mountedKeys=$state<string[]>([]);
 $effect.pre(()=>{
  const keys=instances.map(i=>i.instanceKey),active=new Set(keys),previous=untrack(()=>mountedKeys),known=new Set(previous);
  const next=[...previous.filter(key=>active.has(key)),...keys.filter(key=>!known.has(key))];
  if(next.length!==previous.length||next.some((key,index)=>key!==previous[index]))mountedKeys=next;
 });
 let mountedInstances=$derived.by(()=>{
  const byKey=new Map(instances.map(i=>[i.instanceKey,i]));
  return mountedKeys.flatMap(key=>{const instance=byKey.get(key);return instance?[instance]:[];});
 });
 let loading=$state(true),saving=$state(false),orderDirty=$state(false),adding=$state(false),error=$state('');let selected=$state<number>(0);let size=$state<WidgetSize>('1x1');let design=$state<'digital'|'analog'>('digital');let drag=$state('');let touchDrag=$state('');
 let emptyNoticeDismissed=$state(false);
 let addConfig=$state<WidgetValues>({});let addRecords=$state<Array<{recordKey:string;values:WidgetValues}>>([]);
 let addZones=$state<string[]>(['Asia/Tokyo']);let addNote=$state('');let addTitle=$state('');
 function cardTitle(instance:WidgetInstance){if(instance.definition.runtime){const title=runtimeConfiguration(instance.definition,instance.settings).title;return instance.definition.name[lang]+(typeof title==='string'&&title?' · '+title:'');}const title=instance.definition.view.some(block=>block.type==='personal_note')?instance.settings.title?.[0]?.trim():'';return instance.definition.name[lang]+(title?' · '+title:'');}
 function releaseLabel(release:WidgetRelease){return `${release.definition.name[lang]} · ${release.definition.provider} · ${release.version}`;}
 let catalogueReleases=$derived(latestWidgetReleases(releases));
 let selectedRelease=$derived(releases.find(r=>r.id===selected));
 let previewTitle=$derived(selectedRelease?.definition.runtime?addConfig.title:addTitle);
 let addClock=$derived(!!selectedRelease?.definition.capabilities.includes('world_clock'));
 let addHasZones=$derived(addClock&&!!selectedRelease?.definition.storage?.fields.timeZones);
 let addPersonalNote=$derived(selectedRelease?.definition.view.some(block=>block.type==='personal_note')??false);
 let addCanEditContent=$derived(selectedRelease?.canEditInitialRecords===true);
 let addZoneOptions=$derived([...new Set([...Intl.supportedValuesOf('timeZone'),'UTC',...addZones])].sort().map(value=>({value,label:value.replaceAll('_',' ')})));
 let addInvalidZones=$derived(addHasZones&&addZones.length<1);
 let addInvalid=$derived(addInvalidZones||addPersonalNote&&(addNote.length>5000||addTitle.length>40||/[\r\n\u2028\u2029\0]/u.test(addTitle)));
 let preview=$derived({...widgetPreview(lang),...(addClock?{world_clock:addZones}:{})});
 function selectRelease(id:number){
  selected=id;design='digital';addTitle='';addNote='';
  const definition=releases.find(r=>r.id===id)?.definition;size=definition?widgetDefaultSize(definition):'1x1';
  addConfig=definition?runtimeConfiguration(definition):{};addRecords=JSON.parse(JSON.stringify(definition?.storage?.initialRecords??[]));
  const values=definition?.storage?.initialRecords?.find(row=>row.recordKey==='default')?.values;
  addZones=Array.isArray(values?.timeZones)?[...values.timeZones]:['Asia/Tokyo'];
  if(typeof values?.note==='string')addNote=values.note;
 }
 let grid=$state<HTMLDivElement>();let gridWidth=$state(WIDGET_COLUMN_WIDTH);let returnFocus=$state<HTMLElement|null>(null);
 let informationInstance=$state<WidgetInstance|null>(null);let informationFocus=$state<HTMLElement|null>(null);
 function openInformation(event:MouseEvent,instance:WidgetInstance){informationFocus=event.currentTarget as HTMLElement;informationInstance=instance;}
 let settingsKey=$state('');let settingsFocus=$state<HTMLElement|null>(null);let settingsInstance=$derived(instances.find(i=>i.instanceKey===settingsKey));
 function openSettings(event:MouseEvent,instance:WidgetInstance){settingsFocus=adding?document.querySelector<HTMLButtonElement>('.add-widget'):event.currentTarget as HTMLElement;adding=false;settingsKey=instance.instanceKey;error='';}
 function closeSettings(){settingsKey='';void tick().then(()=>(settingsFocus?.isConnected?settingsFocus:document.querySelector<HTMLButtonElement>('.add-widget'))?.focus({preventScroll:true}));}
 async function applySettings(instance:WidgetInstance,record?:{recordKey:string;revision:number;values:WidgetValues}){
  const anchor=widgetAnchor(instance.settings);
  if(anchor&&anchor.column+Math.min(anchor.columns,widgetDimensions(instance.definition,instance.size).columns)-1>anchor.columns){const settings={...instance.settings};delete settings.gridPosition;instance={...instance,settings};}
  if(!record)return save(instances.map(i=>i.instanceKey===instance.instanceKey?instance:i));
  saving=true;error='';try{
   const r=await fetch(`/v1/employees/me/widget-instances/${instance.instanceKey}/records/${record.recordKey}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision:record.revision,values:record.values,presentation:{size:instance.size,settings:instance.settings,layoutRevision:saved.revision}})});
   if(!r.ok){error=r.status===409?t.conflict:t.saveFailed;return false;}
   const result=await apiData<{layoutRevision:number}>(r);saved={revision:result.layoutRevision,instances:instances.map(i=>i.instanceKey===instance.instanceKey?instance:i)};instances=structuredClone($state.snapshot(saved.instances));orderDirty=false;return true;
  }catch{error=t.saveFailed;return false;}finally{saving=false;}
 }
 async function removeWidget(key:string){return save(instances.filter(i=>i.instanceKey!==key));}
 async function persistOrder(){if(orderDirty&&!saving)await save();}
 function keyMove(key:string,delta:number){const from=visible.findIndex(i=>i.instanceKey===key),to=from+delta;if(!visible[to]||saving)return;if(stacked){move(key,instances.findIndex(i=>i.instanceKey===visible[to].instanceKey));}else{const plan=planWidgetMove(dimensions,columns,basePositions,from,basePositions[to],to);if(plan)applyMove(plan);}void persistOrder();}
 function endTouch(cancelled=false){if(!touchDrag)return;if(cancelled)clearDrag();else finishDrag();}
 // Opening a drop area may add a scrollbar. Keep the drag's grid stable until release.
 let dragColumns=$state<number|null>(null);
 let columns=$derived(dragColumns??widgetColumns(gridWidth));let cellSize=$derived(dragColumns===null?widgetCellSize(gridWidth):(gridWidth-(columns-1)*WIDGET_GAP)/columns);let contentScale=$derived(widgetContentScale(cellSize));
 let compactMode=$state(false);let sizedPreviewSpace=$state<HTMLDivElement>();let sizedPreviewStage=$state<HTMLDivElement>();let sizedPreviewWidth=$state(0);let sizedPreviewHeight=$state(0);
 let sizedPreview=$derived(selectedRelease?.definition.view.length===1&&['runtime','clock','calculator','programmer_calculator','timer','stopwatch','unit_converter','personal_note'].includes(selectedRelease.definition.view[0].type));
 let compactPreview=$derived(compactMode&&!!selectedRelease&&widgetUsesCompactLayout(selectedRelease.definition));
 let previewDimensions=$derived(selectedRelease?widgetDimensions(selectedRelease.definition,size):{rows:2,columns:2});
 let previewBodyWidth=$derived(Math.max(1,(compactPreview?columns:Math.min(columns,previewDimensions.columns))*(cellSize+WIDGET_GAP)-WIDGET_GAP-26));
 let previewBodyHeight=$derived(compactPreview?sizedPreviewHeight:Math.max(1,previewDimensions.rows*(cellSize+WIDGET_GAP)-WIDGET_GAP-82));
 let sizedPreviewScale=$derived(Math.min(1,sizedPreviewWidth/previewBodyWidth));
 onMount(()=>{const query=matchMedia(COMPACT_CONTENT_QUERY);compactMode=query.matches;const update=()=>compactMode=query.matches;query.addEventListener('change',update);return()=>query.removeEventListener('change',update);});
 $effect(()=>{if(!sizedPreviewSpace||!sizedPreviewStage)return;const widthObserver=new ResizeObserver(entries=>sizedPreviewWidth=entries[0].contentRect.width);const heightObserver=new ResizeObserver(entries=>sizedPreviewHeight=entries[0].contentRect.height);widthObserver.observe(sizedPreviewSpace);heightObserver.observe(sizedPreviewStage);return()=>{widthObserver.disconnect();heightObserver.disconnect();};});
 let visible=$derived(instances.filter(i=>i.enabled));
 let dimensions=$derived(visible.map(i=>widgetDimensions(i.definition,i.size)));
 let stacked=$derived(compactMode&&visible.some(i=>widgetUsesCompactLayout(i.definition)));
 let basePositions=$derived(placeWidgets(dimensions,columns,stacked?[]:visible.map(i=>widgetAnchor(i.settings))));
 let dragSurface=$state(false);let dragPlan=$state<WidgetMove|null>(null);let dropMarker=$state<(WidgetPosition&{valid:boolean})|null>(null);
 let touchPoint:{x:number;y:number}|undefined;let touchFrame=0;
 let positions=$derived(dragPlan?.positions??basePositions);
 // Hit-test the layout at drag start so previews moving beneath the pointer do not oscillate.
 let dragSnapshot: {columns:number;stacked:boolean;positions:WidgetPosition[];boxes:{left:number;top:number;right:number;bottom:number}[];offsetX:number;offsetY:number}|undefined;
 let dragRows=$derived((drag||touchDrag)&&!stacked?Math.min(WIDGET_MAX_ROW,Math.max(1,...basePositions.map(p=>p.row+p.height-1))+Math.max(2,dimensions[visible.findIndex(i=>i.instanceKey===(drag||touchDrag))]?.rows??1)):0);
 function clearDrag(){if(touchFrame)cancelAnimationFrame(touchFrame);touchFrame=0;touchPoint=undefined;dragSurface=false;drag='';touchDrag='';dragPlan=null;dropMarker=null;dragSnapshot=undefined;dragColumns=null;}
 function scrollTouch(){
  if(!touchDrag||!touchPoint)return;
  const delta=touchPoint.y<112?-16:touchPoint.y>innerHeight-64?16:0;
  if(delta){const before=scrollY;window.scrollBy(0,delta);if(scrollY!==before)previewMove(touchPoint.x,touchPoint.y);}
  touchFrame=requestAnimationFrame(scrollTouch);
 }
 function beginDrag(key:string,x:number,y:number){
  dragPlan=null;dropMarker=null;
  const index=visible.findIndex(i=>i.instanceKey===key),rect=grid?.getBoundingClientRect();if(index<0||!rect)return;
  dragColumns=columns;
  const boxes=visible.map(i=>{const r=grid!.querySelector<HTMLElement>(`[data-instance="${i.instanceKey}"]`)!.getBoundingClientRect();return {left:r.left+scrollX,top:r.top+scrollY,right:r.right+scrollX,bottom:r.bottom+scrollY};});
  dragSnapshot={columns,stacked,positions:basePositions.map(p=>({...p})),boxes,offsetX:Math.max(0,Math.floor((x+scrollX-boxes[index].left)/(cellSize+WIDGET_GAP))),offsetY:Math.max(0,Math.floor((y+scrollY-boxes[index].top)/(cellSize+WIDGET_GAP)))};
 }
 function previewMove(x:number,y:number){
  const key=drag||touchDrag,snapshot=dragSnapshot,rect=grid?.getBoundingClientRect();if(!key||!snapshot||!rect)return;
  if(snapshot.columns!==columns||snapshot.stacked!==stacked){clearDrag();return;}
  dragPlan=null;dropMarker=null;
  if(x<rect.left||x>=rect.right||y<rect.top||y>=rect.bottom)return;
  const from=visible.findIndex(i=>i.instanceKey===key);
  const to=stacked?snapshot.boxes.findIndex(b=>x+scrollX>=b.left&&x+scrollX<b.right&&y+scrollY>=b.top&&y+scrollY<b.bottom):snapshot.positions.slice(0,visible.length).findIndex(p=>{
   const left=rect.left+(p.column-1)*(cellSize+WIDGET_GAP),top=rect.top+(p.row-1)*(cellSize+WIDGET_GAP);
   return x>=left&&x<left+p.width*(cellSize+WIDGET_GAP)-WIDGET_GAP&&y>=top&&y<top+p.height*(cellSize+WIDGET_GAP)-WIDGET_GAP;
  });
  if(to===from)return;
  if(stacked){if(to>=0){const order=visible.map((_,i)=>i);order.splice(from,1);order.splice(to,0,from);dragPlan={order,positions:basePositions};}return;}
  const target=to>=0?snapshot.positions[to]:{column:Math.floor((x-rect.left)/(cellSize+WIDGET_GAP))+1-snapshot.offsetX,row:Math.floor((y-rect.top)/(cellSize+WIDGET_GAP))+1-snapshot.offsetY};
  const plan=planWidgetMove(dimensions,columns,snapshot.positions,from,target,to>=0?to:undefined);
  dragPlan=plan;dropMarker={...(plan?.positions[from]??{...target,width:Math.min(columns,dimensions[from].columns),height:dimensions[from].rows}),valid:!!plan};
 }
 function applyMove(plan:WidgetMove){
  const ordered=plan.order.map(i=>visible[i]);const hidden=instances.filter(i=>!i.enabled);
  if(stacked){instances=[...hidden,...ordered];}else{instances=[...hidden,...plan.order.map(i=>({...visible[i],settings:{...visible[i].settings,gridPosition:anchorSettings(columns,plan.positions[i])}}))];}
  orderDirty=true;
 }
 function finishDrag(){const key=drag||touchDrag,plan=dragPlan;if(plan&&!saving)applyMove(plan);clearDrag();if(plan){void persistOrder();void tick().then(()=>document.querySelector<HTMLButtonElement>(`[data-drag="${key}"]`)?.focus({preventScroll:true}));}}
 function markerStyle(p:WidgetPosition){const column=Math.max(1,Math.min(p.column,columns-p.width+1));return `left:${(column-1)*(cellSize+WIDGET_GAP)}px;top:${(Math.max(1,p.row)-1)*(cellSize+WIDGET_GAP)}px;width:${p.width*(cellSize+WIDGET_GAP)-WIDGET_GAP}px;height:${p.height*(cellSize+WIDGET_GAP)-WIDGET_GAP}px`;}
 function openAdd(event:MouseEvent){returnFocus=event.currentTarget as HTMLElement;selectRelease(selected);adding=true;}
 function closeAdd(){adding=false;void tick().then(()=>returnFocus?.focus({preventScroll:true}));}
 function visualIndex(index:number){return stacked&&dragPlan&&index<visible.length?dragPlan.order.indexOf(index):index;}
 function position(index:number){const p=positions[index];return `order:${visualIndex(index)};grid-column:${p.column} / span ${p.width};grid-row:${p.row} / span ${p.height};--card-width:${p.width*(cellSize+WIDGET_GAP)-WIDGET_GAP}px;--card-height:${p.height*(cellSize+WIDGET_GAP)-WIDGET_GAP}px`;}
 onMount(()=>{if(!grid)return;const observer=new ResizeObserver(entries=>gridWidth=entries[0].contentRect.width);observer.observe(grid);return()=>observer.disconnect();});
 onMount(()=>{void load();return clearDrag;});
 async function load(){loading=true;error='';try{const [l,c]=await Promise.all([fetch('/v1/employees/me/widget-layout'),fetch('/v1/widget-releases?limit=500')]);if(!l.ok||!c.ok)throw Error();saved=await apiData<WidgetLayout>(l);instances=structuredClone($state.snapshot(saved.instances));releases=await apiData<WidgetRelease[]>(c);selected=latestWidgetReleases(releases)[0]?.id??0;orderDirty=false;adding=false;}catch{error=t.failed;}finally{loading=false;}}
 function cancel(){instances=structuredClone($state.snapshot(saved.instances));orderDirty=false;adding=false;error='';}
 async function save(candidate=instances){saving=true;error='';try{const r=await fetch('/v1/employees/me/widget-layout',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision:saved.revision,instances:candidate})});if(!r.ok){error=r.status===409?t.conflict:t.saveFailed;return false;}saved=await apiData<WidgetLayout>(r);instances=structuredClone($state.snapshot(saved.instances));orderDirty=false;adding=false;return true;}catch{error=t.saveFailed;return false;}finally{saving=false;}}
 function move(key:string,to:number){if(saving)return;const from=instances.findIndex(i=>i.instanceKey===key);if(from<0||to<0||to>=instances.length||from===to)return;const list=[...instances];const [item]=list.splice(from,1);list.splice(to,0,item);instances=list;orderDirty=true;void tick().then(()=>document.querySelector<HTMLButtonElement>(`[data-drag="${key}"]`)?.focus({preventScroll:true}));}
 async function add(){
  if(!selectedRelease||saving||addInvalid)return;if(instances.length>=40){error=t.max;return;}
  const def=selectedRelease.definition;
  const values:WidgetValues=addPersonalNote?{note:addNote}:{timeZones:[...addZones]};
  const initialRecords=addCanEditContent?(def.runtime?addRecords:(addHasZones||addPersonalNote)?[{recordKey:'default',values}]:undefined):undefined;
  const candidate:WidgetInstance&{initialRecords?:Array<{recordKey:string;values:WidgetValues}>}={instanceKey:crypto.randomUUID(),releaseId:selectedRelease.id,size:def.sizes.includes(size)?size:def.sizes[0],enabled:true,settings:{...Object.fromEntries(Object.entries(def.settings).map(([k,v])=>[k,v.default])),...(def.runtime&&def.configuration?{custom:[JSON.stringify(addConfig)]}:{}),...(addClock?{clockDesign:[design]}:{}),...(addPersonalNote?{title:[addTitle.trim()]}:{})},definition:def,allowed:true,...(initialRecords?{initialRecords}:{})};
  if(await save([...instances,candidate]))void tick().then(()=>returnFocus?.focus({preventScroll:true}));
 }
 function touchStart(event:PointerEvent,key:string){if(event.pointerType==='mouse'||saving)return;beginDrag(key,event.clientX,event.clientY);touchDrag=key;touchPoint={x:event.clientX,y:event.clientY};touchFrame=requestAnimationFrame(scrollTouch);event.currentTarget instanceof HTMLElement && event.currentTarget.setPointerCapture(event.pointerId);}
 function touchMove(event:PointerEvent){if(touchDrag){touchPoint={x:event.clientX,y:event.clientY};previewMove(event.clientX,event.clientY);}}
</script>
<svelte:window onpointermove={touchMove} onpointerup={()=>endTouch()} onpointercancel={()=>endTouch(true)} onresize={clearDrag} onkeydown={event=>{if(event.key==='Escape')clearDrag();}} />
<div class="my-widgets" data-widget-owner={user.id}>
 {#if informationInstance}<WidgetInformationModal instance={informationInstance} returnFocus={informationFocus} onClose={()=>informationInstance=null}/>{/if}
 {#if settingsInstance}<WidgetSettingsModal instance={settingsInstance} returnFocus={settingsFocus} busy={saving} {error} onRemove={()=>removeWidget(settingsInstance!.instanceKey)} onClose={closeSettings} onApply={applySettings} onDismissError={()=>error=''} {columns} {cellSize}/>{/if}
 <MasterPageHeader title={localeMessages[$localization.displayLanguage].myPage.title} titleId="my-page-title"/>
 {#if orderDirty&&error}<section class="widget-toolbar panel"><div class="actions"><button disabled={saving} onclick={cancel}>{t.cancel}</button><button class="primary" disabled={saving} onclick={()=>void persistOrder()}>{t.retry}</button></div></section>{/if}
 {#if error&&!adding&&!settingsInstance}<StatusNotice message={error} tone="error" onDismiss={()=>error=''}/><button onclick={()=>{if(!orderDirty||confirm(t.unsaved))void load();}}>{t.reload}</button>{/if}
 {#if adding}<DetailModal dialogClass="widget-add-dialog" title={t.add} titleId="widget-add-title" closeLabel={t.cancel} {returnFocus} onClose={closeAdd}><section class="catalogue">{#if error}<StatusNotice message={error} tone="error" onDismiss={()=>error=''}/>{/if}{#if instances.length>=40}<p role="status">{t.max}</p>{/if}{#if !releases.length}<p>{t.catalogueEmpty}</p>{:else}
 <div class="catalogue-fields"><div class="widget-choice"><div class="widget-choice-sizer" aria-hidden="true" inert>{#each catalogueReleases as release}<span>{releaseLabel(release)}</span>{/each}</div><SearchSelect label={t.widgets} field="widget-release" value={String(selected)} disabled={saving} options={catalogueReleases.map(r=>({value:String(r.id),label:releaseLabel(r)}))} onSelect={value=>selectRelease(Number(value))}/></div>
 {#if selectedRelease}<div class="size-choice"><SearchSelect label={t.displaySize} field="widget-add-size" value={size} disabled={saving} searchable={false} options={selectedRelease.definition.sizes.map(s=>({value:s,label:widgetSizeLabel(selectedRelease!.definition,s,lang,true)}))} onSelect={value=>size=value as WidgetSize}/></div>{/if}</div>
 {#if selectedRelease?.definition.runtime}
 {#if selectedRelease.definition.configuration}<RuntimeFields schema={selectedRelease.definition.configuration} values={addConfig} {lang} disabled={saving} onChange={v=>addConfig=v}/>{/if}
 {#if selectedRelease.definition.storage}{#each addRecords as row,index}<RuntimeFields schema={selectedRelease.definition.storage} values={row.values} {lang} disabled={saving||!addCanEditContent} onChange={v=>addRecords=addRecords.map((r,i)=>i===index?{...r,values:v}:r)}/>{/each}{/if}
 {/if}
 {#if addHasZones}<SearchMultiSelect label={t.zoneSelection} field="widget-add-zones" values={addZones} options={addZoneOptions} disabled={saving||!addCanEditContent} error={addInvalidZones?t.zoneLimit:''} onChange={values=>addZones=values}/>{/if}
 {#if addPersonalNote}<FormInput label={lang==='ja'?'タイトル（任意・40文字まで）':'Title (optional, up to 40 characters)'} field="widget-add-note-title" value={addTitle} maxlength={40} disabled={saving} onValueChange={value=>addTitle=value}/><FormTextarea label={lang==='ja'?'メモ（任意・本人専用）':'Note (optional, private)'} field="widget-add-note" maxlength={5000} rows={8} disabled={saving||!addCanEditContent} value={addNote} placeholder={lang==='ja'?'例：今日の作業メモ':'e.g. Notes for today'} helpText={`${addNote.length} / 5,000`} onValueChange={value=>addNote=value}/>{/if}
 {#if addClock}<div class="design-choice"><SearchSelect label={t.clockDesign} field="widget-add-design" value={design} disabled={saving} searchable={false} options={[{value:'digital',label:t.digital},{value:'analog',label:t.analog}]} onSelect={value=>design=value as 'digital'|'analog'}/></div>{/if}
 {#if selectedRelease}{#key selectedRelease.id}<div class="preview" class:sized-preview={sizedPreview} data-size={size}><h3>{t.preview} · {selectedRelease.definition.name[lang]}{typeof previewTitle==='string'&&previewTitle.trim()?` · ${previewTitle.trim()}`:''}</h3>{#if sizedPreview}<div class="sized-preview-space" bind:this={sizedPreviewSpace}><div class="sized-preview-viewport" style={`width:${previewBodyWidth*sizedPreviewScale}px;height:${previewBodyHeight*sizedPreviewScale}px`}><div class="sized-preview-stage" class:compact={compactPreview} bind:this={sizedPreviewStage} style={`width:${previewBodyWidth}px;height:${compactPreview?'auto':previewBodyHeight+'px'};transform:scale(${sizedPreviewScale})`}><WidgetContent configuration={addConfig} initialRecords={addRecords} note={addNote} definition={selectedRelease.definition} {size} data={preview} scale={contentScale} clockDesign={design} previewOnly={true}/></div></div></div>{:else}<WidgetContent configuration={addConfig} initialRecords={addRecords} note={addNote} definition={selectedRelease.definition} {size} data={preview} scale={contentScale} clockDesign={design} previewOnly={true}/>{/if}</div>
 {/key}{/if}{/if}</section>
 {#snippet actions()}<div class="catalogue actions"><button disabled={saving} onclick={closeAdd}>{t.cancel}</button><button class="primary" disabled={saving||!selectedRelease||instances.length>=40||addInvalid} onclick={()=>void add()}>{t.addAndSave}</button></div>{/snippet}</DetailModal>{/if}
 {#if loading}<p role="status">{t.loading}</p>{:else if !error&&!instances.length&&!emptyNoticeDismissed}<StatusNotice message={lang==='ja'?'さまざまなウィジェットを追加して、自分だけのマイページをつくりましょう！「＋」から追加できます。':'Add your favorite widgets to create your own My Page. Choose “+” to get started.'} tone="info" onDismiss={()=>emptyNoticeDismissed=true}/>{/if}
 <div bind:this={grid} class="cards" class:has-compact-tool={visible.some(i=>widgetUsesCompactLayout(i.definition))} class:dragging={!!(drag||touchDrag)} style={`reading-flow:${stacked?'flex-visual':'grid-order'};--columns:${columns};--cell-height:${cellSize}px;--cell-gap:${WIDGET_GAP}px;--widget-content-scale:${contentScale};${dragRows?`min-height:max(${dragRows*(cellSize+WIDGET_GAP)-WIDGET_GAP}px,calc(100dvh - 100px))`:''}`} role="list" aria-label={t.widgets} ondragover={event=>{if(drag){event.preventDefault();previewMove(event.clientX,event.clientY);}}} ondragleave={event=>{if(event.relatedTarget instanceof Node&&grid?.contains(event.relatedTarget))return;dragPlan=null;dropMarker=null;}} ondrop={event=>{if(drag){event.preventDefault();previewMove(event.clientX,event.clientY);finishDrag();}}}>
 {#each mountedInstances as instance (instance.instanceKey)}
 {#if instance.enabled}<article class="panel" class:compact-tool-card={widgetUsesCompactLayout(instance.definition)} style={position(visible.findIndex(i=>i.instanceKey===instance.instanceKey))} data-size={instance.size} data-widget={instance.definition.id} data-instance={instance.instanceKey} role="listitem" aria-posinset={visualIndex(visible.findIndex(i=>i.instanceKey===instance.instanceKey))+1} aria-setsize={visible.length+1}>
 <header><h3 title={cardTitle(instance)}>{cardTitle(instance)}</h3><div class="card-actions"><button class="widget-information-button" type="button" aria-label={`${t.information}: ${instance.definition.name[lang]}`} title={t.information} onclick={event=>openInformation(event,instance)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v6"/><circle cx="12" cy="7.5" r=".75" fill="currentColor" stroke="none"/></svg></button><button class="widget-settings-button" type="button" aria-label={`${t.settings}: ${instance.definition.name[lang]}`} title={t.settings} disabled={saving || !allowedOperation('widgets.layout.update')} onclick={event=>openSettings(event,instance)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m9.5 3-.7 2.2-2 .9-2.2-.5-2 3.5 1.5 1.7v2.4l-1.5 1.7 2 3.5 2.2-.5 2 .9.7 2.2h5l.7-2.2 2-.9 2.2.5 2-3.5-1.5-1.7v-2.4l1.5-1.7-2-3.5-2.2.5-2-.9L14.5 3z"/><circle cx="12" cy="12" r="3"/></svg></button><button type="button" class="drag-handle" disabled={saving || !allowedOperation('widgets.layout.update')} draggable={!saving && allowedOperation('widgets.layout.update')} onpointerdown={event=>touchStart(event,instance.instanceKey)} data-drag={instance.instanceKey} aria-label={t.drag} title={t.drag} ondragstart={event=>{beginDrag(instance.instanceKey,event.clientX,event.clientY);drag=instance.instanceKey;setTimeout(()=>{if(drag===instance.instanceKey)dragSurface=true;},0);event.dataTransfer?.setData('text/plain',drag);if(event.dataTransfer)event.dataTransfer.effectAllowed='move';}} ondragend={clearDrag} onkeydown={event=>{if(event.key==='ArrowUp'||event.key==='ArrowDown'){event.preventDefault();keyMove(instance.instanceKey,event.key==='ArrowUp'?-1:1);}}}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg></button></div></header>
 <div class="widget-body" role="region" aria-label={instance.definition.name[lang]}>
 <WidgetCard {instance} scale={contentScale}/>
 </div></article>{/if}{/each}
 {#if !loading}<div class="add-card" style={position(visible.length)} role="listitem" aria-posinset={visible.length+1} aria-setsize={visible.length+1}><button class="add-widget" aria-label={t.add} title={t.add} disabled={saving || !allowedOperation('widgets.layout.update')} onclick={openAdd}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></button></div>{/if}
 {#if dragSurface}<div class="drag-surface" aria-hidden="true"></div>{/if}
 {#if dropMarker}<div class="drop-marker" class:invalid={!dropMarker.valid} style={markerStyle(dropMarker)} aria-hidden="true"></div>{/if}</div>
</div>
<style>

 .preview h3{overflow-wrap:anywhere}
 .cards{position:relative}.drag-surface{position:absolute;inset:0;z-index:3}.drop-marker{position:absolute;z-index:4;pointer-events:none;box-sizing:border-box;border:2px dashed var(--action-primary);border-radius:7px;background:color-mix(in srgb,var(--action-primary) 12%,transparent)}.drop-marker.invalid{border-color:var(--danger,#dc2626);background:color-mix(in srgb,var(--danger,#dc2626) 12%,transparent)}.cards.dragging .add-widget{pointer-events:none}
 .my-widgets{min-width:0}.panel{padding:18px;background:var(--surface);border:1px solid var(--border);border-radius:7px;box-shadow:var(--shadow);min-width:0;overflow-wrap:anywhere}.widget-toolbar{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:12px;margin-bottom:16px}.actions{display:flex;flex-wrap:wrap;gap:8px;align-items:center}.cards{display:grid;grid-template-columns:repeat(var(--columns),minmax(0,1fr));grid-auto-rows:var(--cell-height);gap:var(--cell-gap);margin:0 0 16px}.cards article{display:flex;flex-direction:column;overflow:hidden;box-sizing:border-box;padding:12px}.widget-body{flex:1;min-height:0;overflow:hidden}.card-actions{display:flex;flex:none;align-items:center}.widget-information-button,.widget-settings-button,.drag-handle{display:grid;place-items:center;width:44px;height:44px;padding:10px;border:0;background:transparent;color:var(--muted);flex:none}.widget-information-button svg,.widget-settings-button svg,.drag-handle svg{width:20px;height:20px}.card-actions button+button{margin-left:0}.widget-information-button:hover,.widget-settings-button:hover{color:var(--action-primary)}.cards header{flex:none;height:48px;min-height:48px;margin-bottom:8px}.cards h3{flex:1;min-width:0;font-size:var(--font-size-subsection);line-height:1.3;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.add-card{min-width:0}.add-widget{display:flex;align-items:center;justify-content:center;width:100%;height:100%;border:2px dashed var(--border);border-radius:7px;background:var(--surface);color:var(--muted)}.add-widget:hover{border-color:var(--action-primary);color:var(--action-primary)}.add-widget svg{width:calc(36px*var(--widget-content-scale));height:calc(36px*var(--widget-content-scale))}.add-widget:focus-visible{outline:2px solid var(--action-primary);outline-offset:2px}h3{font-size:var(--font-size-section);margin:0}header{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:14px}button{font:inherit;min-height:44px;border:1px solid var(--border);border-radius:6px;background:var(--surface);color:var(--text);padding:8px 12px;max-width:100%;min-width:0}button{cursor:pointer}button:disabled{cursor:default;opacity:.5}.primary{background:var(--action-primary-background);border-color:var(--action-primary-button-border);color:var(--action-primary-text)}.primary:hover:not(:disabled){background:var(--action-primary-background-hover)}.drag-handle{touch-action:none;cursor:grab;flex-shrink:0}.catalogue{min-width:0;display:grid;grid-template-columns:minmax(0,1fr);gap:16px}.catalogue-fields{display:grid;grid-template-columns:minmax(0,max-content) max-content;justify-content:start;align-items:start;gap:16px;min-width:0}.catalogue-fields :global(.form-select-field>span){white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.widget-choice{display:grid;grid-template-columns:minmax(0,1fr);width:max-content;min-width:0;max-width:100%}.widget-choice-sizer{display:grid;height:0;overflow:hidden;visibility:hidden;pointer-events:none;font-size:var(--font-size-body);font-weight:500}.widget-choice-sizer span{grid-area:1/1;white-space:nowrap;padding:0 32px 0 12px}.widget-choice :global(.form-select-trigger>span),.widget-choice :global(.option-list button){white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.size-choice{width:max-content;max-width:160px}.design-choice{width:200px;max-width:100%}.catalogue.actions{display:flex}.catalogue.actions{margin-bottom:0}.preview{box-sizing:border-box;padding:16px;border:1px dashed var(--border);border-radius:7px;margin:16px 0;max-width:100%}
 :global(.widget-add-dialog .app-detail-body){scrollbar-gutter:stable}
 .preview.sized-preview{width:100%}.sized-preview-space{min-width:0}.sized-preview-viewport{position:relative;overflow:hidden;border-radius:4px;background:var(--surface)}.sized-preview-stage{position:absolute;top:0;left:0;transform-origin:top left}.sized-preview-stage :global(.widget-content){height:100%}.sized-preview-stage.compact :global(.widget-content){height:auto}.sized-preview-stage :global(.clocks-wrap.preview-clocks),.sized-preview-stage :global(.preview-clocks .clocks){height:100%}
 @media (max-width:700px), (min-width:701px) and (max-width:1024px) and (max-height:500px) and (any-pointer:coarse){.cards.has-compact-tool{display:flex;flex-direction:column;align-items:flex-start}.cards.has-compact-tool article{flex:none;width:var(--card-width);height:var(--card-height);max-width:100%}.cards.has-compact-tool .compact-tool-card{width:100%;height:auto;scroll-margin-top:60px}.cards.has-compact-tool .compact-tool-card>header{margin-bottom:4px}.cards.has-compact-tool .add-card{flex:none;width:var(--cell-height);height:var(--cell-height);max-width:100%}.widget-toolbar{padding:14px}.actions{width:100%}.actions button{flex:1 1 auto}}
</style>
