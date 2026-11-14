import {throwApiError} from '../api/response';
export const columnIds=['project','projectName','ticket','title','type','status','assignee','dueOn','priority','author','startsOn','estimatedMinutes','actualMinutes','labels','parent','createdAt','updatedAt'] as const;
export const defaultColumns=['projectName','ticket','title','type','status','assignee','dueOn'];
export function parseColumns(value:unknown,customIds:string[]=[]):string[]{
 if(!Array.isArray(value)||value.length>columnIds.length+1000||value.length<1||new Set(value).size!==value.length||value.some(id=>!columnIds.includes(id)&&!customIds.includes(id)))throwApiError(422,'INVALID_COLUMNS','Select at least one valid column without duplicates.');
 return value as string[];
}
export function storedColumns(value:unknown,customIds:string[]=[]):string[]{
 if(Array.isArray(value)){
  if(!value.includes('project')||!value.includes('ticket')||value.includes('projectName')||value.includes('title'))throwApiError(422,'INVALID_COLUMNS','Invalid legacy columns.');
  return parseColumns(parseColumns(value).flatMap(key=>key==='project'?['project','projectName']:key==='ticket'?['ticket','title']:[key]));
 }
 if(value&&typeof value==='object'&&'schemaVersion' in value&&value.schemaVersion===2&&'columns' in value)return parseColumns((value.columns as unknown[]).filter(id=>typeof id!=='string'||!id.startsWith('custom.')||customIds.includes(id)),customIds);
 throwApiError(422,'INVALID_COLUMNS','Invalid stored columns.');
}
