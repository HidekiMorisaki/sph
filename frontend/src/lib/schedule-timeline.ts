import { DateTime } from 'luxon';
import type { ScheduleItem } from './schedule';

export function timelineDays(date:string,view:'day'|'week',firstDay:number,zone:string) {
 let start=DateTime.fromISO(date,{zone}).startOf('day');
 if(view==='week')start=start.minus({days:(start.weekday%7-firstDay+7)%7});
 return Array.from({length:view==='week'?7:1},(_,index)=>{
  const day=start.plus({days:index}),end=day.plus({days:1});
  // Use actual instants: DST days can contain 23 or 25 hours.
  const hours=end.diff(day,'hours').hours;
  return {date:day.toISODate()!,start:day.toMillis(),end:end.toMillis(),hours,
   ticks:Array.from({length:Math.ceil(hours)},(_,hour)=>({hour,label:day.plus({hours:hour}).toFormat('HH:mm'),offset:day.plus({hours:hour}).toFormat('ZZ')}))};
 });
}

export function timelineEvents(items:ScheduleItem[],start:number,end:number,zone?:string) {
 const spans=items.filter(item=>!item.allDay||zone!==undefined).map(item=>({item,start:Math.max(start,DateTime.fromISO(item.start,{zone}).toMillis()),end:Math.min(end,DateTime.fromISO(item.end,{zone}).toMillis())}))
  .filter(span=>span.start<span.end).sort((a,b)=>a.start-b.start||b.end-a.end||a.item.key.localeCompare(b.item.key));
 const lanes:number[]=[];
 return spans.map(span=>{
  let lane=lanes.findIndex(end=>end<=span.start);if(lane<0)lane=lanes.length;lanes[lane]=span.end;
  return {...span,lane,left:(span.start-start)/3600000,width:(span.end-span.start)/3600000};
 });
}
