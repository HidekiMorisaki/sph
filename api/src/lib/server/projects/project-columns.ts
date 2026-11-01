import {throwApiError} from '../api/response';
export const columnIds=['code','name','status','visibility','updatedAt'] as const;
export const defaultColumns:string[]=[...columnIds];
export function parseColumns(value:unknown):string[]{
 if(!Array.isArray(value)||value.length<1||value.length>columnIds.length||new Set(value).size!==value.length||value.some(id=>!columnIds.includes(id)))throwApiError(422,'INVALID_COLUMNS','Select at least one valid column without duplicates.');
 return value as string[];
}
export function storedColumns(value:unknown):string[]{
 if(value&&typeof value==='object'&&'schemaVersion' in value&&value.schemaVersion===1&&'columns' in value)return parseColumns(value.columns);
 throwApiError(422,'INVALID_COLUMNS','Invalid stored columns.');
}
