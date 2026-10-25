import { DateTime, IANAZone } from 'luxon';
import rrule from 'rrule';
const { RRule } = rrule;

export class ScheduleInputError extends Error {
 field: string;
 reason: string;
 constructor(field: string, reason: string) { super(`${field}: ${reason}`); this.field=field; this.reason=reason; }
}
function invalid(field: string, reason = 'INVALID_VALUE'): never { throw new ScheduleInputError(field, reason); }
export type Recurrence = { frequency: 'daily' | 'weekly' | 'monthly' | 'yearly'; interval: number; count?: number; until?: string; weekdays?: number[]; monthDay?: number };
export type EventInput = {
 title: string; description: string; location: string; visibility: 'public' | 'private';
 timeZone: string; allDay: boolean; start: string; end: string; startOffset?: number; endOffset?: number;
 attendeeIds: number[]; resourceIds: number[]; recurrence: Recurrence | null;
};
export type Slot = { startsAt: Date; endsAt: Date; startDate: Date | null; endDate: Date | null };
export function zone(value: unknown): string {
 if (typeof value !== 'string' || value.length > 64 || !IANAZone.isValidZone(value)) invalid('timeZone');
 return value;
}
export function localInstant(value: string, timeZone: string, offset?: number): DateTime {
 if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(value)) invalid('start/end');
 const dt = DateTime.fromISO(value, { zone: timeZone });
 if (!dt.isValid || dt.toFormat("yyyy-MM-dd'T'HH:mm") !== value) invalid('start/end', 'NONEXISTENT_LOCAL_TIME');
 const possible = dt.getPossibleOffsets();
 if (possible.length > 1 && offset === undefined) invalid('start/end', 'AMBIGUOUS_LOCAL_TIME_SELECT_OFFSET');
 const chosen = offset === undefined ? dt : possible.find(d => d.offset === offset);
 return chosen ?? invalid('start/end', 'INVALID_OFFSET');
}
export function inputEvent(raw: unknown): EventInput {
 if (!raw || typeof raw !== 'object' || Array.isArray(raw)) invalid('body');
 const b = raw as Record<string, unknown>;
 const text = (key: string, max: number, required = false) => {
  const v = b[key] ?? ''; if (typeof v !== 'string' || v.length > max || required && !v.trim()) invalid(key); return v.trim();
 };
 const ids = (key: string, max: number) => {
  const v = b[key] ?? []; if (!Array.isArray(v) || v.length > max || v.some(i => !Number.isSafeInteger(i) || i <= 0) || new Set(v).size !== v.length) invalid(key);
  return v as number[];
 };
 if (b.visibility !== 'public' && b.visibility !== 'private') invalid('visibility');
 if (typeof b.allDay !== 'boolean') invalid('allDay');
 const result: EventInput = { title: text('title',255,true), description:text('description',10000), location:text('location',500), visibility:b.visibility,
  timeZone:zone(b.timeZone), allDay:b.allDay, start:text('start',16,true), end:text('end',16,true), attendeeIds:ids('attendeeIds',200), resourceIds:ids('resourceIds',1), recurrence:null };
 for (const key of ['startOffset','endOffset'] as const) if (b[key] !== undefined) { if (!Number.isInteger(b[key]) || Math.abs(Number(b[key])) > 840) invalid(key); result[key] = Number(b[key]); }
 if (b.recurrence != null) {
  const r = b.recurrence as Record<string,unknown>;
  if (!['daily','weekly','monthly','yearly'].includes(String(r.frequency)) || !Number.isInteger(r.interval) || Number(r.interval) < 1 || Number(r.interval) > 365) invalid('recurrence');
  if ((r.count == null) === (r.until == null)) invalid('recurrence', 'EXACTLY_ONE_END_REQUIRED');
  if (r.count != null && (!Number.isInteger(r.count) || Number(r.count) < 1 || Number(r.count) > 366)) invalid('recurrence.count');
  if (r.until != null && (typeof r.until !== 'string' || !/^\d{4}-\d\d-\d\d$/.test(r.until) || !DateTime.fromISO(r.until).isValid)) invalid('recurrence.until');
  if (r.weekdays != null && (!Array.isArray(r.weekdays) || !r.weekdays.length || r.weekdays.some(d => !Number.isInteger(d) || d < 0 || d > 6))) invalid('recurrence.weekdays');
  if (r.monthDay != null && (!Number.isInteger(r.monthDay) || Number(r.monthDay) < 1 || Number(r.monthDay) > 31)) invalid('recurrence.monthDay');
  result.recurrence = {frequency:r.frequency as Recurrence['frequency'], interval:Number(r.interval), ...(r.count != null ? {count:Number(r.count)} : {until:String(r.until)}), ...(r.weekdays ? {weekdays:r.weekdays as number[]} : {}), ...(r.monthDay ? {monthDay:Number(r.monthDay)} : {})};
 }
 expandSlots(result);
 return result;
}
export function expandSlots(input: EventInput): Slot[] {
 const { timeZone:tz, allDay } = input;
 const date = (v: string) => { if (!/^\d{4}-\d\d-\d\d$/.test(v)) invalid('start/end'); const d=DateTime.fromISO(v,{zone:'UTC'}); if (!d.isValid) invalid('start/end'); return d; };
 const start = allDay ? date(input.start) : localInstant(input.start,tz,input.startOffset);
 const end = allDay ? date(input.end) : localInstant(input.end,tz,input.endOffset);
 if (end.toMillis() <= start.toMillis()) invalid('end','END_AFTER_START_REQUIRED');
 const wallStart = DateTime.fromObject(start.toObject(), {zone:'UTC'}), wallEnd = DateTime.fromObject(end.toObject(),{zone:'UTC'});
 const duration = wallEnd.toMillis()-wallStart.toMillis();
 if (duration <= 0 || duration > 366*86400000) invalid('end','INVALID_DURATION');
 let dates = [wallStart.toJSDate()];
 if (input.recurrence) {
  const r=input.recurrence, max=wallStart.plus({years:1});
  const until=r.until ? date(r.until).endOf('day') : max;
  if (until < wallStart || until > max.endOf('day')) invalid('recurrence','MAXIMUM_ONE_YEAR');
  const frequencies={daily:RRule.DAILY,weekly:RRule.WEEKLY,monthly:RRule.MONTHLY,yearly:RRule.YEARLY};
  dates=new RRule({freq:frequencies[r.frequency],interval:r.interval,dtstart:wallStart.toJSDate(),until:until.toJSDate(),count:r.count,byweekday:r.weekdays?.map(d => [RRule.SU,RRule.MO,RRule.TU,RRule.WE,RRule.TH,RRule.FR,RRule.SA][d]),bymonthday:r.monthDay}).all();
  if (!dates.length || dates.length>366 || r.count && dates.length !== r.count) invalid('recurrence','MAXIMUM_ONE_YEAR_OR_366');
 }
 const slots:Slot[]=[];
 for (const d of dates) {
  const a=DateTime.fromJSDate(d,{zone:'UTC'}), b=a.plus({milliseconds:duration});
  if(allDay) slots.push({startsAt:DateTime.fromISO(a.toISODate()!,{zone:tz}).toJSDate(),endsAt:DateTime.fromISO(b.toISODate()!,{zone:tz}).toJSDate(),startDate:a.toJSDate(),endDate:b.toJSDate()});
  else try { const offsetFor=(v:string,offset:number|undefined)=>input.recurrence&&DateTime.fromISO(v,{zone:tz}).getPossibleOffsets().length===1?undefined:offset;const av=a.toFormat("yyyy-MM-dd'T'HH:mm"),bv=b.toFormat("yyyy-MM-dd'T'HH:mm"); slots.push({startsAt:localInstant(av,tz,offsetFor(av,input.startOffset)).toJSDate(),endsAt:localInstant(bv,tz,offsetFor(bv,input.endOffset)).toJSDate(),startDate:null,endDate:null}); }
  catch(error) { if (!input.recurrence || !(error instanceof ScheduleInputError) || error.reason !== 'NONEXISTENT_LOCAL_TIME') throw error; }
 }
 if (!slots.length) invalid('recurrence');
 return slots;
}
