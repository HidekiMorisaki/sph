export type CalendarChoice={key:string;name:string;color:string;visible:boolean};
export type ScheduleSettings={view:'day'|'week'|'month';mode:'overlay'|'side';firstDay:0|1;timeAxis?:'vertical'|'horizontal';calendars:CalendarChoice[]};
export type ScheduleItem={key:string;eventKey?:string;revision?:number;sequence?:number;recurring?:boolean;recurrence?:ScheduleDraft['recurrence'];recurrenceFromSequence?:number;isException?:boolean;start:string;end:string;allDay:boolean;timeZone:string;title:string|null;description?:string;location?:string;visibility?:'public'|'private';organizerId?:number;detailAvailable:boolean;canEdit?:boolean;canceled:boolean;calendarKeys?:string[];participants?:{employeeId:number;name:string;response:string}[];resources?:{id:number;name:string;reservationId:number}[]};
export type EmployeeChoice={id:number;employeeCode:string;name:string;branch:{id:number;name:string};departments:{id:number;name:string}[]};
export type RoomChoice={id:number;timeZone:string;room:{id:number;name:string;branch:{id:number;name:string}}};
export type ScheduleDraft={title:string;description:string;location:string;visibility:'public'|'private';timeZone:string;allDay:boolean;start:string;end:string;startOffset?:number;endOffset?:number;attendeeIds:number[];resourceIds:number[];recurrence:null|{frequency:'daily'|'weekly'|'monthly'|'yearly';interval:number;count?:number;until?:string;weekdays?:number[];monthDay?:number}};
export class ScheduleRequestError extends Error {constructor(public code:string){super(code);}}
export async function scheduleRequest<T>(url:string,method='GET',body?:unknown,headers:Record<string,string>={},signal?:AbortSignal):Promise<{data:T;meta:Record<string,unknown>}> {
 const response=await fetch(url,{method,signal,headers:{...(body===undefined?{}:{'content-type':'application/json'}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
 const result=await response.json().catch(()=>null);
 if(!response.ok||result?.status!=='success'||result.responseCode!==response.status)throw new ScheduleRequestError(result?.error?.code??'NETWORK_ERROR');
 return {data:result.data,meta:result.meta??{}};
}
export async function allSchedulePages<T>(path:string,signal?:AbortSignal):Promise<T[]> {
 const result:T[]=[];let offset=0;
 while(true) {const url=new URL(path,location.origin);url.searchParams.set('limit','500');url.searchParams.set('offset',String(offset));const page=await scheduleRequest<T[]>(url.pathname+url.search,'GET',undefined,{},signal);result.push(...page.data);if(!page.meta.hasMore)return result;if(!page.data.length)throw new Error('INCOMPLETE_PAGE');offset+=page.data.length;}
}
