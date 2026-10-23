import type {WidgetStorage,WidgetValues} from './widgets';
// Preview validation mirrors the public storage contract; REST remains authoritative.
export function previewValues(schema:WidgetStorage,input:unknown):WidgetValues{
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!Object.hasOwn(schema.fields,k)))throw Error('Unknown storage field');
 const source=input as Record<string,unknown>,result:WidgetValues={};
 const validText=(s:string)=>!s.includes('\0')&&!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(s);
 for(const [key,f] of Object.entries(schema.fields)){
  const v=Object.hasOwn(source,key)?source[key]:f.default;if(v===undefined){if(f.required)throw Error('Required storage field');continue;}
  const text=(value:unknown):value is string=>typeof value==='string'&&validText(value)&&value.length<=(f.maxLength??(f.type==='text'?16000:1000));let valid=false;
  if(f.type==='number')valid=typeof v==='number'&&Number.isFinite(v)&&(f.min===undefined||v>=f.min)&&(f.max===undefined||v<=f.max);
  else if(f.type==='boolean')valid=typeof v==='boolean';
  else if(f.type==='stringArray')valid=Array.isArray(v)&&v.length<=1000&&new Set(v).size===v.length&&(!f.required||v.length>0)&&v.every(value=>text(value)&&value.length>0&&!/[\r\n\u2028\u2029]/u.test(value)&&(!f.format||(()=>{try{new Intl.DateTimeFormat('en',{timeZone:value});return true;}catch{return false;}})()));
  else if(text(v)){valid=!f.required||v.trim().length>0;if(f.type==='string')valid=valid&&!/[\r\n\u2028\u2029]/u.test(v);if(f.type==='date'){const date=new Date(v);valid=valid&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(date.valueOf())&&date.toISOString().slice(0,10)===v;}if(f.type==='select')valid=valid&&!!f.options?.some(o=>o.value===v);}
  if(!valid)throw Error('Invalid storage field: '+key);result[key]=v as WidgetValues[string];
 }
 if(new TextEncoder().encode(JSON.stringify(result)).length>(schema.maxRecordBytes??65536))throw Error('Record capacity exceeded');return result;
}
