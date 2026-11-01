import { DateTime } from 'luxon';
import { throwApiError } from '$lib/server/api/response';
export function calendarQuery(url:URL,actorId:number,timeZone='UTC') {
 const start=new Date(url.searchParams.get('start')??''),end=new Date(url.searchParams.get('end')??'');
 if(!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end<=start || DateTime.fromJSDate(end,{zone:timeZone}).diff(DateTime.fromJSDate(start,{zone:timeZone}),'days').days>42.001) throwApiError(422,'INVALID_RANGE','Choose a range of at most 42 days.');
 const calendars=(url.searchParams.get('calendars')??`employee:${actorId}`).split(',');
 if(!calendars.length || calendars.length>20 || new Set(calendars).size!==calendars.length || calendars.some(c=> !/^(employee|resource):[1-9]\d*$/.test(c) || !Number.isSafeInteger(Number(c.split(':')[1])))) throwApiError(422,'INVALID_CALENDARS','Choose up to 20 calendars.');
 const employees=calendars.filter(c=>c.startsWith('employee:')).map(c=>Number(c.split(':')[1]));
 const resources=calendars.filter(c=>c.startsWith('resource:')).map(c=>Number(c.split(':')[1]));
 return {start,end,calendars,employees,resources};
}
