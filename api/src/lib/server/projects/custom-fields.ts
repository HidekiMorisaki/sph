import {Prisma} from '#lib/server/generated/prisma/client.js';
import {throwApiError} from '../api/response';
import {getPrisma} from '../prisma';
import type {AuthenticatedUser} from '../auth/types';
import type {SearchContext,SearchField} from '../api/search-registry';
import {projectVisibility} from './service';

type Tx=Prisma.TransactionClient;
export const fieldKinds=['select','multiselect','integer','decimal','duration','text','textarea','date','boolean'] as const;
const invalid=(field='customFields'):never=>throwApiError(422,'INVALID_CUSTOM_FIELD','Check the custom field definition or value.',[{field,reason:'INVALID_VALUE'}]);
function object(v:unknown):Record<string,unknown>{if(!v||typeof v!=='object'||Array.isArray(v))invalid();return v as Record<string,unknown>;}
function keys(v:Record<string,unknown>,allowed:string[]){if(Object.keys(v).some(k=>!allowed.includes(k)))invalid();}
function text(v:unknown,max:number,required=false){if(typeof v!=='string'||v.length>max||required&&!v.trim())invalid();return (v as string).trim();}
function integer(v:unknown):number{if(typeof v!=='number'||!Number.isSafeInteger(v)||v<1||v>2147483647)invalid();return v as number;}
const empty=(v:unknown)=>v===null||v===undefined||v===''||Array.isArray(v)&&v.length===0;
export async function customFieldDefinitions(tx:Tx,projectId:number|number[]){
 const rows=await tx.projectCustomField.findMany({where:{projectId:Array.isArray(projectId)?{in:projectId}:projectId,deletedAt:null},include:{options:{where:{deletedAt:null},orderBy:[{position:'asc'},{id:'asc'}]},types:{where:{deletedAt:null},select:{typeId:true}}},orderBy:[{position:'asc'},{id:'asc'}]});
 return rows.map(({types,...f})=>({...f,typeIds:types.map(t=>t.typeId)}));
}
export type FieldDefinition=Awaited<ReturnType<typeof customFieldDefinitions>>[number];
export const fieldApplies=(f:FieldDefinition,typeId:number)=>f.enabled&&(!f.typeIds.length||f.typeIds.includes(typeId));
function validValue(f:Pick<FieldDefinition,'id'|'kind'|'options'|'min'|'max'|'maxLength'>,v:unknown,old:unknown=null,defaults=false):Prisma.InputJsonValue|null{
 if(empty(v))return null;
 const error=()=>invalid('customFields.'+f.id);
 if(f.kind==='select'||f.kind==='multiselect'){
  const values=f.kind==='select'?[v]:v;if(!Array.isArray(values)||values.length>100||new Set(values).size!==values.length)error();
  const previous=Array.isArray(old)?old:[old];
  for(const item of values as unknown[]){if(typeof item!=='number'||!Number.isSafeInteger(item)||!f.options.some(o=>o.id===item&&(o.enabled||!defaults&&previous.includes(item))))error();}
  return f.kind==='select'?v as number:values as number[];
 }
 if(['integer','decimal','duration'].includes(f.kind)){
  if(typeof v!=='number'||!Number.isFinite(v)||Math.abs(v)>99999999999999||f.kind==='integer'&&!Number.isSafeInteger(v))error();
  const d=new Prisma.Decimal(v as number);if(d.decimalPlaces()>(f.kind==='duration'?2:6)||f.kind==='duration'&&d.lessThan(0)||f.min!==null&&d.lessThan(f.min)||f.max!==null&&d.greaterThan(f.max))error();return v as number;
 }
 if(f.kind==='boolean'){if(typeof v!=='boolean')error();return v as boolean;}
 if(typeof v!=='string'||v.length>(f.maxLength??(f.kind==='textarea'?20000:5000)))error();
 if(f.kind==='date'){if(!/^\d{4}-\d{2}-\d{2}$/.test(v as string))error();const d=new Date(v+'T00:00:00Z');if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==v)error();}
 if(f.kind==='text'&&/[\r\n]/.test(v as string))error();return (v as string).trim()||null;
}
export async function saveCustomFieldDefinitions(tx:Tx,projectId:number,revision:number,body:Record<string,unknown>){
 keys(body,['revision','fields']);if(body.revision!==revision)throwApiError(409,'REVISION_CONFLICT','Project settings changed.');
 if(!Array.isArray(body.fields)||body.fields.length>100)invalid();
 const previous=await customFieldDefinitions(tx,projectId),seen=new Set<number>(),names=new Set<string>();
 const types=await tx.projectTicketType.findMany({where:{projectId,deletedAt:null},select:{id:true}});
 for(const [position,raw] of (body.fields as unknown[]).entries()){
  const row=object(raw);keys(row,['id','name','kind','description','required','enabled','defaultValue','min','max','maxLength','typeIds','options']);
  const old=typeof row.id==='number'&&row.id<0?undefined:row.id===undefined?undefined:previous.find(f=>f.id===integer(row.id));if(row.id!==undefined&&!(typeof row.id==='number'&&Number.isSafeInteger(row.id)&&row.id<0)&&(!old||seen.has(old.id)))invalid();
  const name=text(row.name,128,true);if(names.has(name))invalid();names.add(name);
  const kind=text(row.kind,20);if(!fieldKinds.includes(kind as typeof fieldKinds[number])||old&&old.kind!==kind)invalid();
  if(typeof row.required!=='boolean'||typeof row.enabled!=='boolean')invalid();
  const typeIds=row.typeIds;if(!Array.isArray(typeIds)||new Set(typeIds).size!==typeIds.length||typeIds.some(id=>!types.some(t=>t.id===id)))invalid();
  const bound=(v:unknown)=>v===null||v===undefined?null:typeof v==='number'&&Number.isFinite(v)&&Math.abs(v)<=99999999999999?new Prisma.Decimal(v):invalid();
  const min=bound(row.min),max=bound(row.max);if(min&&max&&min.greaterThan(max))invalid();
  const maxLength=row.maxLength===null||row.maxLength===undefined?null:integer(row.maxLength);if(maxLength!==null&&maxLength>(kind==='textarea'?20000:5000))invalid();
  if(!['integer','decimal','duration'].includes(kind)&&(min!==null||max!==null)||!['text','textarea'].includes(kind)&&maxLength!==null)invalid();
  const description=text(row.description??'',2000);
  const field=old?await tx.projectCustomField.update({where:{id:old.id},data:{name,description,required:row.required as boolean,enabled:row.enabled as boolean,position,min,max,maxLength}}):await tx.projectCustomField.create({data:{projectId,name,kind,description,required:row.required as boolean,enabled:row.enabled as boolean,position,min,max,maxLength}});seen.add(field.id);
  if(!Array.isArray(row.options)||row.options.length>100||!['select','multiselect'].includes(kind)&&row.options.length)invalid();
  const optionIds=new Set<number>(),optionNames=new Set<string>(),optionMap=new Map<number,number>();
  for(const [pos,rawOption] of (row.options as unknown[]).entries()){
   const o=object(rawOption);keys(o,['id','name','enabled']);const label=text(o.name,128,true);if(optionNames.has(label)||typeof o.enabled!=='boolean')invalid();optionNames.add(label);
   const prior=typeof o.id==='number'&&o.id<0?undefined:o.id===undefined?undefined:old?.options.find(x=>x.id===integer(o.id));if(o.id!==undefined&&!(typeof o.id==='number'&&Number.isSafeInteger(o.id)&&o.id<0)&&(!prior||optionIds.has(prior.id)))invalid();
   const saved=prior?await tx.projectCustomFieldOption.update({where:{id:prior.id},data:{name:label,enabled:o.enabled as boolean,position:pos}}):await tx.projectCustomFieldOption.create({data:{fieldId:field.id,name:label,enabled:o.enabled as boolean,position:pos}});optionIds.add(saved.id);if(typeof o.id==='number')optionMap.set(o.id,saved.id);
  }
  if(old?.options.some(o=>!optionIds.has(o.id)))invalid(); // Retire options explicitly; never discard existing values.
  await tx.projectCustomFieldType.updateMany({where:{fieldId:field.id,deletedAt:null},data:{deletedAt:new Date()}});
  for(const typeId of typeIds as number[])await tx.projectCustomFieldType.upsert({where:{fieldId_typeId:{fieldId:field.id,typeId}},create:{fieldId:field.id,typeId},update:{deletedAt:null}});
  const full=(await customFieldDefinitions(tx,projectId)).find(f=>f.id===field.id)!;
  const defaultValue=kind==='select'?optionMap.get(row.defaultValue as number)??row.defaultValue:kind==='multiselect'&&Array.isArray(row.defaultValue)?row.defaultValue.map(id=>optionMap.get(id)??id):row.defaultValue;
  const value=validValue(full,defaultValue,null,true);
  await tx.projectCustomField.update({where:{id:field.id},data:{defaultValue:value===null?Prisma.DbNull:value}});
 }
 if(previous.some(f=>!seen.has(f.id)))invalid(); // Definitions are disabled, rather than silently removed.
 await tx.project.update({where:{id:projectId},data:{revision:{increment:1}}});
}
export async function customValues(tx:Tx,ticketIds:number[]){
 const values=await tx.projectCustomFieldValue.findMany({where:{ticketId:{in:ticketIds},deletedAt:null},select:{ticketId:true,fieldId:true,value:true}});
 const output:Record<number,Record<string,Prisma.JsonValue>>={};for(const v of values)(output[v.ticketId]??={})[v.fieldId]=v.value;return output;
}
export async function saveCustomValues(tx:Tx,projectId:number,ticketId:number,typeId:number,input:unknown,creating:boolean){
 const fields=await customFieldDefinitions(tx,projectId),old=(await customValues(tx,[ticketId]))[ticketId]??{},provided=input===undefined?{}:object(input),next={...old};
 for(const key of Object.keys(provided))if(!/^[1-9]\d*$/.test(key)||!fields.some(f=>f.id===Number(key)))invalid();
 for(const f of fields){
  const has=Object.hasOwn(provided,String(f.id)),applies=fieldApplies(f,typeId);
  if(!applies){if(has&&JSON.stringify(provided[f.id])!==JSON.stringify(old[f.id]??null))invalid('customFields.'+f.id);continue;}
  const value=validValue(f,has?provided[f.id]:creating?f.defaultValue:old[f.id],old[f.id]);if(f.required&&empty(value))invalid('customFields.'+f.id);
  if(value===null)delete next[f.id];else next[f.id]=value as Prisma.JsonValue;
  if(JSON.stringify(old[f.id]??null)===JSON.stringify(value))continue;
  const record=await tx.projectCustomFieldValue.upsert({where:{ticketId_fieldId:{ticketId,fieldId:f.id}},create:{ticketId,fieldId:f.id,value:value??Prisma.JsonNull,deletedAt:value===null?new Date():null},update:{value:value??Prisma.JsonNull,deletedAt:value===null?new Date():null}});
  await tx.projectCustomFieldSelection.updateMany({where:{valueId:record.id,deletedAt:null},data:{deletedAt:new Date()}});
  if(value!==null&&['select','multiselect'].includes(f.kind))for(const optionId of (Array.isArray(value)?value:[value]) as number[])await tx.projectCustomFieldSelection.upsert({where:{valueId_optionId:{valueId:record.id,optionId}},create:{valueId:record.id,optionId},update:{deletedAt:null}});
 }
 return {before:old,after:next};
}

// All expressions are built from database integer IDs, never user-supplied SQL.
export async function customSearchContexts(actor:AuthenticatedUser,base:SearchContext[]){
 if(!actor.permissionOperations.includes('projects.read'))return base;
 const projects=await getPrisma().$queryRaw<{id:number;name:string;code:string}[]>(Prisma.sql`SELECT p.id,p.name,p.code FROM projects p WHERE p.deleted_at IS NULL AND ${projectVisibility(actor)}`);
 const fields:SearchField[]=[];
 const definitions=await customFieldDefinitions(getPrisma(),projects.map(p=>p.id));
 for(const f of definitions){const p=projects.find(p=>p.id===f.projectId)!;
  if(!f.enabled)continue;
  const applicable=`t.project_id=${p.id}${f.typeIds.length?' AND t.type_id IN ('+f.typeIds.join(',')+')':''}`;
  const value=`(SELECT cv.value FROM project_custom_field_values cv WHERE cv.ticket_id=t.id AND cv.field_id=${f.id} AND cv.deleted_at IS NULL)`;
  const scalar=`(${value} #>> '{}')`;
  const type:SearchField['type']=f.kind==='boolean'?'boolean':f.kind==='date'?'date':['integer','decimal','duration'].includes(f.kind)?'number':['select','multiselect'].includes(f.kind)?'choice':'string';
  fields.push({code:'custom.'+f.id,label:{ja:p.name+'／'+f.name,en:p.name+' / '+f.name},type,maxLength:f.maxLength??20000,source:'ProjectCustomField.'+f.id,expression:type==='number'?`(${scalar})::numeric`:type==='date'?`(${scalar})::date`:type==='boolean'?`(${scalar})::boolean`:scalar,custom:{guard:applicable,multiple:f.kind==='multiselect',value},multiple:f.kind==='multiselect',...(['choice','date'].includes(type)?{unsetMode:'value' as const}:{}),...(['select','multiselect'].includes(f.kind)?{choices:f.options.filter(o=>o.enabled).map(o=>String(o.id)),options:f.options.filter(o=>o.enabled).map(o=>({value:String(o.id),label:o.name}))}:{})});
 }
 return base.map((context,i)=>i===0?{...context,fields:[...context.fields,...fields]}:context);
}
