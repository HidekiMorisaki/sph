export type Field = {
 type:'string'|'text'|'number'|'boolean'|'date'|'select'|'stringArray'; label:{ja:string;en:string};
 required?:boolean; default?:string|number|boolean|string[]; maxLength?:number; min?:number; max?:number;
 options?:Array<{value:string;label:{ja:string;en:string}}>; format?:'timeZone';
};
export type Storage = {
 fields:Record<string,Field>; fieldOrder?:string[]; titleField:string; listFields:string[];
 operations:{create:boolean;update:boolean;delete:boolean};
 maxRecords?:number; maxRecordBytes?:number; maxTotalBytes?:number;
 initialRecords?:Array<{recordKey:string;values:Record<string,string|number|boolean|string[]>}>;
};
export const isObject=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v);
export const onlyKeys=(v:Record<string,unknown>,keys:string[])=>Object.keys(v).every(k=>keys.includes(k));
export const recordKey=(v:unknown):v is string=>typeof v==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(v);
const name=(v:string)=>/^[a-z][a-zA-Z0-9_]{0,63}$/.test(v)&&!['constructor','prototype','__proto__'].includes(v);
const validText=(v:string)=>!v.includes('\0')&&!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(v);
const label=(v:unknown)=>isObject(v)&&onlyKeys(v,['ja','en'])&&['ja','en'].every(k=>typeof v[k]==='string'&&(v[k] as string).trim().length>0&&(v[k] as string).length<=160&&validText(v[k] as string));
const integer=(v:unknown,min:number,max:number)=>Number.isSafeInteger(v)&&Number(v)>=min&&Number(v)<=max;
export const byteSize=(v:unknown)=>new TextEncoder().encode(JSON.stringify(v)).length;
export function valuesFor(storage:Storage,input:unknown):Record<string,string|number|boolean|string[]> {
 if(!isObject(input)||!onlyKeys(input,Object.keys(storage.fields)))throw Error('Unknown storage fields');
 const out:Record<string,string|number|boolean|string[]>={};
 for(const [key,field] of Object.entries(storage.fields)){
  const v=Object.hasOwn(input,key)?input[key]:field.default;
  if(v===undefined){if(field.required)throw Error('Required field: '+key);continue;}
  const text=(x:unknown):x is string=>typeof x==='string'&&x.length<=(field.maxLength??(field.type==='text'?16000:1000))&&validText(x);
  let valid=false;
  if(field.type==='number')valid=typeof v==='number'&&Number.isFinite(v)&&(field.min===undefined||v>=field.min)&&(field.max===undefined||v<=field.max);
  else if(field.type==='boolean')valid=typeof v==='boolean';
  else if(field.type==='stringArray')valid=Array.isArray(v)&&v.length<=1000&&v.every(x=>text(x)&&x.length>0&&!/[\r\n\u2028\u2029]/u.test(x))&&new Set(v).size===v.length&&(!field.required||v.length>0)&&(!field.format||v.every(x=>{try{new Intl.DateTimeFormat('en',{timeZone:x});return true;}catch{return false;}}));
  else if(text(v)){
   valid=!field.required||v.trim().length>0;
   if(field.type==='string')valid=valid&&!/[\r\n\u2028\u2029]/u.test(v);
   if(field.type==='date')valid=valid&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
   if(field.type==='select')valid=valid&&!!field.options?.some(o=>o.value===v);
  }
  if(!valid)throw Error('Invalid storage field: '+key);
  out[key]=v as string|number|boolean|string[];
 }
 if(byteSize(out)>(storage.maxRecordBytes??65536))throw Error('Record capacity exceeded');
 return out;
}
// Only approved, declared initial records can be customized during instance creation.
export function initialRecordsFor(storage:Storage|undefined,overrides?:unknown):NonNullable<Storage['initialRecords']>{
 const defaults=storage?.initialRecords??[];
 const replacements=new Map<string,unknown>();
 if(overrides!==undefined){
  if(!storage?.operations.update||!Array.isArray(overrides)||overrides.length>defaults.length)throw Error('Invalid initial records');
  for(const row of overrides){
   if(!isObject(row)||!onlyKeys(row,['recordKey','values'])||!recordKey(row.recordKey)||!defaults.some(d=>d.recordKey===row.recordKey)||replacements.has(row.recordKey))throw Error('Invalid initial record');
   replacements.set(row.recordKey,row.values);
  }
 }
 if(!storage)return [];
 const rows=defaults.map(row=>({recordKey:row.recordKey,values:valuesFor(storage,replacements.has(row.recordKey)?replacements.get(row.recordKey):row.values)}));
 if(rows.length>(storage.maxRecords??1000)||rows.reduce((sum,row)=>sum+byteSize(row.values),0)>(storage.maxTotalBytes??1048576))throw Error('Initial capacity exceeded');
 return rows;
}
export function storageDefinition(input:unknown):Storage {
 if(!isObject(input)||!onlyKeys(input,['fields','fieldOrder','titleField','listFields','operations','maxRecords','maxRecordBytes','maxTotalBytes','initialRecords'])||!isObject(input.fields)||Object.keys(input.fields).length<1||Object.keys(input.fields).length>32||!isObject(input.operations)||!onlyKeys(input.operations,['create','update','delete'])||!['create','update','delete'].every(k=>typeof (input.operations as Record<string,unknown>)[k]==='boolean'))throw Error('Invalid storage definition');
 const fields=input.fields;
 if(input.fieldOrder!==undefined&&(!Array.isArray(input.fieldOrder)||input.fieldOrder.length!==Object.keys(fields).length||new Set(input.fieldOrder).size!==input.fieldOrder.length||!input.fieldOrder.every(k=>typeof k==='string'&&Object.hasOwn(fields,k))))throw Error('Invalid field order');
 if(typeof input.titleField!=='string'||!Object.hasOwn(fields,input.titleField)||!Array.isArray(input.listFields)||!input.listFields.length||input.listFields.length>32||new Set(input.listFields).size!==input.listFields.length||!input.listFields.every(k=>typeof k==='string'&&Object.hasOwn(fields,k)))throw Error('Invalid record display');
 for(const [key,f] of Object.entries(fields)){
  if(!name(key)||!isObject(f)||!onlyKeys(f,['type','label','required','default','maxLength','min','max','options','format'])||!['string','text','number','boolean','date','select','stringArray'].includes(String(f.type))||!label(f.label))throw Error('Invalid storage field');
  if(f.required!==undefined&&typeof f.required!=='boolean'||f.maxLength!==undefined&&(!['string','text','select','stringArray'].includes(String(f.type))||!integer(f.maxLength,1,16000))||f.format!==undefined&&(f.type!=='stringArray'||f.format!=='timeZone'))throw Error('Invalid field constraints');
  for(const bound of ['min','max'])if(f[bound]!==undefined&&(f.type!=='number'||typeof f[bound]!=='number'||!Number.isFinite(f[bound])))throw Error('Invalid numeric bound');
  if(f.min!==undefined&&f.max!==undefined&&Number(f.min)>Number(f.max))throw Error('Invalid numeric range');
  if(f.type==='select'){
   if(!Array.isArray(f.options)||!f.options.length||f.options.length>100||new Set(f.options.map(o=>isObject(o)?o.value:null)).size!==f.options.length||!f.options.every(o=>isObject(o)&&onlyKeys(o,['value','label'])&&typeof o.value==='string'&&o.value.length>0&&o.value.length<=1000&&validText(o.value)&&label(o.label)))throw Error('Invalid choices');
  }else if(f.options!==undefined)throw Error('Unexpected choices');
  if(f.default!==undefined)valuesFor({fields:{[key]:f as Field}} as Storage,{[key]:f.default});
 }
 for(const [key,upper] of [['maxRecords',1000],['maxRecordBytes',65536],['maxTotalBytes',1048576]] as const)if(input[key]!==undefined&&!integer(input[key],1,upper))throw Error('Invalid storage limit');
 const storage=input as unknown as Storage;
 if(input.initialRecords!==undefined){
  if(!Array.isArray(input.initialRecords)||input.initialRecords.length>(storage.maxRecords??1000)||new Set(input.initialRecords.map(r=>isObject(r)?r.recordKey:null)).size!==input.initialRecords.length)throw Error('Invalid initial records');
  let bytes=0;for(const r of input.initialRecords){if(!isObject(r)||!onlyKeys(r,['recordKey','values'])||!recordKey(r.recordKey))throw Error('Invalid initial record');bytes+=byteSize(valuesFor(storage,r.values));}
  if(bytes>(storage.maxTotalBytes??1048576))throw Error('Initial capacity exceeded');
 }
 return storage;
}
