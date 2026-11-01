import { DateTime } from 'luxon';
import type { ScheduleDraft } from './schedule';

/** Only complete, unambiguous intervals are eligible for background checking. */
export function canCheckScheduleAvailability(input:ScheduleDraft) {
 const repeat=input.recurrence;
 if(repeat){
  if(!Number.isInteger(repeat.interval)||repeat.interval<1||repeat.interval>365)return false;
  if(repeat.count!==undefined&&(!Number.isInteger(repeat.count)||repeat.count<1||repeat.count>366))return false;
  if(repeat.count===undefined&&!repeat.until)return false;
  if(repeat.until&&(!DateTime.fromISO(repeat.until,{zone:'UTC'}).isValid||repeat.until<input.start.slice(0,10)))return false;
 }
 const parse=(value:string,offset:number|undefined)=>{
  const date=DateTime.fromISO(value,{zone:input.allDay?'UTC':input.timeZone});
  if(!date.isValid||date.toFormat(input.allDay?'yyyy-MM-dd':"yyyy-MM-dd'T'HH:mm")!==value)return null;
  if(input.allDay)return date;
  const choices=date.getPossibleOffsets();
  if(choices.length>1&&offset===undefined)return null;
  return offset===undefined?date:choices.find(choice=>choice.offset===offset)??null;
 };
 const start=parse(input.start,input.startOffset),end=parse(input.end,input.endOffset);
 return !!start&&!!end&&end.toMillis()>start.toMillis()&&input.end>input.start;
}
