import type {Project,Relation,Ticket} from './projects';
import type {SearchDefinition} from './search';

export type TicketSearchPage={data:Ticket[];meta:{total:number;searchTotal?:number;projects:Project[];relations:Relation[]}};
export type TicketSearchRequest={definition:SearchDefinition;offset:number;ticketIds?:number[]};
export type TicketPageReader=(body:TicketSearchRequest)=>Promise<TicketSearchPage>;

export function mergeById<T extends {id:number}>(before:T[],after:T[]):T[]{
 return [...new Map([...before,...after].map(row=>[row.id,row])).values()];
}

/** Retain positions inside each column; changed columns and new cards append. */
export function retainPanelOrder(before:Ticket[],order:number[],after:Ticket[]):number[]{
 const old=new Map(before.map(row=>[row.id,row])),next=new Map(after.map(row=>[row.id,row]));
 const retained=order.filter(id=>{const a=old.get(id),b=next.get(id);return a&&b&&a.projectId===b.projectId&&a.statusId===b.statusId;});
 const seen=new Set(retained);
 return [...retained,...after.filter(row=>!seen.has(row.id)).map(row=>row.id)];
}

export class IncompleteTicketSearchError extends Error {
 constructor(){super('INCOMPLETE_TICKET_SEARCH');}
}

/** Stage the whole result; an incomplete offset scan is retried once from zero. */
export async function readAllProjectTickets(read:TicketPageReader,definition:SearchDefinition){
 for(let attempt=0;attempt<2;attempt++){
  const rows=new Map<number,Ticket>(),projects=new Map<number,Project>(),relations=new Map<number,Relation>();
  let offset=0,total:number|undefined;
  try{
   do{
    const page=await read({definition:{...definition,limit:500},offset});
    total??=page.meta.total;
    if(!Number.isSafeInteger(total)||total<0||page.meta.total!==total)throw new IncompleteTicketSearchError();
    for(const row of page.data)rows.set(row.id,row);
    for(const project of page.meta.projects)projects.set(project.id,project);
    for(const relation of page.meta.relations)relations.set(relation.id,relation);
    offset+=page.data.length;
    if(!page.data.length&&offset<total)throw new IncompleteTicketSearchError();
   }while(offset<total);
   if(rows.size!==total)throw new IncompleteTicketSearchError();
   return {rows:[...rows.values()],projects:[...projects.values()],relations:[...relations.values()],total};
  }catch(error){if(!(error instanceof IncompleteTicketSearchError)||attempt===1)throw error;}
 }
 throw new IncompleteTicketSearchError();
}
