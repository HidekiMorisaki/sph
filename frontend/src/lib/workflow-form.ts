/** Workflow form contract. Keep both product copies identical (verified by regression). */
export const fieldTypes = ['text','textarea','integer','decimal','money','percent','date','dateRange','time','timeRange','datetime','datetimeRange','select','radio','multiSelect','checkbox','boolean','email','phone','url','employee','branch','department','applicant','attachment','image','calculated','heading','description','divider','group','repeat','table','page'] as const;
export type FieldType=typeof fieldTypes[number];
export type Condition={mode:'all'|'any';rules:{field:string;op:'eq'|'ne'|'empty'|'filled'|'gt'|'lt'|'contains';value?:string}[]};
export type Calculation={op:'add'|'subtract'|'multiply'|'divide'|'sum'|'count'|'days';refs:string[];decimals?:number};
export type FieldGrid={scale?:2;column:number;row:number;width:number;height:number};
export const FORM_GRID_COLUMNS=8;
export const FORM_GRID_ROWS=2400;
export type Field={id:string;type:FieldType;label:string;help?:string;required?:boolean;placeholder?:string;defaultValue?:string;min?:number;max?:number;options?:string[];children?:Field[];visibleWhen?:Condition;requiredWhen?:Condition;calculation?:Calculation;columns?:1|2;grid?:FieldGrid;minRows?:number;maxRows?:number};
export type Definition={version:1;fields:Field[]};
export type Values=Record<string,unknown>;
export type Choice={id:number;name:string};
export type Directory={employees:Choice[];branches:Choice[];departments:Choice[]};
export type WorkflowRoute={employeeId:number;name:string}[];
export const isContainer=(f:Field)=>['group','repeat','table','page'].includes(f.type);
export const isDisplay=(f:Field)=>['heading','description','divider','applicant'].includes(f.type);
export const isRepeat=(f:Field)=>f.type==='repeat'||f.type==='table';
export function fieldsOf(fields:Field[]):Field[]{return fields.flatMap(f=>[f,...fieldsOf(f.children??[])]);}
export function fieldPaths(fields:Field[],parent=''):Map<string,string>{
 const result=new Map<string,string>();
 for(const f of fields){const label=parent?parent+' / '+f.label:f.label;result.set(f.id,label);for(const [id,path] of fieldPaths(f.children??[],label))result.set(id,path);}
 return result;
}
export const validFieldGrid=(g:FieldGrid)=>!!g&&typeof g==='object'&&(g.scale===undefined||g.scale===2)&&[g.column,g.row,g.width,g.height].every(Number.isInteger)&&g.column>=1&&g.width>=1&&g.column+g.width-1<=(g.scale===2?8:4)&&g.row>=1&&g.height>=1&&g.height<=(g.scale===2?120:60)&&g.row+g.height-1<=(g.scale===2?2400:1200);
/** Legacy four-column coordinates keep their physical position in the finer grid. */
export const fineFieldGrid=(g:FieldGrid):FieldGrid=>g.scale===2?{...g}:{scale:2,column:g.column*2-1,row:g.row*2-1,width:g.width*2,height:g.height*2};
export type GridEdge='left'|'right'|'top'|'bottom';
export function resizeFieldGrid(g:FieldGrid,edge:GridEdge,delta:number):FieldGrid{
 const next={...g};
 if(edge==='left'){const d=Math.max(1-g.column,Math.min(g.width-1,delta));next.column+=d;next.width-=d;}
 if(edge==='right')next.width=Math.max(1,Math.min(FORM_GRID_COLUMNS-g.column+1,g.width+delta));
 if(edge==='top'){const d=Math.max(1-g.row,Math.min(g.height-1,delta));next.row+=d;next.height-=d;}
 if(edge==='bottom')next.height=Math.max(1,Math.min(120,FORM_GRID_ROWS-g.row+1,g.height+delta));
 return next;
}
export const gridsOverlap=(a:FieldGrid,b:FieldGrid)=>a.column<b.column+b.width&&b.column<a.column+a.width&&a.row<b.row+b.height&&b.row<a.row+a.height;
/** Reserve saved cells first; legacy/new fields use the first free rectangle. */
export function fieldGrid(fields:Field[]):{field:Field;grid:FieldGrid}[]{
 const positions=new Map<string,FieldGrid>();
 const fits=(g:FieldGrid)=>validFieldGrid(g)&&![...positions.values()].some(other=>gridsOverlap(g,other));
 for(const field of fields)if(field.grid&&validFieldGrid(field.grid)&&fits(fineFieldGrid(field.grid)))positions.set(field.id,fineFieldGrid(field.grid));
 for(const field of fields){if(positions.has(field.id))continue;
  const width=isContainer(field)?8:field.type==='textarea'?4:2,height=isContainer(field)?6:1;
  let found=false;
  for(let row=1;row<=FORM_GRID_ROWS-height+1&&!found;row++)for(let column=1;column<=FORM_GRID_COLUMNS-width+1;column++){
   const grid:FieldGrid={scale:2,column,row,width,height};if(fits(grid)){positions.set(field.id,grid);found=true;break;}
  }
  if(!found)throw Error('FORM_GRID_FULL');
 }
 return fields.map(field=>({field,grid:positions.get(field.id)!}));
}
export function canPlaceField(fields:Field[],id:string,grid:FieldGrid){return validFieldGrid(grid)&&fieldGrid(fields).every(item=>item.field.id===id||!gridsOverlap(item.grid,fineFieldGrid(grid)));}
export function materializeFieldGrid(fields:Field[]){for(const item of fieldGrid(fields)){item.field.grid=item.grid;if(item.field.children)materializeFieldGrid(item.field.children);}}
export function cloneField(field:Field):Field {
 const copy:Field=JSON.parse(JSON.stringify(field)),mapping=new Map<string,string>();
 for(const f of fieldsOf([copy])){const old=f.id;f.id='f_'+crypto.randomUUID().replaceAll('-','');mapping.set(old,f.id);}
 for(const f of fieldsOf([copy])){
  for(const c of [f.visibleWhen,f.requiredWhen])for(const r of c?.rules??[])r.field=mapping.get(r.field)??r.field;
  if(f.calculation)f.calculation.refs=f.calculation.refs.map(r=>mapping.get(r)??r);
 }return copy;
}
export function definitionErrors(input:unknown):string[]{
 const errors:string[]=[];
 if(!input||typeof input!=='object')return ['INVALID_DEFINITION'];
 const d=input as Definition;
 if(d.version!==1||!Array.isArray(d.fields))return ['INVALID_DEFINITION'];
 const ids=new Set<string>(),all:Field[]=[],scopes=new Map<string,string>(),parents=new Map<string,string[]>();
 function walk(list:Field[],depth:number,repeated:string,ancestors:string[]=[]){
  if(depth>5||!Array.isArray(list)){errors.push('FORM_DEPTH');return;}
  const occupied:FieldGrid[]=[];
  for(const f of list){
   const grid=f?.grid;if(grid!==undefined){if(!validFieldGrid(grid)||occupied.some(g=>gridsOverlap(g,fineFieldGrid(grid))))errors.push('INVALID_FIELD');else occupied.push(fineFieldGrid(grid));}
   if(!f||typeof f!=='object'||!fieldTypes.includes(f.type)||typeof f.id!=='string'||!/^[a-zA-Z][a-zA-Z0-9_-]{0,79}$/.test(f.id)||ids.has(f.id)){errors.push('INVALID_FIELD');continue;}
   ids.add(f.id);all.push(f);scopes.set(f.id,repeated);parents.set(f.id,ancestors);
   if(typeof f.label!=='string'||!f.label.trim()||f.label.length>160||typeof f.help!=='undefined'&&(typeof f.help!=='string'||f.help.length>4000))errors.push('INVALID_LABEL');
   if(f.required!==undefined&&typeof f.required!=='boolean')errors.push('INVALID_REQUIRED');
   for(const key of ['min','max','minRows','maxRows'] as const)if(f[key]!==undefined&&(!Number.isFinite(f[key])||Math.abs(f[key]!)>1e12))errors.push('INVALID_LIMIT');
   if(f.min!==undefined&&f.max!==undefined&&f.min>f.max)errors.push('INVALID_LIMIT');
   if(['select','radio','multiSelect'].includes(f.type)&&(!Array.isArray(f.options)||!f.options.length||f.options.length>100||f.options.some(o=>typeof o!=='string'||!o.trim()||o.length>160)||new Set(f.options).size!==f.options.length))errors.push('INVALID_OPTIONS');
   if(f.placeholder!==undefined&&(typeof f.placeholder!=='string'||f.placeholder.length>500))errors.push('INVALID_PLACEHOLDER');
   if(f.defaultValue!==undefined&&(typeof f.defaultValue!=='string'||f.defaultValue.length>20000))errors.push('INVALID_VALUE');
   if(['checkbox','boolean'].includes(f.type)&&f.defaultValue!==undefined&&!['true','false',''].includes(f.defaultValue))errors.push('INVALID_VALUE');
   if(isContainer(f)){
    if(f.type==='page'&&depth!==0)errors.push('INVALID_CHILDREN');
    if(isRepeat(f)&&(repeated||!Number.isInteger(f.minRows??0)||!Number.isInteger(f.maxRows??100)||(f.minRows??0)<0||(f.maxRows??100)<1||(f.maxRows??100)>100||(f.minRows??0)>(f.maxRows??100)))errors.push('INVALID_REPEAT');
    walk(f.children??[],depth+1,isRepeat(f)?f.id:repeated,[...ancestors,f.id]);
   }else if(f.children?.length)errors.push('INVALID_CHILDREN');
  }
 }
 walk(d.fields,0,'');
 if(all.length>300)errors.push('TOO_MANY_FIELDS');
 const deps=new Map<string,string[]>();
 for(const f of all){
  const refs:string[]=[...(parents.get(f.id)??[])];
  const canReference=(ref:Field,aggregate=false)=>!isContainer(ref)&&!isDisplay(ref)&&(!scopes.get(ref.id)||scopes.get(ref.id)===scopes.get(f.id)||aggregate&&!scopes.get(f.id));
  for(const c of [f.visibleWhen,f.requiredWhen]){
   if(!c)continue;
   if(!['all','any'].includes(c.mode)||!Array.isArray(c.rules)||!c.rules.length||c.rules.length>20){errors.push('INVALID_CONDITION');continue;}
   for(const r of c.rules){
    const ref=r&&all.find(x=>x.id===r.field);
    if(!r||!['eq','ne','empty','filled','gt','lt','contains'].includes(r.op)||!ref||!canReference(ref)||r.value!==undefined&&(typeof r.value!=='string'||r.value.length>20000))errors.push('INVALID_REFERENCE');
    else {refs.push(r.field);if(['gt','lt'].includes(r.op)&&(!['integer','decimal','money','percent','calculated'].includes(ref.type)||!isDecimal(r.value)))errors.push('INVALID_CONDITION');}
   }
  }
  const c=f.calculation;
  if(f.type==='calculated'){
   if(!c||!['add','subtract','multiply','divide','sum','count','days'].includes(c.op)||!Array.isArray(c.refs)||!c.refs.length||c.refs.length>20||c.refs.some(r=>!ids.has(r))||!Number.isInteger(c.decimals??2)||(c.decimals??2)<0||(c.decimals??2)>6)errors.push('INVALID_CALCULATION');
   else {
    const targets=c.refs.map(id=>all.find(x=>x.id===id)!);
    if(new Set(c.refs).size!==c.refs.length||targets.some(ref=>!canReference(ref,['sum','count'].includes(c.op))))errors.push('INVALID_REFERENCE');
    if(c.op==='days'?(targets.length!==1||targets[0].type!=='dateRange'):c.op!=='count'&&targets.some(ref=>!['integer','decimal','money','percent','calculated'].includes(ref.type)))errors.push('INVALID_CALCULATION');
    if(['subtract','multiply','divide'].includes(c.op)&&targets.length<2)errors.push('INVALID_CALCULATION');
    refs.push(...c.refs);
   }
  }
  deps.set(f.id,refs);
 }
 const visiting=new Set<string>(),done=new Set<string>();
 function visit(id:string){if(visiting.has(id)){errors.push('CIRCULAR_REFERENCE');return;}if(done.has(id))return;visiting.add(id);for(const dep of deps.get(id)??[])visit(dep);visiting.delete(id);done.add(id);}
 for(const id of ids)visit(id);
 return [...new Set(errors)];
}
function isDecimal(value:unknown){try{decimal(value);return true;}catch{return false;}}
export function condition(c:Condition|undefined,values:Values):boolean {
 if(!c)return true;
 const results=c.rules.map(r=>{
  const v=values[r.field],s=String(v??''),target=r.value??'';
  switch(r.op){case'eq':return s===target;case'ne':return s!==target;case'empty':return v==null||s===''||Array.isArray(v)&&!v.length;case'filled':return !(v==null||s===''||Array.isArray(v)&&!v.length);case'gt':try{return decimal(s)>decimal(target);}catch{return false;}case'lt':try{return decimal(s)<decimal(target);}catch{return false;}case'contains':return Array.isArray(v)?v.includes(target):s.includes(target);}
 });
 return c.mode==='all'?results.every(Boolean):results.some(Boolean);
}
const SCALE=1_000_000_000n;
export function decimal(value:unknown):bigint {
 const s=String(value??'');
 if(!/^-?\d{1,15}(?:\.\d{1,9})?$/.test(s))throw Error('INVALID_NUMBER');
 const [a,b='']=s.replace('-','').split('.');
 return (BigInt(a)*SCALE+BigInt(b.padEnd(9,'0')))*(s.startsWith('-')?-1n:1n);
}
export function decimalText(n:bigint,places=2):string {
 const unit=10n**BigInt(9-places),absolute=n<0n?-n:n,rounded=(absolute+unit/2n)/unit;
 const s=rounded.toString().padStart(places+1,'0');
 return (n<0n&&rounded?'-':'')+(places?s.slice(0,-places)+'.'+s.slice(-places):s);
}
export function currencyDigits(currency:string):number {
 if(!Intl.supportedValuesOf('currency').includes(currency))throw Error('INVALID_CURRENCY');
 return new Intl.NumberFormat('en',{style:'currency',currency}).resolvedOptions().maximumFractionDigits??2;
}
function calculate(c:Calculation,values:Values):string {
 const refs=c.refs.flatMap(r=>{const v=values[r];return Array.isArray(v)?v:[v];});
 if(c.op==='count')return String(refs.filter(v=>v!==null&&v!==undefined&&v!=='').length);
 if(c.op==='days'){
  const dates=refs.length===1?String(refs[0]).split('/'):refs;
  const [a,b]=dates.map(v=>Date.parse(String(v)));
  if(!Number.isFinite(a)||!Number.isFinite(b))return '';
  return String(Math.round((b-a)/86400000)+1);
 }
 if(!['sum','count'].includes(c.op)&&refs.some(v=>v===null||v===undefined||v===''))return '';
 const nums=refs.filter(v=>v!==null&&v!==undefined&&v!=='').map(decimal);
 if(!nums.length)return '';
 let n=nums[0];
 if(c.op==='sum'||c.op==='add')n=nums.reduce((a,b)=>a+b,0n);
 else for(const b of nums.slice(1)){if(c.op==='subtract')n-=b;else if(c.op==='multiply')n=n*b/SCALE;else {if(!b)throw Error('DIVISION_BY_ZERO');n=n*SCALE/b;}}
 if(n>10n**25n||n<-(10n**25n))throw Error('NUMBER_OVERFLOW');
 return decimalText(n,c.decimals??2);
}
export function defaults(fields:Field[]):Values {
 const v:Values={};
 for(const f of fields)if(isRepeat(f))v[f.id]=Array.from({length:Math.max(f.minRows??0,f.required?1:0)},()=>defaults(f.children??[]));
 else if(isContainer(f))Object.assign(v,defaults(f.children??[]));
 else if(f.defaultValue!==undefined)v[f.id]=['checkbox','boolean'].includes(f.type)?f.defaultValue===''?undefined:f.defaultValue==='true':f.type==='multiSelect'?f.defaultValue.split('\n').filter(Boolean):f.defaultValue;
 return v;
}
export function normalize(definition:Definition,input:Values,currency='JPY',strict=false):{values:Values;errors:Record<string,string>}{
 const errors:Record<string,string>={},digits=currencyDigits(currency);
 const nodes=new Map<string,{field:Field;parents:string[];repeat:string}>();
 function index(fields:Field[],parents:string[]=[],repeat=''){for(const field of fields){nodes.set(field.id,{field,parents,repeat});index(field.children??[],[...parents,field.id],isRepeat(field)?field.id:repeat);}}
 index(definition.fields);
 const cache=new Map<string,unknown>(),visiting=new Set<string>();
 function value(id:string,row?:number):unknown {
  const node=nodes.get(id);if(!node)return undefined;
  const {field:f,parents,repeat}=node;
  if(repeat&&row===undefined){
   const list=input[repeat];return Array.isArray(list)&&list.length<=100?list.map((_,i)=>value(id,i)):[];
  }
  if(!repeat)row=undefined;
  const key=id+':'+(row??'root');if(cache.has(key))return cache.get(key);if(visiting.has(key))throw Error('CIRCULAR_REFERENCE');
  visiting.add(key);
  let result:unknown;
  if(parents.every(p=>value(p,row)===true)&&condition(f.visibleWhen,context(f.visibleWhen?.rules.map(r=>r.field)??[],row))){
   if(isContainer(f))result=true;
   else if(!isDisplay(f)){
    if(f.type==='calculated'){
     try{result=calculate(f.calculation!,context(f.calculation?.refs??[],row));}
     catch{result='';errors[(repeat?repeat+'.'+row+'.':'')+id]='INVALID_CALCULATION';}
    }else {
     const source=repeat?(input[repeat] as Values[]|undefined)?.[row!]:input;
     result=source&&typeof source==='object'?source[id]:undefined;
    }
   }
  }
  visiting.delete(key);cache.set(key,result);return result;
 }
 function context(refs:string[],row?:number):Values{return Object.fromEntries(refs.map(id=>[id,value(id,row)]));}
 function walk(fields:Field[],source:Values,path:string,row?:number):Values {
  const out:Values={};
  for(const f of fields){
   const key=path+f.id;
   if(isContainer(f)?value(f.id,row)!==true:value(f.id,row)===undefined) {
    // An empty visible input still needs required validation.
    const node=nodes.get(f.id)!;
    if(!node.parents.every(p=>value(p,row)===true)||!condition(f.visibleWhen,context(f.visibleWhen?.rules.map(r=>r.field)??[],row)))continue;
   }
   if(isRepeat(f)){
    const rows=source[f.id]??[];
    if(!Array.isArray(rows)||rows.length>(f.maxRows??100)){errors[key]='INVALID_ROWS';continue;}
    const required=f.required||!!f.requiredWhen&&condition(f.requiredWhen,context(f.requiredWhen.rules.map(r=>r.field),row));
    if(strict&&rows.length<Math.max(f.minRows??0,required?1:0))errors[key]='REQUIRED';
    out[f.id]=rows.map((r,i)=>walk(f.children??[],r&&typeof r==='object'&&!Array.isArray(r)?r:{},path+f.id+'.'+i+'.',i));continue;
   }
   if(isContainer(f)){Object.assign(out,walk(f.children??[],source,path,row));continue;}
   if(isDisplay(f))continue;
   const v=value(f.id,row),required=f.required||!!f.requiredWhen&&condition(f.requiredWhen,context(f.requiredWhen.rules.map(r=>r.field),row));
   const empty=v==null||v===''||Array.isArray(v)&&!v.length||['checkbox'].includes(f.type)&&v!==true;
   if(empty){if(strict&&required&&!errors[key])errors[key]='REQUIRED';continue;}
   if(['multiSelect','attachment','image'].includes(f.type)){
    if(!Array.isArray(v)||v.length>100||v.some(x=>typeof x!=='string')||new Set(v).size!==v.length)errors[key]='INVALID_VALUE';
    else if(f.type==='multiSelect'&&v.some(x=>!f.options?.includes(x)))errors[key]='INVALID_OPTION';
    else out[f.id]=v;
    continue;
   }
   if(f.type==='checkbox'||f.type==='boolean'){if(typeof v!=='boolean')errors[key]='INVALID_VALUE';else out[f.id]=v;continue;}
   if(typeof v!=='string'||v.length>20000){errors[key]='INVALID_VALUE';continue;}
   const s=v.trim();
   out[f.id]=s;
   if(['integer','decimal','money','percent','calculated'].includes(f.type)){
    try{const n=decimal(s);const places=f.type==='integer'?0:f.type==='money'?digits:6;
     if((s.split('.')[1]?.length??0)>places||f.min!==undefined&&n<decimal(f.min)||f.max!==undefined&&n>decimal(f.max))errors[key]='INVALID_NUMBER';
    }catch{errors[key]='INVALID_NUMBER';}
   }else if(['select','radio'].includes(f.type)&&!f.options?.includes(s))errors[key]='INVALID_OPTION';
   else if(['employee','branch','department'].includes(f.type)&&!/^[1-9]\d*$/.test(s))errors[key]='INVALID_OPTION';
   else if(f.type==='email'&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s))errors[key]='INVALID_EMAIL';
   else if(f.type==='url'&&!/^https?:\/\/[^\s]+$/i.test(s))errors[key]='INVALID_URL';
   else if(['date','dateRange','datetime','datetimeRange','time','timeRange'].includes(f.type)){
    const range=f.type.endsWith('Range'),kind=f.type.replace('Range',''),parts=range?s.split('/'): [s];
    const valid=(p:string)=>kind==='time'?/^([01]\d|2[0-3]):[0-5]\d$/.test(p):kind==='date'?/^\d{4}-\d\d-\d\d$/.test(p)&&Number.isFinite(Date.parse(p))&&new Date(p).toISOString().slice(0,10)===p:/^\d{4}-\d\d-\d\dT([01]\d|2[0-3]):[0-5]\d$/.test(p)&&Number.isFinite(Date.parse(p))&&new Date(p.slice(0,10)).toISOString().slice(0,10)===p.slice(0,10);
    if(parts.length!==(range?2:1)||!parts.every(valid)||range&&parts[0]>parts[1])errors[key]='INVALID_DATE';
    if(range&&kind==='date'&&f.max!==undefined&&(Date.parse(parts[1])-Date.parse(parts[0]))/86400000+1>f.max)errors[key]='INVALID_DATE';
   }else if(f.min!==undefined&&s.length<f.min||f.max!==undefined&&s.length>f.max)errors[key]='INVALID_LENGTH';
  }
  return out;
 }
 return {values:walk(definition.fields,input,''),errors};
}
export function attachmentKeys(values:Values,fields:Field[]):string[]{
 const result:string[]=[];
 function walk(list:Field[],v:Values){for(const f of list){
  if(isRepeat(f)){if(Array.isArray(v[f.id]))for(const row of v[f.id] as Values[])walk(f.children??[],row);}
  else if(isContainer(f))walk(f.children??[],v);
  else if(['image','attachment'].includes(f.type)&&Array.isArray(v[f.id]))result.push(...v[f.id] as string[]);
 }}
 walk(fields,values);return [...new Set(result)];
}
