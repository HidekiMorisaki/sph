import type {Project,TicketType,TicketStatus,TypeStatus} from './projects';
export type SettingsSection='types'|'statuses'|'mappings';
export type SettingsConfig={types:TicketType[];statuses:TicketStatus[];typeStatuses:TypeStatus[]};
export const typeRows=(rows:TicketType[])=>rows.map(({id,name,position,milestone},i)=>({id,name,position:i,milestone:milestone??false}));
export const statusRows=(rows:TicketStatus[])=>rows.map(({id,name,category},i)=>({id,name,category,position:i}));
export const linkRows=(rows:TypeStatus[])=>rows.map(({typeId,statusId,position,initial})=>({typeId,statusId,position,initial})).sort((a,b)=>a.typeId-b.typeId||a.position-b.position||a.statusId-b.statusId);
export const settingsConfig=(p:SettingsConfig):SettingsConfig=>({types:typeRows(p.types),statuses:statusRows(p.statuses),typeStatuses:linkRows(p.typeStatuses)});
export function settingsPayload(p:SettingsConfig,revision:number,section:SettingsSection,draft:SettingsConfig,replacements:Record<string,string>={},typeReplacements:Record<string,string>={}){
 const current=settingsConfig(p),next=settingsConfig(p),map:Record<string,number>=Object.fromEntries(Object.entries(replacements).filter(([,v])=>v!=='').map(([k,v])=>[k,Number(v)]));
 if(section==='types'){
  next.types=typeRows(draft.types);const ids=new Set(next.types.map(t=>t.id));next.typeStatuses=next.typeStatuses.filter(l=>ids.has(l.typeId));
  const initial=current.statuses.find(s=>!['done','cancelled'].includes(s.category));
  for(const type of next.types.filter(t=>t.id<0))next.typeStatuses.push(...current.statuses.map((s,i)=>({typeId:type.id,statusId:s.id,position:i,initial:s.id===initial?.id})));
 }else if(section==='statuses'){
  next.statuses=statusRows(draft.statuses);const ids=new Set(next.statuses.map(s=>s.id));const links:TypeStatus[]=[];
  for(const old of current.typeStatuses){const statusId=ids.has(old.statusId)?old.statusId:map[old.typeId+':'+old.statusId];if(statusId===undefined)continue;const existing=links.find(l=>l.typeId===old.typeId&&l.statusId===statusId);if(existing){existing.initial ||= old.initial;existing.position=Math.min(existing.position,old.position);}else links.push({...old,statusId});}
  for(const type of current.types){const selected=map['initial:'+type.id];if(selected!==undefined){for(const link of links.filter(l=>l.typeId===type.id))link.initial=link.statusId===selected;if(!links.some(l=>l.typeId===type.id&&l.statusId===selected))links.push({typeId:type.id,statusId:selected,position:links.length,initial:true});}}
  next.typeStatuses=links;
 }else next.typeStatuses=linkRows(draft.typeStatuses);
 return {...next,revision,typeMigrations:section==='types'?Object.fromEntries(Object.entries(typeReplacements).filter(([,v])=>v).map(([k,v])=>[k,Number(v)])):{},statusMigrations:map};
}
export function rebaseMappings(before:SettingsConfig,after:SettingsConfig,draft:TypeStatus[]){
 const output:TypeStatus[]=[];const statusIds=new Set(after.statuses.map(s=>s.id));
 for(const type of after.types){const previous=linkRows(before.typeStatuses.filter(l=>l.typeId===type.id)),edited=linkRows(draft.filter(l=>l.typeId===type.id));const changed=JSON.stringify(previous)!==JSON.stringify(edited);output.push(...(changed?edited.filter(l=>statusIds.has(l.statusId)):after.typeStatuses.filter(l=>l.typeId===type.id)));}
 return linkRows(output);
}
