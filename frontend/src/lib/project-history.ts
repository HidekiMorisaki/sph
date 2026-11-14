import {customValueLabel,type CustomValue} from './project-custom-fields';
import {formatHours} from './project-time';
import type {Project} from './projects';
const labels:Record<string,[string,string]>={title:['件名','Title'],description:['説明','Description'],typeId:['種別','Type'],statusId:['状態','Status'],parentCode:['親チケット','Parent ticket'],assigneeId:['担当者','Assignee'],priority:['優先度','Priority'],startsOn:['開始日','Start date'],dueOn:['期限','Due date'],estimatedMinutes:['見積工数（時間）','Estimated hours'],labels:['ラベル','Labels'],position:['表示順','Order'],body:['コメント','Comment'],workDate:['作業日','Work date'],minutes:['作業時間（時間）','Hours'],note:['作業内容','Work notes'],name:['名称','Name'],visibility:['公開範囲','Visibility'],status:['プロジェクトの状態','Project status'],employeeId:['社員','Employee'],role:['参加者の役割','Member role']};
export function historyTitle(kind:string,ja:boolean){
 const direct:Record<string,[string,string]>={'project.custom_fields_updated':['カスタム項目の設定を変更','Custom field settings updated'],'ticket.custom_fields_updated':['カスタム項目を変更','Custom fields updated'],'project.created':['プロジェクトを作成','Project created'],'project.updated':['プロジェクトを変更','Project updated'],'project.deleted':['プロジェクトを削除','Project deleted'],'project.member_changed':['参加者・役割を変更','Membership changed'],'project.settings_updated':['種別・状態設定を変更','Types and statuses updated'],'ticket.created':['チケットを作成','Ticket created'],'ticket.updated':['チケットを変更','Ticket updated'],'ticket.deleted':['チケットを削除','Ticket deleted'],'ticket.settings_migration':['設定変更に伴い種別・状態を移行','Ticket type/status migrated']};
 if(direct[kind])return direct[kind][ja?0:1];
 const [,resource,verb]=kind.split('.'),resources:Record<string,[string,string]>={comments:['コメント','Comment'],checklists:['チェックリスト','Checklist'], 'time-entries':['工数','Time entry'],watchers:['ウォッチ設定','Watch settings'],relations:['関連付け','Relation'],attachments:['添付','Attachment']};
 return (resources[resource]?.[ja?0:1]??(ja?'チケット':'Ticket'))+(ja?(verb==='delete'?'を削除':verb==='post'?'を追加':'を変更'):(verb==='delete'?' removed':verb==='post'?' added':' updated'));
}
export function historyLines(detail:unknown,p:Project,ja:boolean):string[]{
 if(!detail||typeof detail!=='object')return [];const d=detail as Record<string,unknown>,before=d.before as Record<string,unknown>|undefined,after=d.after as Record<string,unknown>|undefined;
 const name=(key:string)=>labels[key]?.[ja?0:1]??key;
 const value=(key:string,v:unknown):string=>{
  if(v==null||v==='')return '—';if(['estimatedMinutes','minutes'].includes(key)&&Number.isFinite(Number(v)))return formatHours(Number(v));if(key==='typeId')return p.types.find(t=>t.id===v)?.name??(ja?'削除済み':'Deleted');if(key==='statusId')return p.statuses.find(s=>s.id===v)?.name??(ja?'削除済み':'Deleted');
  if(['employeeId','assigneeId'].includes(key)){const person=p.members.find(m=>m.employeeId===v)?.employee;return person?person.lastName+' '+person.firstName:(ja?'社員情報なし':'Employee unavailable');}
  if(['startsOn','dueOn','workDate'].includes(key)&&typeof v==='string')return v.slice(0,10);
  if(Array.isArray(v))return v.join(', ');const choices:Record<string,[string,string]>={private:['参加者限定','Members only'],internal:['社内公開','Internal'],manager:['管理者','Manager'],editor:['編集者','Editor'],viewer:['閲覧者','Viewer'],removed:['参加解除','Removed'],active:['進行中','Active'],on_hold:['保留','On hold'],completed:['完了','Completed'],archived:['アーカイブ','Archived'],low:['低','Low'],normal:['通常','Normal'],high:['高','High'],urgent:['緊急','Urgent']};return choices[String(v)]?.[ja?0:1]??String(v);
 };
 if((before||after)&&[...Object.keys(before??{}),...Object.keys(after??{})].some(k=>/^[1-9]\d*$/.test(k)))return [...new Set([...Object.keys(before??{}),...Object.keys(after??{})])].filter(k=>JSON.stringify(before?.[k])!==JSON.stringify(after?.[k])).map(k=>{const f=p.customFields?.find(f=>f.id===Number(k));return (f?.name??k)+': '+(f?customValueLabel(f,before?.[k] as CustomValue,ja):String(before?.[k]??'—'))+' → '+(f?customValueLabel(f,after?.[k] as CustomValue,ja):String(after?.[k]??'—'));});
 if(before||after)return Object.keys(labels).filter(key=>(key in (before??{})||key in (after??{}))&&JSON.stringify(before?.[key])!==JSON.stringify(after?.[key])).map(key=>name(key)+': '+value(key,before?.[key])+' → '+value(key,after?.[key]));
 if(Array.isArray(d.fields))return [ (ja?'変更項目：':'Updated fields: ')+d.fields.filter(k=>typeof k==='string'&&k!=='revision').map(k=>name(String(k))).join(', ')];
 if(Array.isArray(d.types)&&Array.isArray(d.statuses))return [(ja?'種別：':'Types: ')+d.types.map(t=>(t as {name:string}).name).join(', '),(ja?'状態：':'Statuses: ')+d.statuses.map(s=>(s as {name:string}).name).join(', ')];
 return Object.keys(labels).filter(key=>key in d).map(key=>name(key)+': '+value(key,d[key]));
}
