import { valuesFor,storageDefinition,type Storage} from './storage-contract';
import { createHash } from 'node:crypto';

export const capabilities = ['book_notices', 'book_loans', 'account', 'world_clock'] as const;
export type Capability = typeof capabilities[number];
export type Manifest = {
 id: string; provider: string; author?: string; description?: {ja:string;en:string}; version: string; schemaVersion: 1|2;
 name: { ja: string; en: string }; sizes: string[]; sizeLayouts: Record<string,{rows:number;columns:number}>;
 capabilities: Capability[]; storage?:Storage; configuration?:Storage;runtime?:{sdkVersion:1;html:string;css:string;javascript:string};
 settings: Record<string, never>;
 view: Array<{ type: 'runtime' | 'text' | 'number' | 'list' | 'clock' | 'date' | 'link' | 'calculator' | 'programmer_calculator' | 'timer' | 'stopwatch' | 'unit_converter' | 'personal_note' | 'records'; data?: Capability; text?: { ja: string; en: string }; value?: number; href?: string }>;
 license: { name: string; url: string };
};
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const keys = (v: Record<string, unknown>, allowed: string[]) => Object.keys(v).every(k => allowed.includes(k));
const string = (v: unknown, max: number): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
const translated = (v: unknown) => object(v) && keys(v, ['ja','en']) && string(v.ja, 160) && string(v.en, 160);
export function timeZone(v: unknown): v is string { if (!string(v,64)) return false; try { new Intl.DateTimeFormat('en', {timeZone:v}); return true; } catch { return false; } }
export function manifest(value: unknown): Manifest {
 if (!object(value) || !keys(value,['id','provider','author','description','version','schemaVersion','name','sizes','sizeLayouts','capabilities','settings','view','license','storage','runtime','configuration']) || value.schemaVersion!==1&&value.schemaVersion!==2 ||
 !string(value.id,100) || !/^[a-z][a-z0-9_.-]+$/.test(value.id) || !string(value.provider,100) || !string(value.version,40) || !/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(value.version) || !translated(value.name) ||
 !Array.isArray(value.sizes) || !value.sizes.length || value.sizes.length>64 || new Set(value.sizes).size !== value.sizes.length || value.sizes.some(s => typeof s!=='string'||! /^[1-8]x[1-8]$/.test(s)) ||
 !Array.isArray(value.capabilities) || value.capabilities.length > 5 || new Set(value.capabilities).size !== value.capabilities.length || value.capabilities.some(c => !capabilities.includes(c)) ||
 !object(value.settings) || Object.keys(value.settings).length!==0 ||
 !object(value.license) || !keys(value.license,['name','url']) || !string(value.license.name,160) || !string(value.license.url,2048)) throw new Error('Invalid widget manifest');
 if(value.storage!==undefined)storageDefinition(value.storage);
 if(value.schemaVersion===2){
  const r=value.runtime;
  if(!object(r)||!keys(r,['sdkVersion','html','css','javascript'])||r.sdkVersion!==1||!['html','css','javascript'].every(k=>typeof r[k]==='string'&&(r[k] as string).length<=131072)||Buffer.byteLength(JSON.stringify(value),'utf8')>262144||!Array.isArray(value.view)||value.view.length!==1||!object(value.view[0])||value.view[0].type!=='runtime'||!keys(value.view[0],['type'])||value.capabilities.length!==0)throw Error('Invalid SDK widget');
  if(value.configuration!==undefined){const configuration=storageDefinition(value.configuration);if(Object.values(configuration.operations).some(Boolean)||configuration.initialRecords!==undefined)throw Error('Configuration has no record operations');}
 }else if(value.runtime!==undefined||value.configuration!==undefined)throw Error('SDK requires schema version 2');

 if(Array.isArray(value.view)&&value.view.some(b=>object(b)&&b.type==='records')&&(value.view.length!==1||value.capabilities.length!==0||Object.keys(value.settings).length!==0||!value.sizeLayouts||Object.values(value.sizeLayouts as Record<string,{rows:number;columns:number}>).some(d=>d.rows<2||d.columns<2)))throw new Error('Records require a dedicated layout of at least 2 by 2');
 if(Array.isArray(value.view)&&value.view.some(b=>object(b)&&b.type==='personal_note')||value.capabilities.includes('world_clock')&&value.storage!==undefined){
  const note=Array.isArray(value.view)&&value.view.some(b=>object(b)&&b.type==='personal_note');
  const store=value.storage as Storage|undefined,key=note?'note':'timeZones';
  if(!store||Object.keys(store.fields).length!==1||!store.fields[key]||store.fields[key].type!==(note?'text':'stringArray')||store.maxRecords!==1||store.operations.create||store.operations.delete||!store.operations.update||store.initialRecords?.length!==1||store.initialRecords[0].recordKey!=='default'||(note?store.fields[key].maxLength!==5000:store.fields[key].format!=='timeZone'||!store.fields[key].required))throw new Error('Invalid built-in storage');
 }
 if (value.author !== undefined && !string(value.author,160)) throw new Error('Invalid author');
 if (value.description !== undefined && (!object(value.description) || !keys(value.description,['ja','en']) || !string(value.description.ja,10000) || !string(value.description.en,10000))) throw new Error('Invalid description');
 {
  if(!object(value.sizeLayouts)||!keys(value.sizeLayouts,value.sizes as string[])||Object.keys(value.sizeLayouts).length!==value.sizes.length)throw new Error('Invalid size layouts');
  for(const id of value.sizes as string[]){const layout=value.sizeLayouts[id];if(!object(layout)||!keys(layout,['rows','columns'])||!Number.isInteger(layout.rows)||!Number.isInteger(layout.columns)||Number(layout.rows)<1||Number(layout.rows)>8||Number(layout.columns)<1||Number(layout.columns)>8||id!==`${layout.rows}x${layout.columns}`)throw new Error('Invalid size layout');}
 }
 if(Array.isArray(value.view)){
  const tool=value.view.find(b=>object(b)&&['timer','stopwatch','unit_converter','personal_note'].includes(String(b.type)));
  if(object(tool)){
   const note=tool.type==='personal_note';
   if(value.view.length!==1 || value.capabilities.length!==0 || !keys(value.settings,[]) || (note&&!value.storage) || !value.sizeLayouts || Object.values(value.sizeLayouts as Record<string,{rows:number;columns:number}>).some(d=>d.rows<((note||tool.type==='timer')?1:2)))throw new Error('Tool requires a dedicated layout without data capabilities');
  }
  const calculator=value.view.find(b=>object(b)&&['calculator','programmer_calculator'].includes(String(b.type)));
  if(object(calculator)){
   const programmer=calculator.type==='programmer_calculator';
   if(value.view.length!==1 || value.capabilities.length!==0 || Object.keys(value.settings).length!==0 || !value.sizeLayouts || Object.values(value.sizeLayouts as Record<string,{rows:number;columns:number}>).some(d=>d.rows<(programmer?3:2)||d.columns<(programmer?2:1)))throw new Error('Calculator requires a dedicated layout without data capabilities');
  }
 }
 const license = new URL(value.license.url); if (license.protocol !== 'https:' || license.username || license.password) throw new Error('Invalid license URL');
 if (!Array.isArray(value.view) || !value.view.length || value.view.length > 12) throw new Error('Invalid view');
 for (const block of value.view) {
  if (!object(block) || !keys(block,['type','data','text','value','href']) || !['runtime','text','number','list','clock','date','link','calculator','programmer_calculator','timer','stopwatch','unit_converter','personal_note','records','runtime'].includes(String(block.type))) throw new Error('Invalid block');
  if(['calculator','programmer_calculator','timer','stopwatch','unit_converter','personal_note'].includes(String(block.type)))throw Error('Built-in tools have moved to SDK v2');
  if(block.type==='runtime'&&value.schemaVersion!==2)throw Error('SDK requires version 2');
  if(block.type==='records'&&!value.storage)throw new Error('Records require storage');
  if (block.data !== undefined && !value.capabilities.includes(block.data)) throw new Error('Undeclared data capability');
  if (block.text !== undefined && !translated(block.text)) throw new Error('Invalid text');
  if (block.type === 'text' && !translated(block.text) || block.type === 'number' && (typeof block.value !== 'number' || !Number.isFinite(block.value))) throw new Error('Invalid value');
  if (['list','clock'].includes(String(block.type)) && block.data === undefined) throw new Error('Missing data');
  if (block.type === 'clock' && block.data !== 'world_clock') throw new Error('Invalid clock');
  if (block.type === 'link' && (!string(block.href,200) || !/^\/(books|my-page|personal-settings|employees)(?:\/[1-9]\d*)?$/.test(block.href) || !translated(block.text))) throw new Error('Only SPH detail links are supported');
  if (['calculator','programmer_calculator','timer','stopwatch','unit_converter','personal_note','records','runtime'].includes(String(block.type)) && !keys(block,['type'])) throw new Error('Interactive block has no configurable code or data');
  if (block.type !== 'link' && block.href !== undefined) throw new Error('Unexpected link');
 }
 return value as unknown as Manifest;
}
export function catalogue(v: unknown): Manifest[] {
 if (!object(v) || !keys(v,['schemaVersion','widgets']) || v.schemaVersion!==1&&v.schemaVersion!==2 || !Array.isArray(v.widgets) || v.widgets.length > 100) throw new Error('Invalid catalogue');
 const items = v.widgets.map(manifest);
 if (new Set(items.map(w => `${w.id}@${w.version}`)).size !== items.length) throw new Error('Duplicate release');
 return items;
}
export function canonical(value: unknown): string {
 if (Array.isArray(value)) return '['+value.map(canonical).join(',')+']';
 if (object(value)) return '{'+Object.keys(value).sort().map(k => JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
 return JSON.stringify(value);
}
export const digest = (v: unknown) => createHash('sha256').update(canonical(v)).digest('hex');
export function settings(def: Manifest, size: unknown, v: unknown): Record<string, string[]> {
 const personalNote=def.view.some(block=>block.type==='personal_note');
 if (!def.sizes.includes(size as never) || !object(v) || !keys(v,['gridPosition',...(def.runtime?['custom']:[]),...(def.capabilities.includes('world_clock')?['clockDesign']:[]),...(personalNote?['title']:[])])) throw new Error('Invalid widget size/settings');
 const result: Record<string,string[]> = {};
 if(def.runtime&&def.configuration&&v.custom===undefined)valuesFor(def.configuration,{});
 if(def.runtime&&v.custom!==undefined){if(!Array.isArray(v.custom)||v.custom.length!==1||typeof v.custom[0]!=='string'||v.custom[0].length>65536||!def.configuration)throw Error('Invalid configuration');result.custom=[JSON.stringify(valuesFor(def.configuration,JSON.parse(v.custom[0])))];}

 // Renderer-owned position: column count, one-based column, one-based row.
 if(v.gridPosition!==undefined){
  if(!Array.isArray(v.gridPosition)||v.gridPosition.length!==3||!v.gridPosition.every(n=>typeof n==='string'&&/^[1-9]\d{0,2}$/.test(n)))throw new Error('Invalid grid position');
  const [columns,column,row]=v.gridPosition.map(Number);
  const width=def.sizeLayouts[size as string].columns;
  if(columns>9||column+Math.min(width,columns)-1>columns||row>320)throw new Error('Invalid grid position');
  result.gridPosition=[...v.gridPosition];
 }
 // Renderer-owned display preference; immutable approved manifests remain unchanged.
 if(v.title!==undefined){
  if(!Array.isArray(v.title)||v.title.length!==1||typeof v.title[0]!=='string'||v.title[0].length>40||/[\r\n\u2028\u2029\0]/u.test(v.title[0]))throw new Error('Invalid note title');
  result.title=[v.title[0].trim()];
 }
 if (v.clockDesign !== undefined) {
  if (!Array.isArray(v.clockDesign) || v.clockDesign.length !== 1 || !['digital','analog'].includes(v.clockDesign[0] as string)) throw new Error('Invalid clock design');
  result.clockDesign = v.clockDesign as string[];
 }
 return result;
}
