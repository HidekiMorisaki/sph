export type GanttPeriod={from:string;to:string};
type DatedTicket={startsOn?:string|null;dueOn?:string|null};
export const GANTT_DAY=86400000;
export function validGanttDay(value:string):boolean{
 if(!/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const date=new Date(value+'T00:00:00Z');return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value;
}
export function validGanttPeriod(period:GanttPeriod):boolean{return validGanttDay(period.from)&&validGanttDay(period.to)&&period.from<=period.to;}
export function automaticGanttPeriod(tickets:DatedTicket[],today:string):GanttPeriod{
 const dates=tickets.flatMap(t=>[t.startsOn,t.dueOn]).filter((v):v is string=>typeof v==='string').map(v=>v.slice(0,10)).filter(validGanttDay).sort();
 return {from:dates[0]??today,to:dates.at(-1)??today};
}
export function ganttPeriodBounds(period:GanttPeriod){
 const start=Date.parse(period.from+'T00:00:00Z'),end=Date.parse(period.to+'T00:00:00Z')+GANTT_DAY;
 return {start,end,duration:end-start,days:(end-start)/GANTT_DAY};
}
export function clipGanttTicket(ticket:DatedTicket,period:GanttPeriod){
 const from=(ticket.startsOn??ticket.dueOn)?.slice(0,10),to=(ticket.dueOn??ticket.startsOn)?.slice(0,10);
 if(!from||!to||!validGanttDay(from)||!validGanttDay(to))return null;
 const bounds=ganttPeriodBounds(period),a=Date.parse(from+'T00:00:00Z'),b=Date.parse(to+'T00:00:00Z');
 const start=Math.max(bounds.start,Math.min(a,b)),end=Math.min(bounds.end,Math.max(a,b)+GANTT_DAY);
 if(start>=end)return null;
 return {left:(start-bounds.start)/bounds.duration*100,width:(end-start)/bounds.duration*100,from:new Date(start).toISOString().slice(0,10),to:new Date(end-GANTT_DAY).toISOString().slice(0,10)};
}
export function ganttTicks(period:GanttPeriod){
 const bounds=ganttPeriodBounds(period),count=Math.min(5,bounds.days);
 return Array.from({length:count},(_,index)=>{const offset=count===1?0:Math.floor((bounds.days-1)*index/(count-1));return {part:offset/bounds.days,date:new Date(bounds.start+offset*GANTT_DAY).toISOString().slice(0,10)};});
}
