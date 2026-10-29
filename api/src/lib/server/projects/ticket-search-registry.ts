import {ticketCodeExpression} from './codes';
import type {SearchContext, SearchField} from '../api/search-registry';
export const ticketSorts = ['id','number','code','title','project','type','status','assignee','priority','startsOn','dueOn','createdAt','updatedAt'] as const;
const specs: Array<[string,string,string,SearchField['type'],string]> = [
 ['code','チケットコード','Ticket code','string',ticketCodeExpression],
 ['project','プロジェクト','Project','choice','p.id::text'],['projectStatus','プロジェクトの状態','Project status','choice','p.status'],
 ['title','件名','Title','string','t.title'],
 ['type','種別','Type','choice','t.type_id::text'],['status','状態','Status','choice','t.status_id::text'],
 ['category','状態区分','Status category','choice','s.category'],['assignee','担当者','Assignee','choice','t.assignee_id::text'],
 ['priority','優先度','Priority','choice','t.priority'],['startsOn','開始日','Start date','date','t.starts_on'],
 ['dueOn','期限','Due date','date','t.due_on'],['createdAt','作成日時','Created at','datetime','t.created_at'],['updatedAt','更新日時','Updated at','datetime','t.updated_at']
];
export const ticketSearchContexts: SearchContext[] = [{code:'ticket',label:{ja:'チケット',en:'Ticket'},category:'basic',from:'',link:'',fields:specs.map(([code,ja,en,type,expression])=>({
 code,label:{ja,en},type,expression,source:'ProjectTicket.'+code,maxLength:500,
 ...(['project','type','status','assignee'].includes(code)?{reference:{table:'project_ticket_'+code,key:'id',name:'name'}}:{}),
 ...(code==='projectStatus'?{choices:['active','on_hold','completed','archived']}:code==='category'?{choices:['open','active','done','cancelled']}:code==='priority'?{choices:['low','normal','high','urgent']}: {})
}))}];
