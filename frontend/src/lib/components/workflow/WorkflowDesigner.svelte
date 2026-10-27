<script lang="ts">
 import InfoPopover from '$lib/components/InfoPopover.svelte';
 import ActionButton from '$lib/components/ActionButton.svelte';
 import ControlButton from '$lib/components/ControlButton.svelte';
 import {untrack,onDestroy} from 'svelte';
 import {beforeNavigate,goto} from '$app/navigation';
 import {localization} from '$lib/localization';
 import {planFieldMove} from '$lib/workflow-layout';
 import {resizeFieldGrid,type GridEdge,fieldGrid,canPlaceField,materializeFieldGrid,FORM_GRID_COLUMNS,FORM_GRID_ROWS,type FieldGrid,fieldTypes,isContainer,isRepeat,isDisplay,fieldsOf,fieldPaths,cloneField,definitionErrors,defaults,normalize,type Field,type FieldType,type Definition,type Values,type WorkflowRoute,type Directory} from '$lib/workflow-form';
 import {partNames,choose,workflowApi,workflowError,emptyDirectory,type Template,type Attachment,WorkflowError} from '$lib/workflow-client';
 import Control from './WorkflowControl.svelte';
 import FormCheckbox from '$lib/components/FormCheckbox.svelte';
 import PageTabs from '$lib/components/PageTabs.svelte';
 import StatusNotice from '$lib/components/StatusNotice.svelte';
 import '$lib/styles/workflow.css';
 import WorkflowFields from './WorkflowFields.svelte';
 import WorkflowRules from './WorkflowRules.svelte';
 import DiscardChangesDialog from '$lib/components/DiscardChangesDialog.svelte';
 let {template,directory=emptyDirectory,onsaved,onclose}:{template:Template;directory?:Directory;onsaved:(saved:Template)=>void;onclose:()=>void}=$props();
 let draft=$state<Template>(untrack(()=>structuredClone($state.snapshot(template)))),selectedId=$state(''),highlightSelection=$state(true),target=$state(''),search=$state(''),mode=$state('design'),mobilePanel=$state('canvas'),previewValues=$state<Values>({}),previewCurrency=$state('JPY'),previewMobile=$state(false),error=$state(''),notice=$state(''),busy=$state(false),discard=$state(false),persisted=$state<Template>(untrack(()=>structuredClone($state.snapshot(template)))),discardApproved=$state(false),routeUndo=$state<string[]>([]),routeRedo=$state<string[]>([]),undo=$state<string[]>([]),redo=$state<string[]>([]);
 let ja=$derived($localization.displayLanguage==='ja'),all=$derived(fieldsOf(draft.definition.fields)),selected=$derived(all.find(f=>f.id===selectedId)),formDirty=$derived(JSON.stringify(formContent(draft))!==JSON.stringify(formContent(persisted))),routeDirty=$derived(JSON.stringify(draft.route)!==JSON.stringify(persisted.route)),dirty=$derived(!discardApproved&&(formDirty||routeDirty)),issues=$derived(definitionErrors(draft.definition));
 const t=(a:string,b:string)=>choose(ja,a,b);
 let libraryPanel=$state('parts');
 let collapsedGroups=$state<string[]>([]);
 let grouping=$state<string[]>([]),dragging=$state(''),outside=$state(false),removePending=$state(false),removeTarget=$state(''),pendingUrl=$state('');
 let paths=$derived(fieldPaths(draft.definition.fields));
 let groupIds=$derived.by(()=>{
  const checked=new Set(grouping),ids:string[]=[];
  function collect(fields:Field[]){for(const field of fields){if(checked.has(field.id))ids.push(field.id);else collect(field.children??[]);}}
  collect(draft.definition.fields);return ids;
 });
 function checkOutline(field:Field,checked:boolean){
  const ids=new Set(grouping);for(const child of fieldsOf([field])){if(checked)ids.add(child.id);else ids.delete(child.id);}
  function sync(fields:Field[]){for(const item of fields){if(item.children?.length){sync(item.children);if(item.children.every(child=>ids.has(child.id)))ids.add(item.id);else ids.delete(item.id);}}}
  sync(draft.definition.fields);grouping=[...ids];
 }
 function partiallyChecked(field:Field){return !grouping.includes(field.id)&&fieldsOf(field.children??[]).some(child=>grouping.includes(child.id));}
 let references=$derived(all.map(f=>({...f,label:paths.get(f.id)??f.label})));
 let dependants=$derived.by(()=>{const field=removePending?all.find(f=>f.id===removeTarget):selected;const removed=new Set(field?fieldsOf([field]).map(f=>f.id):[]);return all.filter(f=>!removed.has(f.id)&&[...(f.calculation?.refs??[]),...(f.visibleWhen?.rules.map(r=>r.field)??[]),...(f.requiredWhen?.rules.map(r=>r.field)??[])].some(id=>removed.has(id)));});
 type SaveScope='form'|'route';
 function formContent(value:Template){return {name:value.name,description:value.description,definition:value.definition};}
 function historyValue(scope:SaveScope){return JSON.stringify(scope==='form'?formContent(draft):draft.route);}
 function snapshot(scope:SaveScope='form'){notice='';const current=historyValue(scope);if(scope==='route'){if(routeUndo.at(-1)!==current)routeUndo=[...routeUndo.slice(-49),current];routeRedo=[];}else{if(undo.at(-1)!==current)undo=[...undo.slice(-49),current];redo=[];}}
 function recordEdit(e:Event){const node=e.target as HTMLElement;if(node.closest('.route'))snapshot('route');else if(node.closest('.basics,.properties'))snapshot();}
 let previewAttachments=$state<Attachment[]>([]),previewFile=$state<Attachment|null>(null);
 const previewUrls=new Map<string,string>();
 async function previewUpload(files:File[]){
  if(files.some(f=>f.size>10*1024*1024||!['image/jpeg','image/png','image/webp','application/pdf'].includes(f.type))||previewAttachments.length+files.length>20||previewAttachments.reduce((s,f)=>s+f.size,0)+files.reduce((s,f)=>s+f.size,0)>50*1024*1024)throw Error('INVALID_ATTACHMENT');
  const added=files.map(file=>{const attachment={attachmentKey:crypto.randomUUID(),name:file.name,mime:file.type,size:file.size};previewUrls.set(attachment.attachmentKey,URL.createObjectURL(file));return attachment;});previewAttachments=[...previewAttachments,...added];return added;
 }
 function previewDownload(file:Attachment,image:boolean){if(image){previewFile=file;return;}const link=document.createElement('a');link.href=previewUrls.get(file.attachmentKey)??'';link.download=file.name;link.click();}
 onDestroy(()=>{for(const url of previewUrls.values())URL.revokeObjectURL(url);});
 function restore(back:boolean,scope:SaveScope='form'){
  const source=scope==='form'?(back?undo:redo):(back?routeUndo:routeRedo);if(!source.length)return;
  const previous=source.at(-1)!,current=historyValue(scope);
  if(scope==='form'){if(back){undo=undo.slice(0,-1);redo=[...redo,current];}else{redo=redo.slice(0,-1);undo=[...undo,current];}draft={...draft,...JSON.parse(previous)};}
  else{if(back){routeUndo=routeUndo.slice(0,-1);routeRedo=[...routeRedo,current];}else{routeRedo=routeRedo.slice(0,-1);routeUndo=[...routeUndo,current];}draft.route=JSON.parse(previous);}
  notice='';
 }
 function edit(prop:string,value:unknown){if(!selected)return;snapshot();Object.assign(selected,{[prop]:value});}
 function destination(){return target?all.find(f=>f.id===target)?.children??draft.definition.fields:draft.definition.fields;}
 function component(type:FieldType){
  const id='f_'+crypto.randomUUID().replaceAll('-','');const f:Field={id,type,label:partNames[type][ja?0:1]};
  if(isContainer(f))f.children=[];
  if(isRepeat(f)){f.minRows=0;f.maxRows=100;}
  if(['select','radio','multiSelect'].includes(type))f.options=[t('選択肢1','Option 1'),t('選択肢2','Option 2')];
  if(type==='calculated')f.calculation={op:'sum',refs:all.filter(f=>['money','decimal','integer'].includes(f.type)).slice(0,1).map(f=>f.id),decimals:2};
  return f;
 }
 function add(type:FieldType){
  if(busy||!availableParts[type])return;snapshot();materializeFieldGrid(draft.definition.fields);const f=component(type);destination().push(f);materializeFieldGrid(draft.definition.fields);selectedId=f.id;mobilePanel='properties';
 }
 function locate(id:string,list=draft.definition.fields):{list:Field[];index:number}|null{for(let i=0;i<list.length;i++){if(list[i].id===id)return {list,index:i};const found=locate(id,list[i].children??[]);if(found)return found;}return null;}
 function movement(direction:-1|1){const p=locate(selectedId);if(!p)return null;const result=planFieldMove(p.list,selectedId,direction);return result?{list:p.list,result}:null;}
 let upward=$derived(movement(-1)),downward=$derived(movement(1));
 function move(direction:-1|1){
  const plan=direction===-1?upward:downward;if(busy||!plan)return;
  snapshot();materializeFieldGrid(draft.definition.fields);
  plan.list.splice(0,plan.list.length,...plan.result.map(item=>{item.field.grid=item.grid;return item.field;}));
 }
 function fits(fields:Field[]){try{fieldGrid(fields);return true;}catch{return false;}}
 function depthOf(list:Field[],fields=draft.definition.fields,depth=0):number{if(list===fields)return depth;for(const f of fields){if(f.children){const found=depthOf(list,f.children,depth+1);if(found>=0)return found;}}return -1;}
 function treeDepth(field:Field):number{return field.children?.length?1+Math.max(...field.children.map(treeDepth)):0;}
 function probe(list:Field[],field:Field){let id='layout_probe';while(list.some(f=>f.id===id))id+='_';return {...field,id,grid:undefined};}
 let availableParts=$derived.by(()=>{
  const list=destination(),allowed=all.length<300&&depthOf(list)<=5;
  const sizes={small:allowed&&fits([...list,probe(list,{id:'',type:'text',label:''})]),wide:allowed&&fits([...list,probe(list,{id:'',type:'textarea',label:''})]),container:allowed&&fits([...list,probe(list,{id:'',type:'group',label:''})])};
  return Object.fromEntries(fieldTypes.map(type=>[type,sizes[isContainer({type} as Field)?'container':type==='textarea'?'wide':'small']]));
 });
 let canDuplicate=$derived.by(()=>{const p=locate(selectedId);return !!p&&!!selected&&all.length+fieldsOf([selected]).length<=300&&fits([...p.list,probe(p.list,selected)]);});
 let canMoveTo=$derived.by(()=>{
  const p=locate(selectedId),list=destination();if(!p||!selected||list===p.list||target===selectedId||fieldsOf(selected.children??[]).some(f=>f.id===target))return false;
  return depthOf(list)+treeDepth(selected)<=5&&fits([...list,{...selected,grid:undefined}]);
 });
 let canGroup=$derived.by(()=>{
  const ids=groupIds.length?groupIds:[selectedId],positions=ids.map(id=>locate(id)),first=positions[0];
  if(all.length>=300||!first||positions.some(p=>!p||p.list!==first.list))return false;
  const children=first.list.filter(f=>ids.includes(f.id));
  return depthOf(first.list)+1+Math.max(...children.map(treeDepth))<=5&&fits([...first.list.filter(f=>!ids.includes(f.id)),probe(first.list,{id:'',type:'group',label:'',children})]);
 });
 let canUngroup=$derived.by(()=>{const p=locate(selectedId);return !!p&&!!selected&&['group','page'].includes(selected.type)&&fits([...p.list.filter(f=>f.id!==selectedId),...(selected.children??[]).map(f=>({...f,grid:undefined}))]);});
 function moveTo(){
  const p=locate(selectedId);if(busy||!canMoveTo||!p)return;
  const f=p.list[p.index];if(target===f.id||fieldsOf(f.children??[]).some(c=>c.id===target))return;
  snapshot();materializeFieldGrid(draft.definition.fields);p.list.splice(p.index,1);delete f.grid;destination().push(f);materializeFieldGrid(draft.definition.fields);
 }
 function duplicate(){const p=locate(selectedId);if(busy||!canDuplicate||!p)return;snapshot();materializeFieldGrid(draft.definition.fields);const f=cloneField(p.list[p.index]);delete f.grid;p.list.splice(p.index+1,0,f);materializeFieldGrid(draft.definition.fields);selectedId=f.id;}
 function remove(){removeTarget=selectedId;if(dependants.length){removePending=true;return;}removeSelected(selectedId);}
 function removeSelected(id:string){const p=locate(id);if(!p)return;snapshot();const removed=new Set(fieldsOf([p.list[p.index]]).map(f=>f.id));p.list.splice(p.index,1);
  for(const f of all){for(const prop of ['visibleWhen','requiredWhen'] as const){const c=f[prop];if(c){const rules=c.rules.filter(r=>!removed.has(r.field));f[prop]=rules.length?{...c,rules}:undefined;}}if(f.calculation)f.calculation.refs=f.calculation.refs.filter(id=>!removed.has(id));}
  selectedId='';removePending=false;grouping=grouping.filter(id=>!removed.has(id));
 }
 function group(){
  if(busy||!canGroup)return;
  const ids=groupIds.length?groupIds:[selectedId],positions=ids.map(id=>locate(id));if(!positions.length||positions.some(p=>!p||p.list!==positions[0]?.list)){error=t('同じ階層の項目を選択してください。','Select fields at the same level.');return;}
  snapshot();materializeFieldGrid(draft.definition.fields);const list=positions[0]!.list,children=list.filter(f=>ids.includes(f.id)),index=Math.min(...positions.map(p=>p!.index));
  const f:Field={id:'f_'+crypto.randomUUID().replaceAll('-',''),type:'group',label:t('グループ','Group'),children};
  list.splice(0,list.length,...list.filter(f=>!ids.includes(f.id)));list.splice(index,0,f);for(const child of children)delete child.grid;materializeFieldGrid(draft.definition.fields);selectedId=f.id;grouping=[];
 }
 function ungroup(){const p=locate(selectedId);if(busy||!canUngroup||!p||!['group','page'].includes(p.list[p.index].type))return;snapshot();const children=p.list[p.index].children??[];for(const child of children)delete child.grid;p.list.splice(p.index,1,...children);materializeFieldGrid(draft.definition.fields);selectedId='';}
 function dropCell(event:DragEvent,parent:string,column:number,row:number){
  event.preventDefault();event.stopPropagation();
  const type=event.dataTransfer?.getData('application/x-sph-workflow-part')||(dragging.startsWith('part:')?dragging.slice(5):'');
  const id=event.dataTransfer?.getData('application/x-sph-workflow-field')||event.dataTransfer?.getData('text/plain')||dragging;
  const list=parent?all.find(f=>f.id===parent)?.children:draft.definition.fields;if(!list)return;
  const existing=locate(id),field=fieldTypes.includes(type as FieldType)?component(type as FieldType):existing?.list[existing.index];if(!field)return;
  if(field.id===parent||fieldsOf(field.children??[]).some(f=>f.id===parent)){dragging='';outside=false;return;}
  const old=existing?fieldGrid(existing.list).find(item=>item.field.id===id)?.grid:undefined;
  const grid:FieldGrid={scale:2,column,row,width:old?.width??(isContainer(field)?8:field.type==='textarea'?4:2),height:old?.height??(isContainer(field)?6:1)};
  if(!canPlaceField(list,field.id,grid)){error=t('空いているグリッド内に配置してください。','Choose empty cells within the grid.');dragging='';outside=false;return;}
  snapshot();materializeFieldGrid(draft.definition.fields);if(existing)existing.list.splice(existing.index,1);field.grid=grid;list.push(field);selectedId=field.id;dragging='';outside=false;error='';
 }
 function gridRows(fields:Field[]){return Math.min(FORM_GRID_ROWS,Math.max(4,...fieldGrid(fields).map(item=>item.grid.row+item.grid.height+1)));}
 function gridStyle(g:FieldGrid){return `grid-column:${g.column} / span ${g.width};grid-row:${g.row} / span ${g.height}`;}
 type ColumnSide='parts'|'properties';
 let editorWidth=$state(0),viewportWidth=$state(0),partsWidth=$state<number>(),propertiesWidth=$state<number>();
 let columnResize=$state<{side:ColumnSide;start:number;width:number;parts:number|undefined;properties:number|undefined}|null>(null);
 let columns=$derived.by(()=>{
  const parts=partsWidth??(viewportWidth>1100?220:180),properties=propertiesWidth??(viewportWidth>1100?290:240);
  // Reserve 220px for the canvas and 8px for each separator.
  const scale=editorWidth?Math.min(1,Math.max(0,editorWidth-236)/(parts+properties)):1;
  return {parts:parts*scale,properties:properties*scale};
 });
 function columnMax(side:ColumnSide){return Math.max(0,Math.min(side==='parts'?420:480,editorWidth-236-columns[side==='parts'?'properties':'parts']));}
 function columnMin(side:ColumnSide){return Math.min(side==='parts'?140:180,columnMax(side));}
 function setColumnWidth(side:ColumnSide,value:number){
  const current=columns,width=Math.max(columnMin(side),Math.min(columnMax(side),value));
  partsWidth=side==='parts'?width:current.parts;propertiesWidth=side==='properties'?width:current.properties;
 }
 function startColumnResize(event:PointerEvent,side:ColumnSide){
  if(event.button!==0)return;event.preventDefault();
  columnResize={side,start:event.clientX,width:columns[side],parts:partsWidth,properties:propertiesWidth};
  const handle=event.currentTarget as HTMLElement;handle.focus({preventScroll:true});handle.setPointerCapture(event.pointerId);
 }
 function moveColumnResize(event:PointerEvent){if(columnResize)setColumnWidth(columnResize.side,columnResize.width+(event.clientX-columnResize.start)*(columnResize.side==='parts'?1:-1));}
 function finishColumnResize(cancel=false){if(cancel&&columnResize){partsWidth=columnResize.parts;propertiesWidth=columnResize.properties;}columnResize=null;}
 function columnKeydown(event:KeyboardEvent,side:ColumnSide){
  if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();
  setColumnWidth(side,event.key==='Home'?columnMin(side):event.key==='End'?columnMax(side):columns[side]+(event.key==='ArrowRight'?1:-1)*(side==='parts'?1:-1)*(event.shiftKey?40:10));
 }
 let resizing=$state<{id:string;edge:GridEdge;start:number;cell:number;original:FieldGrid;previous:string;history:string[];future:string[]}|null>(null);
 function startResize(event:PointerEvent,id:string,edge:GridEdge){
  if(event.button!==0)return;event.preventDefault();event.stopPropagation();const p=locate(id);if(!p)return;
  const card=(event.currentTarget as HTMLElement).closest<HTMLElement>('.design-field')!;
  const grid=fieldGrid(p.list).find(item=>item.field.id===id)!.grid;
  const horizontal=['left','right'].includes(edge),bounds=card.getBoundingClientRect();
  resizing={id,edge,start:horizontal?event.clientX:event.clientY,cell:horizontal?(bounds.width+8)/grid.width:(bounds.height+8)/grid.height,original:{...grid},previous:historyValue('form'),history:[...undo],future:[...redo]};
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);selectedId=id;
 }
 function resizeMove(event:PointerEvent){
  if(!resizing)return;const p=locate(resizing.id);if(!p)return;
  const pointer=['left','right'].includes(resizing.edge)?event.clientX:event.clientY;
  const delta=Math.round((pointer-resizing.start)/resizing.cell);
  const next=resizeFieldGrid(resizing.original,resizing.edge,delta);
  if(!canPlaceField(p.list,resizing.id,next))return;
  const current=fieldGrid(p.list).find(item=>item.field.id===resizing!.id)!.grid;
  if(JSON.stringify(next)===JSON.stringify(current))return;
  if(!undo.includes(resizing.previous)){snapshot();materializeFieldGrid(draft.definition.fields);}p.list[p.index].grid=next;
 }
 function finishResize(cancel=false){if(!resizing)return;if(cancel){draft={...draft,...JSON.parse(resizing.previous)};undo=resizing.history;redo=resizing.future;}resizing=null;}
 function keyboardResize(event:KeyboardEvent,id:string,edge:GridEdge){
  const horizontal=['left','right'].includes(edge),negative=horizontal?'ArrowLeft':'ArrowUp',positive=horizontal?'ArrowRight':'ArrowDown';
  if(![negative,positive].includes(event.key))return;event.preventDefault();const p=locate(id);if(!p)return;
  const grid=fieldGrid(p.list).find(item=>item.field.id===id)!.grid,next=resizeFieldGrid(grid,edge,event.key===positive?1:-1);
  if(canPlaceField(p.list,id,next)){snapshot();materializeFieldGrid(draft.definition.fields);p.list[p.index].grid=next;}
 }
 function drag(event:DragEvent,id:string){event.stopPropagation();dragging=id;outside=false;event.dataTransfer?.setData('application/x-sph-workflow-field',id);event.dataTransfer?.setData('text/plain',id);if(event.dataTransfer)event.dataTransfer.effectAllowed='move';}
 function dragPart(event:DragEvent,type:FieldType){dragging='part:'+type;outside=false;event.dataTransfer?.setData('application/x-sph-workflow-part',type);if(event.dataTransfer)event.dataTransfer.effectAllowed='copy';}
 function outsideDrag(event:DragEvent){
  if(!dragging)return;outside=!(event.target instanceof Element&&event.target.closest('.canvas'));
  if(outside){event.preventDefault();if(event.dataTransfer)event.dataTransfer.dropEffect=dragging.startsWith('part:')?'none':'move';}
 }
 function outsideDrop(event:DragEvent){
  if(!dragging||event.target instanceof Element&&event.target.closest('.canvas'))return;
  event.preventDefault();event.stopPropagation();const id=dragging;dragging='';outside=false;
  if(!id.startsWith('part:')&&locate(id)){selectedId=id;remove();}
 }
 function canvasDrop(event:DragEvent){
  let row=1;while(row<FORM_GRID_ROWS&&!canPlaceField(draft.definition.fields,dragging,{scale:2,column:1,row,width:8,height:6}))row++;
  dropCell(event,'',1,row);
 }
 async function save(scope:SaveScope){
  if(busy||scope==='route'&&!draft.templateKey)return;
  error='';notice='';busy=true;
  try{
   if(scope==='form'){materializeFieldGrid(draft.definition.fields);const errors=definitionErrors(draft.definition);if(errors.length)throw new WorkflowError(errors[0]);}
   const payload=structuredClone($state.snapshot(persisted));
   if(scope==='form')Object.assign(payload,structuredClone($state.snapshot(formContent(draft))));else payload.route=structuredClone($state.snapshot(draft.route));
   const saved=await workflowApi<Template>('/v1/workflow-templates'+(payload.templateKey?'/'+payload.templateKey:''),payload.templateKey?'PATCH':'POST',payload);
   draft=scope==='form'?{...saved,route:structuredClone($state.snapshot(draft.route))}:{...saved,...structuredClone($state.snapshot(formContent(draft)))};
   persisted=structuredClone(saved);
   notice=scope==='form'?t('フォーム設計を保存しました。','Form design saved.'):t('承認経路を保存しました。','Approval route saved.');
   if(!saved.route.length)notice+=' '+t('承認経路が未設定のため非公開です。','Unpublished because no approval route is configured.');
   onsaved(saved);
  }catch(e){error=workflowError(e instanceof WorkflowError?e.code:'FAILED',ja);}finally{busy=false;}
 }
 let closeAction:(()=>void)|null=null;
 function close(){requestClose(onclose);}
 export function requestClose(action:()=>void){if(busy)return;if(dirty){closeAction=action;discard=true;}else action();}
 export function isWorking(){return busy;}
 function addApprover(value:string){const e=directory.employees.find(e=>String(e.id)===value);if(!e||draft.route.some(r=>r.employeeId===e.id))return;snapshot('route');draft.route=[...draft.route,{employeeId:e.id,name:e.name}];}
 function routeMove(i:number,offset:number){if(i+offset<0||i+offset>=draft.route.length)return;snapshot('route');const next=[...draft.route];[next[i],next[i+offset]]=[next[i+offset],next[i]];draft.route=next;}
 function preview(){mode='preview';previewValues={...defaults(draft.definition.fields),...previewValues};}
 let previewResult=$derived.by(()=>{try{return normalize(draft.definition,previewValues,previewCurrency,false);}catch{return {values:previewValues,errors:{}};}});
 beforeNavigate(n=>{if(dirty){if(n.willUnload){n.cancel();return;}n.cancel();pendingUrl=n.to?.url.href??'';discard=true;}});
</script>
<svelte:window bind:innerWidth={viewportWidth} onclickcapture={e=>{const node=e.target;if(node instanceof Element)highlightSelection=!!node.closest('[data-design-field],.outline-item');}} ondragovercapture={outsideDrag} ondropcapture={outsideDrop} onkeydown={e=>{if(e.key==='Escape'){dragging='';outside=false;finishResize(true);finishColumnResize(true);}}} onbeforeunload={e=>{if(dirty){e.preventDefault();e.returnValue='';}}}/>
<section class="workflow-ui designer" aria-label={t('ワークフローテンプレートデザイナー','Workflow template designer')} oninputcapture={recordEdit} onchangecapture={recordEdit}>

 {#if error}<StatusNotice message={error} tone="error" onDismiss={()=>error=''}/>{/if}
 {#if notice}<StatusNotice message={notice} tone="success" onDismiss={()=>notice=''}/>{/if}
 <div class="basics">
  <div class="template-name"><Control field="workflow-template-name" label={t('テンプレート名','Name')} required value={draft.name} maxlength={160} beforeChange={snapshot} onValueChange={v=>draft.name=v}/></div>
  <div class="template-description"><Control field="workflow-template-description" label={t('説明','Description')} value={draft.description} maxlength={4000} beforeChange={snapshot} onValueChange={v=>draft.description=v}/></div>
 </div>
 <nav class="modes"><PageTabs embedded idPrefix="workflow-designer-mode" label={t('編集モード','Editor mode')} bind:active={()=>mode,v=>{if(v==='preview')preview();else mode=v;}} tabs={[{id:'design',label:t('フォーム設計','Design form')},{id:'preview',label:t('プレビュー','Preview')},{id:'route',label:t('承認経路','Approval route'),count:draft.route.length}]}/></nav>
 {#if mode==='route'}
  <div id="workflow-designer-mode-route" class="route" role="tabpanel" aria-labelledby="workflow-designer-mode-route-tab"><h3>{t('上から順に承認し、最後の担当者が最終承認者になります。','Approval follows this order. The last person is the final approver.')}</h3>
   <div class="route-toolbar" role="toolbar" aria-label={t('承認経路の編集操作','Approval route editing actions')}>
    <ActionButton type="button" onclick={()=>restore(true,'route')} disabled={!routeUndo.length||busy} variant="secondary">{t('元に戻す','Undo')}</ActionButton>
    <ActionButton type="button" onclick={()=>restore(false,'route')} disabled={!routeRedo.length||busy} variant="secondary">{t('やり直す','Redo')}</ActionButton>
    <ActionButton type="button" class="primary" onclick={()=>save('route')} disabled={busy||!draft.templateKey||!routeDirty} variant="primary">{t('保存','Save')}</ActionButton>
   </div>
   {#if !draft.templateKey}<p>{t('承認経路を保存する前に、フォーム設計を保存してください。','Save the form design before saving the approval route.')}</p>{/if}
   <div class="approver-picker"><Control field="workflow-add-approver" reset label={t('承認者を追加','Add approver')} kind="select" value="" options={directory.employees.filter(e=>!draft.route.some(r=>r.employeeId===e.id)).map(e=>({value:String(e.id),label:e.name}))} onValueChange={addApprover}/></div>
   <ol>{#each draft.route as r,i}<li><span>{r.name} {i===draft.route.length-1?t('（最終承認）','(Final approval)'):''}</span><ActionButton type="button" disabled={i===0} aria-label={t('上へ','Move up')} onclick={()=>routeMove(i,-1)} variant="secondary" data-button-scope="button-79bb5e7bf8">↑</ActionButton><ActionButton type="button" disabled={i===draft.route.length-1} aria-label={t('下へ','Move down')} onclick={()=>routeMove(i,1)} variant="secondary" data-button-scope="button-79bb5e7bf8">↓</ActionButton><ActionButton type="button" onclick={()=>{snapshot('route');draft.route=draft.route.filter((_,n)=>n!==i);}} variant="secondary" data-button-scope="button-79bb5e7bf8">{t('削除','Remove')}</ActionButton></li>{/each}</ol>
   <p>{t('申請者本人を含む経路では提出できません。公開前に担当者を設定してください。','Applicants cannot approve their own requests. Configure the route before publishing.')}</p>
  </div>
 {:else if mode==='preview'}
  <div class="preview-tools"><div class="currency-picker"><Control field="workflow-preview-currency" kind="select" label={t('通貨','Currency')} bind:value={previewCurrency} options={['JPY','USD','EUR','GBP','CNY','KRW','KWD'].map(c=>({value:c,label:c}))}/></div><div class="preview-width" role="group" aria-label={t('プレビュー幅','Preview width')}><ActionButton type="button" aria-pressed={!previewMobile} onclick={()=>previewMobile=false} class={['',(!previewMobile?"primary":'')]} variant={(!previewMobile?'primary':'secondary')} data-button-scope="button-79bb5e7bf8">{t('PC幅','Desktop width')}</ActionButton><ActionButton type="button" aria-pressed={previewMobile} onclick={()=>previewMobile=true} class={['',(previewMobile?"primary":'')]} variant={(previewMobile?'primary':'secondary')} data-button-scope="button-79bb5e7bf8">{t('スマートフォン幅','Mobile width')}</ActionButton></div><ActionButton type="button" onclick={()=>previewValues=defaults(draft.definition.fields)} variant="secondary" data-button-scope="button-79bb5e7bf8">{t('入力をリセット','Reset inputs')}</ActionButton></div>
  <div id="workflow-designer-mode-preview" role="tabpanel" aria-labelledby="workflow-designer-mode-preview-tab" class="preview" class:phone={previewMobile}><WorkflowFields fields={draft.definition.fields} bind:values={previewValues} context={previewResult.values} {ja} {directory} attachments={previewAttachments} upload={previewUpload} download={previewDownload}/></div>
 {:else}
  <nav class="mobile-panels" aria-label={t('編集領域','Editor panels')}>{#each [['parts',t('部品・構造','Components')],['canvas',t('フォーム','Form')],['properties',t('プロパティ','Properties')]] as panel}<ActionButton type="button" aria-pressed={mobilePanel===panel[0]} onclick={()=>mobilePanel=panel[0]} variant="secondary" data-button-scope="button-79bb5e7bf8">{panel[1]}</ActionButton>{/each}</nav>
  <div id="workflow-designer-mode-design" role="tabpanel" aria-labelledby="workflow-designer-mode-design-tab" class="editor-grid" class:resizing-columns={columnResize!==null} bind:clientWidth={editorWidth} style:--parts-width={columns.parts+'px'} style:--properties-width={columns.properties+'px'}>
   <aside id="workflow-parts-panel" class="parts" class:mobile-active={mobilePanel==='parts'}><div class="library-tabs"><PageTabs embedded idPrefix="workflow-library" label={t('部品と構造','Components and outline')} bind:active={libraryPanel} tabs={[{id:'parts',label:t('部品','Components')},{id:'outline',label:t('構造','Outline')}]}/></div><div id="workflow-library-parts" class="library-panel" role="tabpanel" aria-labelledby="workflow-library-parts-tab" hidden={libraryPanel!=='parts'}><Control field="workflow-part-search" label={t('部品を検索','Find component')} placeholder={t('部品を検索…','Find a component…')} bind:value={search}/><Control field="workflow-destination" label={t('追加・移動先','Destination')} kind="select" bind:value={target} options={[{value:'',label:t('フォーム直下','Form root')},...all.filter(isContainer).map(f=>({value:f.id,label:paths.get(f.id)??f.label}))]}/><div class="parts-list">{#each fieldTypes.filter(type=>partNames[type][ja?0:1].toLowerCase().includes(search.toLowerCase())) as type}<ControlButton type="button" disabled={busy||!availableParts[type]} draggable={!busy&&!!availableParts[type]} ondragstart={e=>dragPart(e,type)} ondragend={()=>{dragging='';outside=false;}} onclick={()=>add(type)} data-button-scope="button-79bb5e7bf8">＋ {partNames[type][ja?0:1]}</ControlButton>{/each}</div></div><div id="workflow-library-outline" class="library-panel" role="tabpanel" aria-labelledby="workflow-library-outline-tab" hidden={libraryPanel!=='outline'}>{@render tree(draft.definition.fields,0)}</div></aside>
   {@render columnHandle('parts')}
   <main ondragover={e=>e.preventDefault()} ondrop={canvasDrop} class="canvas" class:mobile-active={mobilePanel==='canvas'}><div class="canvas-header"><div class="canvas-title"><h3>{t('フォーム構成','Form layout')}</h3><InfoPopover label={t('配置とサイズ変更の説明','Placement and resizing help')}><p>{t('空きセルへ配置し、カードの上下左右の枠線をドラッグしてサイズを変更できます。','Drop into empty cells. Drag any card edge to resize it.')}</p></InfoPopover></div><div class="canvas-toolbar" role="toolbar" aria-label={t('フォーム編集操作','Form editing actions')}><ActionButton type="button" onclick={()=>restore(true)} disabled={!undo.length||busy} variant="secondary" data-button-scope="button-79bb5e7bf8">{t('元に戻す','Undo')}</ActionButton><ActionButton type="button" onclick={()=>restore(false)} disabled={!redo.length||busy} variant="secondary" data-button-scope="button-79bb5e7bf8">{t('やり直す','Redo')}</ActionButton><ActionButton type="button" class="primary" disabled={busy||!draft.name.trim()||issues.length>0||!!draft.templateKey&&!formDirty} onclick={()=>save('form')} variant="primary" data-button-scope="button-79bb5e7bf8">{t('保存','Save')}</ActionButton></div></div>{#if !all.length}<div class="empty">{t('左の部品一覧から項目を追加してください。','Add fields from the component library.')}</div>{/if}{@render canvas(draft.definition.fields,0)}</main>
   {@render columnHandle('properties')}
   <aside id="workflow-properties-panel" class="properties" class:mobile-active={mobilePanel==='properties'}><h3>{t('プロパティ','Properties')}</h3>
    {#if selected}
     <p class="part-type">{partNames[selected.type][ja?0:1]}</p>
     <Control field="workflow-field-label" label={t('ラベル','Label')} required value={selected.label} onValueChange={v=>edit('label',v)}/>
     <Control field="workflow-field-help" label={t('説明','Help text')} kind="textarea" value={selected.help??''} onValueChange={v=>edit('help',v)}/>
     {#if !isContainer(selected)&&!isDisplay(selected)}
      <FormCheckbox field="workflow-field-required" label={t('必須入力','Required')} checked={selected.required??false} onChange={v=>edit('required',v)}/>
      <Control field="workflow-field-placeholder" label={t('入力例','Placeholder')} value={selected.placeholder??''} onValueChange={v=>edit('placeholder',v)}/>
      {#if ['boolean','checkbox'].includes(selected.type)}<Control field="workflow-field-default" label={t('初期値','Default value')} kind="select" value={selected.defaultValue??''} options={[{value:'',label:t('指定なし','No default')},{value:'true',label:t('はい','Yes')},{value:'false',label:t('いいえ','No')}]} onValueChange={v=>edit('defaultValue',v)}/>
      {:else if ['employee','branch','department'].includes(selected.type)}<Control field="workflow-field-default" label={t('初期値','Default value')} kind="select" value={selected.defaultValue??''} options={[{value:'',label:t('指定なし','No default')},...(selected.type==='employee'?directory.employees:selected.type==='branch'?directory.branches:directory.departments).map(c=>({value:String(c.id),label:c.name}))]} onValueChange={v=>edit('defaultValue',v)}/>
      {:else if ['select','radio'].includes(selected.type)}<Control field="workflow-field-default" label={t('初期値','Default value')} kind="select" value={selected.defaultValue??''} options={[{value:'',label:t('指定なし','No default')},...(selected.options??[]).map(o=>({value:o,label:o}))]} onValueChange={v=>edit('defaultValue',v)}/>
      {:else if selected.type==='multiSelect'}<Control field="workflow-field-default" kind="textarea" label={t('初期値（1行に1件）','Defaults (one per line)')} value={selected.defaultValue??''} onValueChange={v=>edit('defaultValue',v)}/>
      {:else if !['attachment','image','calculated'].includes(selected.type)}<Control field="workflow-field-default" label={t('初期値','Default value')} value={selected.defaultValue??''} onValueChange={v=>edit('defaultValue',v)}/>{/if}
     {/if}
     {#if ['select','radio','multiSelect'].includes(selected.type)}<Control field="workflow-field-options" label={t('選択肢（1行に1件）','Options (one per line)')} kind="textarea" value={selected.options?.join('\n')??''} rows={5} onValueChange={v=>edit('options',v.split('\n').filter(Boolean))}/>{/if}
     {#if isRepeat(selected)}<Control field="workflow-field-min-rows" label={t('最小件数','Minimum items')} kind="number" min="0" max="100" value={String(selected.minRows??0)} onValueChange={v=>edit('minRows',Number(v))}/><Control field="workflow-field-max-rows" label={t('最大件数','Maximum items')} kind="number" min="1" max="100" value={String(selected.maxRows??100)} onValueChange={v=>edit('maxRows',Number(v))}/>
     {:else if !isDisplay(selected)&&!isContainer(selected)}<div class="limits"><Control field="workflow-field-min" label={t('最小値／文字数','Minimum value / length')} kind="number" value={selected.min===undefined?'':String(selected.min)} onValueChange={v=>edit('min',v===''?undefined:Number(v))}/><Control field="workflow-field-max" label={t('最大値／文字数／日数','Maximum value / length / days')} kind="number" value={selected.max===undefined?'':String(selected.max)} onValueChange={v=>edit('max',v===''?undefined:Number(v))}/></div>{/if}
     <WorkflowRules bind:value={selected.visibleWhen} beforeChange={snapshot} fields={references.filter(f=>f.id!==selectedId&&!isContainer(f)&&!isDisplay(f))} {ja} label={t('表示する条件','Visibility conditions')}/>
     {#if !isDisplay(selected)&&!isContainer(selected)}<WorkflowRules bind:value={selected.requiredWhen} beforeChange={snapshot} fields={references.filter(f=>f.id!==selectedId&&!isContainer(f)&&!isDisplay(f))} {ja} label={t('必須にする条件','Required conditions')}/>{/if}
     {#if selected.type==='calculated'&&selected.calculation}
      <fieldset class="calculation"><legend>{t('計算','Calculation')}</legend>
       <Control field="workflow-calculation-op" label={t('計算方法','Operation')} kind="select" value={selected.calculation.op} options={['sum','count','add','subtract','multiply','divide','days'].map((value,i)=>({value,label:[['合計','Sum'],['件数','Count'],['加算','Add'],['減算','Subtract'],['乗算','Multiply'],['除算','Divide'],['期間の日数','Days in period']][i][ja?0:1]}))} onValueChange={v=>edit('calculation',{...selected!.calculation,op:v})}/>
       <Control field="workflow-calculation-add-ref" reset label={t('参照項目を追加','Add reference')} kind="select" value="" options={references.filter(f=>f.id!==selectedId&&!isContainer(f)&&!isDisplay(f)&&!selected?.calculation?.refs.includes(f.id)).map(f=>({value:f.id,label:f.label}))} onValueChange={v=>edit('calculation',{...selected!.calculation,refs:[...selected!.calculation!.refs,v]})}/>
       <ol class="calculation-refs">{#each selected.calculation.refs as ref,i}<li><span>{paths.get(ref)??ref}</span><ActionButton type="button" aria-label={t('参照を上へ','Move reference up')} disabled={i===0} onclick={()=>{const refs=[...selected!.calculation!.refs];[refs[i-1],refs[i]]=[refs[i],refs[i-1]];edit('calculation',{...selected!.calculation,refs});}} variant="secondary" data-button-scope="button-79bb5e7bf8">↑</ActionButton><ActionButton type="button" aria-label={t('参照を削除','Remove reference')} onclick={()=>edit('calculation',{...selected!.calculation,refs:selected!.calculation!.refs.filter((_,n)=>n!==i)})} variant="secondary" data-button-scope="button-79bb5e7bf8">×</ActionButton></li>{/each}</ol>
       <Control field="workflow-calculation-decimals" label={t('小数桁','Decimal places')} kind="number" min="0" max="6" value={String(selected.calculation.decimals??2)} onValueChange={v=>edit('calculation',{...selected!.calculation,decimals:Number(v)})}/>
      </fieldset>
     {/if}
     <div class="toolbar"><ActionButton type="button" disabled={busy||!upward} aria-label={t('上へ移動','Move up')} onclick={()=>move(-1)} variant="secondary" data-button-scope="button-79bb5e7bf8">↑</ActionButton><ActionButton type="button" disabled={busy||!downward} aria-label={t('下へ移動','Move down')} onclick={()=>move(1)} variant="secondary" data-button-scope="button-79bb5e7bf8">↓</ActionButton><ActionButton type="button" disabled={busy||!canDuplicate} onclick={duplicate} variant="secondary" data-button-scope="button-79bb5e7bf8">{t('複製','Duplicate')}</ActionButton><ActionButton type="button" disabled={busy||!canMoveTo} onclick={moveTo} variant="secondary" data-button-scope="button-79bb5e7bf8">{t('選択先へ移動','Move to destination')}</ActionButton><ActionButton type="button" disabled={busy||!canGroup} onclick={group} variant="secondary" data-button-scope="button-79bb5e7bf8">{t('選択項目をグループ化','Group selected fields')}</ActionButton>{#if selected.type==='group'||selected.type==='page'}<ActionButton type="button" disabled={busy||!canUngroup} onclick={ungroup} variant="secondary" data-button-scope="button-79bb5e7bf8">{t('グループを解除','Ungroup')}</ActionButton>{/if}<ActionButton type="button" class="danger" disabled={busy} onclick={remove} variant="danger" data-button-scope="button-79bb5e7bf8">{t('削除','Delete')}</ActionButton></div>
    {:else}<p>{t('中央または構造一覧で項目を選択してください。','Select a field in the canvas or outline.')}</p>{/if}
   </aside>
  </div>
 {/if}
 <footer>{#if issues.length}<p class="error">{t('公開前に設定を確認してください：','Check these settings: ')}{issues.map(i=>workflowError(i,ja)).join(' / ')}</p>{/if}<span>{all.length} {t('部品','components')} · {dirty?t('未保存の変更あり','Unsaved changes'):t('保存済み','Saved')}</span></footer>
</section>
{#if dragging}<div class="drag-status" class:outside role="status">{dragging.startsWith('part:')?t('フォーム内にドロップして追加','Drop inside the form to add'):outside?t('ここにドロップして削除（元に戻せます）','Drop here to delete (you can undo)'):t('フォーム内で移動・フォーム領域外で削除','Drop inside to move, outside the form to delete')} · {t('Escで中止','Esc to cancel')}</div>{/if}
{#if previewFile}<dialog open class="workflow-ui preview-image" aria-label={previewFile.name}><ActionButton type="button" onclick={()=>previewFile=null} variant="secondary" data-button-scope="button-79bb5e7bf8">{t('閉じる','Close')}</ActionButton><img src={previewUrls.get(previewFile.attachmentKey)} alt={previewFile.name}/></dialog>{/if}
{#snippet columnHandle(side:ColumnSide)}
 <!-- Focusable separators are interactive window splitters with arrow-key resizing. -->
 <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
 <div class="column-resizer" data-column-resizer={side} role="separator" tabindex="0" aria-orientation="vertical" aria-controls={side==='parts'?'workflow-parts-panel':'workflow-properties-panel'} aria-label={side==='parts'?t('部品カラムの幅','Component library column width'):t('プロパティカラムの幅','Properties column width')} aria-valuemin={Math.round(columnMin(side))} aria-valuemax={Math.round(columnMax(side))} aria-valuenow={Math.round(columns[side])} title={t('ドラッグまたは左右キーで幅を変更。ダブルクリックで元の幅に戻します。','Drag or use arrow keys to resize. Double-click to reset widths.')} onpointerdown={e=>startColumnResize(e,side)} onpointermove={moveColumnResize} onpointerup={()=>finishColumnResize()} onpointercancel={()=>finishColumnResize(true)} onlostpointercapture={()=>finishColumnResize()} onkeydown={e=>columnKeydown(e,side)} ondblclick={()=>{partsWidth=undefined;propertiesWidth=undefined;}}></div>
{/snippet}
{#snippet tree(fields:Field[],depth:number)}
 {#each fields as f(f.id)}
  <div class="outline-row" data-outline-field={f.id} style:padding-left={'min('+(depth*12)+'px, 25%)'}>
   <input type="checkbox" aria-label={t('グループ化する項目：','Group field: ')+(paths.get(f.id)??f.label)} checked={grouping.includes(f.id)} indeterminate={partiallyChecked(f)} onchange={e=>checkOutline(f,e.currentTarget.checked)}/>
   {#if isContainer(f)}<ControlButton type="button" class="outline-toggle" disabled={!f.children?.length} aria-label={(collapsedGroups.includes(f.id)?t('展開：','Expand: '):t('折り畳む：','Collapse: '))+f.label} aria-expanded={!collapsedGroups.includes(f.id)} aria-controls={'workflow-outline-'+f.id} onclick={()=>collapsedGroups=collapsedGroups.includes(f.id)?collapsedGroups.filter(id=>id!==f.id):[...collapsedGroups,f.id]} data-button-scope="button-79bb5e7bf8">{collapsedGroups.includes(f.id)?'▸':'▾'}</ControlButton>{:else}<span class="outline-toggle-space" aria-hidden="true"></span>{/if}
   <ControlButton type="button" draggable="true" ondragstart={e=>drag(e,f.id)} ondragend={()=>{dragging='';outside=false;}} onclick={()=>{selectedId=f.id;mobilePanel='properties';}} class={[`outline-item`,(f.id===selectedId&&highlightSelection?"chosen":'')]} data-button-scope="button-79bb5e7bf8">{f.label}{#if f.required}<span class="required"> *</span>{/if}</ControlButton>
  </div>
  {#if isContainer(f)}<div id={'workflow-outline-'+f.id} hidden={collapsedGroups.includes(f.id)}>{@render tree(f.children??[],depth+1)}</div>{/if}
 {/each}
{/snippet}
{#snippet canvas(fields:Field[],depth:number,parent='')}
 <div class="grid-wrap"><div class="design-grid" data-grid-parent={parent}>
  {#each Array(gridRows(fields)*FORM_GRID_COLUMNS) as _,cell}
   {@const column=cell%FORM_GRID_COLUMNS+1}{@const row=Math.floor(cell/FORM_GRID_COLUMNS)+1}
   <ControlButton type="button" class="grid-cell" data-grid-column={column} data-grid-row={row} style={gridStyle({column,row,width:1,height:1})} aria-label={t('配置：行 ','Place: row ')+row+t(' 列 ',' column ')+column} ondragover={e=>{e.preventDefault();e.stopPropagation();}} ondrop={e=>dropCell(e,parent,column,row)} onclick={()=>{selectedId='';}} data-button-scope="button-79bb5e7bf8"><span>＋</span></ControlButton>
  {/each}
  {#each fieldGrid(fields) as item(item.field.id)}
   {@const f=item.field}
   <!-- The heading button provides keyboard selection; the card also accepts interior clicks. -->
   <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
   <section role="group" aria-label={f.label} data-design-field={f.id} data-design-parent={parent} data-grid-width={item.grid.width} data-grid-height={item.grid.height} style={gridStyle(item.grid)} class="design-field" class:chosen={f.id===selectedId&&highlightSelection} class:container={isContainer(f)} draggable={!busy} ondragstart={e=>{const target=e.target as HTMLElement;if(target.closest('[data-design-field]')!==e.currentTarget)return;if(target.closest('.resize-edge')){e.preventDefault();e.stopPropagation();return;}drag(e,f.id);}} ondragend={e=>{e.stopPropagation();dragging='';outside=false;}} onclick={e=>{const clicked=e.target as HTMLElement;if(clicked.closest('[data-design-field]')===e.currentTarget&&!clicked.closest('.grid-cell,.resize-edge')){selectedId=f.id;mobilePanel='properties';}}} ondragover={e=>{e.preventDefault();e.stopPropagation();}} ondrop={e=>{e.preventDefault();e.stopPropagation();dragging='';outside=false;error=t('項目のない空きグリッドへドロップしてください。','Drop onto empty grid cells.');}}>
    <ControlButton type="button" class="field-heading" draggable="true" ondragstart={e=>drag(e,f.id)} ondragend={()=>{dragging='';outside=false;}} onclick={()=>{selectedId=f.id;mobilePanel='properties';}} data-button-scope="button-79bb5e7bf8"><span>{f.label}{#if f.required}<span class="required"> *</span>{/if}</span><small>{partNames[f.type][ja?0:1]}{f.visibleWhen?' · '+t('条件あり','Conditional'):''}</small></ControlButton>
    {#if isContainer(f)}{@render canvas(f.children??[],depth+1,f.id)}{:else if !isDisplay(f)}<div class="field-placeholder">{f.placeholder||t('入力内容','Input')}</div>{/if}
    {#each ['left','right','top','bottom'] as side}
     <ControlButton type="button" class="resize-edge" data-edge={side} aria-label={t('枠のサイズを変更：','Resize edge: ')+({left:t('左','Left'),right:t('右','Right'),top:t('上','Top'),bottom:t('下','Bottom')}[side])+ ' / '+f.label} title={t('枠線をドラッグしてサイズを変更（矢印キーでも操作可能）','Drag the edge to resize (or use arrow keys)')} onpointerdown={e=>startResize(e,f.id,side as GridEdge)} onpointermove={resizeMove} onpointerup={()=>finishResize()} onpointercancel={()=>finishResize(true)} onlostpointercapture={()=>finishResize()} onkeydown={e=>keyboardResize(e,f.id,side as GridEdge)} data-button-scope="button-79bb5e7bf8"><span aria-hidden="true">{side==='left'||side==='right'?'⋮':'⋯'}</span></ControlButton>
    {/each}
   </section>
  {/each}
 </div></div>
{/snippet}
{#if removePending}<section class="workflow-ui delete-warning" role="alert"><p>{t('この項目は次の設定から参照されています。削除すると条件・計算の参照も外れます。計算式は再設定してください。','These fields reference this component. Deleting it also removes those references. Reconfigure any affected calculations.')}</p><ul>{#each dependants as f}<li>{paths.get(f.id)??f.label}</li>{/each}</ul><ActionButton type="button" class="danger" onclick={()=>removeSelected(removeTarget)} variant="danger" data-button-scope="button-79bb5e7bf8">{t('参照を外して削除','Remove references and delete')}</ActionButton><ActionButton type="button" onclick={()=>removePending=false} variant="secondary" data-button-scope="button-79bb5e7bf8">{t('キャンセル','Cancel')}</ActionButton></section>{/if}
{#if discard}<DiscardChangesDialog onContinue={()=>{discard=false;pendingUrl='';closeAction=null;}} onDiscard={()=>{discardApproved=true;discard=false;if(pendingUrl){const url=pendingUrl;pendingUrl='';void goto(url);}else{const action=closeAction??onclose;closeAction=null;action();}}}/>{/if}
<style>
 .drag-status{position:fixed;right:16px;bottom:16px;z-index:1500;max-width:min(32rem,calc(100vw - 32px));padding:12px 16px;background:var(--surface);color:var(--text);border:2px solid var(--action-primary);border-radius:6px;box-shadow:var(--shadow);pointer-events:none}.drag-status.outside{border-color:var(--danger);color:var(--danger)}.parts-list :global(button[data-button-scope="button-79bb5e7bf8"]),:global(.field-heading[data-button-scope="button-79bb5e7bf8"]),:global(.outline-item[data-button-scope="button-79bb5e7bf8"]){cursor:grab} .designer{background:var(--surface);border:1px solid var(--border);border-radius:6px;overflow:hidden;box-shadow:var(--shadow)}h3,p{margin:0 0 10px}p,small,footer{color:var(--muted);font-size:var(--font-size-support)}.basics{display:flex;flex-wrap:wrap;align-items:start;gap:16px;padding:16px}.basics>div{min-width:0;flex:0 1 100%}.template-name{max-width:16rem}.template-description{max-width:22rem}.modes{border-bottom:1px solid var(--border)}.editor-grid{display:grid;grid-template-columns:220px minmax(260px,1fr) 290px;min-height:520px}.parts,.properties{display:flex;flex-direction:column;gap:12px;padding:16px;min-width:0;background:var(--surface-secondary);overflow-wrap:anywhere}.parts{border-right:1px solid var(--border)}.properties{border-left:1px solid var(--border)}.canvas{padding:16px;min-width:0;overflow-x:auto}.canvas>.grid-wrap{min-width:440px}.parts-list{display:grid;gap:6px;margin:0 0 12px}.parts-list :global(button[data-button-scope="button-79bb5e7bf8"]){justify-content:flex-start}.outline-row{display:flex;align-items:center;gap:6px}.outline-row input{flex:none;width:18px;height:18px;accent-color:var(--primary)}:global(.outline-item[data-button-scope="button-79bb5e7bf8"]){display:block;min-width:0;width:100%;text-align:left;border:0;background:transparent;margin:0;padding:6px;overflow-wrap:anywhere}:global(.chosen[data-button-scope="button-79bb5e7bf8"]){outline:2px solid var(--action-primary);outline-offset:-2px}.design-field{border:1px solid var(--border);border-radius:6px;padding:12px;margin-bottom:8px}.design-field.container{background:var(--surface-secondary)}:global(.field-heading[data-button-scope="button-79bb5e7bf8"]){display:flex;flex-wrap:wrap;justify-content:space-between;gap:6px;width:100%;text-align:left;background:transparent;border:0;margin:0;padding:0 0 10px}.field-placeholder{min-height:36px;background:var(--surface);border:1px solid var(--border);border-radius:4px;color:var(--muted);padding:6px 12px;font-size:var(--font-size-support)}.empty{width:100%;padding:16px;border:1px dashed var(--border);background:transparent;color:var(--muted)}.route{padding:16px}.route li,.calculation-refs li{display:flex;gap:8px;align-items:center;margin:10px 0}.route li span,.calculation-refs span{flex:1;min-width:0;overflow-wrap:anywhere}.approver-picker{max-width:24rem}.preview-tools{display:flex;align-items:end;flex-wrap:wrap;gap:8px;padding:16px}.preview-width{display:flex;flex-wrap:wrap;gap:8px}.currency-picker{width:9rem}.preview{max-width:1000px;margin:auto;padding:16px}.preview.phone{max-width:393px}.mobile-panels{display:none}footer{padding:12px 16px;border-top:1px solid var(--border)}fieldset{display:grid;gap:12px;border:1px solid var(--border);border-radius:6px;padding:12px;margin:0}.delete-warning{padding:16px;border:1px solid var(--danger);background:var(--surface);border-radius:6px;margin:12px 0}.delete-warning :global(button[data-button-scope="button-79bb5e7bf8"]){margin-right:8px}.preview-image{position:fixed;inset:10vh 5vw;z-index:1500;max-width:90vw;max-height:80vh;overflow:auto;background:var(--surface);color:var(--text);border:1px solid var(--border);border-radius:6px}.preview-image img{display:block;max-width:100%;height:auto}.error{color:var(--danger)}@media(max-width:1100px){.editor-grid{grid-template-columns:180px minmax(220px,1fr) 240px}.canvas,.parts,.properties{padding:12px}}@media(max-width:850px){.editor-grid{display:block}.parts,.properties,.canvas{display:none;border:0}.mobile-active{display:flex!important}.canvas.mobile-active{display:block!important}.mobile-panels{display:flex;flex-wrap:wrap;gap:6px;padding:12px}.basics>div{max-width:100%}.preview{padding:16px}}
 .grid-wrap{container-type:inline-size;min-width:0}.design-grid{display:grid;grid-template-columns:repeat(8,minmax(0,1fr));grid-auto-rows:calc((100cqw - 56px)/8);gap:8px;position:relative;isolation:isolate}.design-grid>:global(.grid-cell[data-button-scope="button-79bb5e7bf8"]){min-width:0;width:100%;height:100%;min-height:0;padding:0;border:1px dashed var(--border);border-radius:4px;background:var(--surface-secondary);box-shadow:none;color:var(--muted)}:global(.grid-cell[data-button-scope="button-79bb5e7bf8"] span){opacity:.35}:global(.grid-cell:hover[data-button-scope="button-79bb5e7bf8"]),:global(.grid-cell:focus-visible[data-button-scope="button-79bb5e7bf8"]){border-color:var(--action-primary);background:var(--surface-hover)}.design-grid>.design-field{position:relative;z-index:1;min-width:0;min-height:0;margin:0;padding:6px 10px;overflow:auto;background:var(--surface);border-radius:4px}.design-field.container{background:var(--surface-secondary)}:global(.field-heading[data-button-scope="button-79bb5e7bf8"]){display:flex;flex-direction:column;align-items:flex-start;gap:4px;overflow-wrap:anywhere}:global(.field-heading[data-button-scope="button-79bb5e7bf8"] small){display:none}:global(.field-heading[data-button-scope="button-79bb5e7bf8"]){padding-bottom:4px;gap:0}.field-placeholder{font-size:var(--font-size-support);padding:4px;overflow:hidden;min-height:24px}.design-field>:global(.resize-edge[data-button-scope="button-79bb5e7bf8"]){position:absolute;min-height:0;padding:0;margin:0;border:0;border-radius:0;background:transparent;box-shadow:none;touch-action:none;z-index:2}:global(.resize-edge[data-edge=left][data-button-scope="button-79bb5e7bf8"]),:global(.resize-edge[data-edge=right][data-button-scope="button-79bb5e7bf8"]){top:10px;bottom:10px;width:10px;height:calc(100% - 20px);cursor:ew-resize}:global(.resize-edge[data-edge=left][data-button-scope="button-79bb5e7bf8"]){left:0}:global(.resize-edge[data-edge=right][data-button-scope="button-79bb5e7bf8"]){right:0}:global(.resize-edge[data-edge=top][data-button-scope="button-79bb5e7bf8"]),:global(.resize-edge[data-edge=bottom][data-button-scope="button-79bb5e7bf8"]){left:10px;right:10px;height:10px;width:calc(100% - 20px);cursor:ns-resize}:global(.resize-edge[data-edge=top][data-button-scope="button-79bb5e7bf8"]){top:0}:global(.resize-edge[data-edge=bottom][data-button-scope="button-79bb5e7bf8"]){bottom:0}:global(.resize-edge:hover[data-button-scope="button-79bb5e7bf8"]),:global(.resize-edge:focus-visible[data-button-scope="button-79bb5e7bf8"]){background:var(--action-primary-background);color:var(--action-primary-text)}
 .editor-grid{height:auto;min-height:0;grid-template-columns:minmax(0,var(--parts-width)) 8px minmax(220px,1fr) 8px minmax(0,var(--properties-width))}
 .editor-grid.resizing-columns{user-select:none}
 .basics>.template-description{flex:1 1 240px;min-width:min(240px,100%);max-width:none}
 .canvas-header{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:10px}
 .canvas-header h3{margin:0}
 .canvas-title{display:flex;align-items:center;gap:6px;min-width:0}

 .route-toolbar{display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:16px}
 .canvas-toolbar{display:flex;align-items:center;flex-wrap:wrap;gap:8px;min-width:0;max-width:100%}
 .canvas-toolbar>:global(button[data-button-scope="button-79bb5e7bf8"]){min-width:0;max-width:100%;height:auto;min-height:36px;padding:6px 12px;white-space:normal;overflow-wrap:anywhere}
 .column-resizer{position:relative;min-width:0;touch-action:none;cursor:col-resize;background:var(--surface-secondary)}
 .column-resizer::after{content:'';position:absolute;left:2px;right:2px;top:20px;height:32px;border-radius:2px;background:var(--border)}
 .column-resizer:hover,.column-resizer:focus-visible{background:var(--action-primary-background);outline:2px solid var(--action-primary);outline-offset:-2px}
 .parts>*,.properties>*{min-width:0;max-width:100%}
 .library-panel{display:flex;flex-direction:column;gap:12px;width:100%;min-width:0}
 .library-panel[hidden]{display:none}
 .outline-row{gap:4px}
 .outline-row :global(.outline-toggle[data-button-scope="button-79bb5e7bf8"]){flex:0 0 24px;width:24px;height:28px;min-height:28px;padding:0;border:0;background:transparent;box-shadow:none}
 .outline-toggle-space{flex:0 0 24px}
 .library-tabs{--page-tabs-min-height:32px;--page-tabs-padding:4px 8px;width:100%;min-width:0}
 .library-tabs :global(.page-tabs){padding:0;gap:4px;flex-wrap:wrap;overflow:visible}
 .library-tabs :global(.page-tabs button){min-width:0;max-width:100%;flex:1 1 auto;white-space:normal;overflow-wrap:anywhere;line-height:1.4}
 .parts .parts-list :global(button[data-button-scope="button-79bb5e7bf8"]),.properties .toolbar>:global(button[data-button-scope="button-79bb5e7bf8"]){width:100%;max-width:100%;height:auto;min-height:36px;white-space:normal;overflow-wrap:anywhere;padding:8px 12px}
 .properties .toolbar>:global(button[data-button-scope="button-79bb5e7bf8"]){flex:1 1 7rem;min-width:0}
 .properties .limits{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,10rem),1fr));gap:12px}
 .parts :global(.form-input-field),.parts :global(.form-select-field),.properties :global(.form-input-field),.properties :global(.form-select-field),.properties :global(.form-textarea-field){width:100%;max-width:100%;min-width:0}
 .properties :global(fieldset){width:100%;min-width:0;max-width:100%;box-sizing:border-box;grid-template-columns:minmax(0,1fr)}
 .properties :global(.rule){min-width:0;grid-template-columns:minmax(0,1fr)}
 .calculation-refs{min-width:0;padding-left:20px}
 .calculation-refs li{flex-wrap:wrap}
 .calculation-refs span{flex-basis:100%}
 .properties :global(fieldset>button),.properties :global(.rule>button){width:100%;max-width:100%;height:auto;min-height:36px;white-space:normal;overflow-wrap:anywhere}
 .parts,.properties,.canvas{overflow:visible}
 .canvas>.grid-wrap{min-width:0;overflow-x:auto}
 .canvas>.grid-wrap>.design-grid{min-width:440px}
 .design-grid{grid-auto-rows:36px}
 .design-grid>.design-field{padding:4px 10px;cursor:grab}
 .design-grid>.design-field:not(.container){overflow-y:hidden}
 :global(.field-heading[data-button-scope="button-79bb5e7bf8"]){display:block;height:22px;min-height:0;padding:0;line-height:22px;overflow:hidden}
 :global(.field-heading[data-button-scope="button-79bb5e7bf8"]>span){display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
 .field-placeholder{display:none}
 .design-grid>.design-field{border:3px solid var(--border)}
 .design-grid>.design-field.chosen{border-color:var(--action-primary);outline:none}
 @media(max-width:850px){
  .column-resizer{display:none}
  .parts .parts-list :global(button[data-button-scope="button-79bb5e7bf8"]),.properties .toolbar>:global(button[data-button-scope="button-79bb5e7bf8"]),.properties :global(fieldset>button),.properties :global(.rule>button){min-height:44px}
  .canvas-toolbar>:global(button[data-button-scope="button-79bb5e7bf8"]){min-height:44px}
  .editor-grid{height:auto}
  .parts.mobile-active,.properties.mobile-active,.canvas.mobile-active{max-height:none;overflow:visible}
 }
</style>
