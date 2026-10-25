import { DateTime } from 'luxon';

// Match the server's wall-clock validation. A gap is invalid, not ambiguous.
export function ambiguousScheduleOffsets(value:string,timeZone:string) {
 if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))return [];
 const date=DateTime.fromISO(value,{zone:timeZone});
 if(!date.isValid||date.toFormat("yyyy-MM-dd'T'HH:mm")!==value)return [];
 const choices=date.getPossibleOffsets().sort((a,b)=>a.toMillis()-b.toMillis());
 if(choices.length<2)return [];
 return choices.map(choice=>({offset:choice.offset,label:`${choice.offset} (UTC${choice.toFormat('ZZ')})`}));
}

export function scheduleSubmissionOffset(value:string,timeZone:string,selected:number|undefined,repeating:boolean) {
 const ambiguous=ambiguousScheduleOffsets(value,timeZone);
 if(ambiguous.length)return ambiguous.some(choice=>choice.offset===selected)?selected:undefined;
 if(!repeating)return undefined;
 const date=DateTime.fromISO(value,{zone:timeZone});
 // The existing recurrence API needs the unambiguous anchor's offset when a
 // later occurrence repeats a wall-clock time. Never infer an ambiguous anchor.
 return date.isValid&&date.toFormat("yyyy-MM-dd'T'HH:mm")===value?date.offset:undefined;
}
