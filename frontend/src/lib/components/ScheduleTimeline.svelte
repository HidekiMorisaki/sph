<script lang="ts">
 import { onMount } from 'svelte';
 import { DateTime } from 'luxon';
 import { localization } from '$lib/localization';
 import { scheduleText } from '$lib/schedule-text';
 import { timelineDays,timelineEvents } from '$lib/schedule-timeline';
 import type { ScheduleItem,CalendarChoice } from '$lib/schedule';
 let {view,date,firstDay,items,calendars,context=[],editable,creatable,onOpen,onCreate,onMove,onResize=onMove}:{view:'day'|'week';date:string;firstDay:number;items:ScheduleItem[];calendars:CalendarChoice[];context?:{calendarKey?:string;date:string;kind:string;title:string}[];editable:boolean;creatable:boolean;onOpen:(item:ScheduleItem)=>void;onCreate:(start:string,end:string,allDay:boolean)=>void;onMove:(item:ScheduleItem,start:string,end:string,allDay:boolean)=>void;onResize?:(item:ScheduleItem,start:string,end:string,allDay:boolean)=>void}=$props();
 let text=$derived(scheduleText[$localization.displayLanguage]),days=$derived(timelineDays(date,view,firstDay,$localization.timeZone));
 const eventHeight=48,laneGap=4,contextHeight=24;
 const laneHeight=eventHeight+laneGap;
 let axisWidth=$state(1);
 let hourWidth=$derived(axisWidth/days[0].hours),dayWidth=$derived(axisWidth/7);
 let hourLabelStep=$derived(Math.max(1,Math.ceil(60/hourWidth)));
 let scroller:HTMLDivElement;
 let gesture=$state<{item:ScheduleItem;resize:boolean;x:number;y:number;start:number;end:number;moved:boolean}|null>(null);
 let suppressClick=false;
 let displayed=$derived(gesture?.moved?items.map(item=>item.key===gesture?.item.key?{...item,start:DateTime.fromMillis(gesture.start,{zone:$localization.timeZone}).toISO()!,end:DateTime.fromMillis(gesture.end,{zone:$localization.timeZone}).toISO()!}:item):items);
 let range=$derived({start:days[0].start,end:days[days.length-1].end});
 let rows=$derived(calendars.map(calendar=>{
  const selected=displayed.filter(item=>item.calendarKeys?.includes(calendar.key));
  const events=view==='week'
   ?days.flatMap((day,index)=>timelineEvents(selected,day.start,day.end,$localization.timeZone).map((event,lane)=>({...event,lane,left:index,width:1,dayStart:day.start})))
   :timelineEvents(selected,range.start,range.end,$localization.timeZone).map(event=>({...event,dayStart:range.start}));
  return {calendar,events,height:Math.max(80,(Math.max(-1,...events.map(event=>event.lane))+1)*laneHeight+contextHeight+8),context:context.filter(entry=>!entry.calendarKey||entry.calendarKey===calendar.key)};
 }));
 onMount(()=>{
  const measure=()=>{axisWidth=Math.max(1,scroller.clientWidth-parseFloat(getComputedStyle(scroller).getPropertyValue('--label-width')));scroller.scrollLeft=0;};
  measure();const observer=new ResizeObserver(measure);observer.observe(scroller);return()=>observer.disconnect();
 });
 function eventLeft(event:{left:number}){return view==='week'?event.left*dayWidth+3:event.left*hourWidth;}
 function eventWidth(event:{left:number;width:number}){return view==='week'?Math.max(1,dayWidth-6):Math.min(Math.max(8,event.width*hourWidth),axisWidth-event.left*hourWidth);}
 function color(item:ScheduleItem){return calendars.find(calendar=>item.calendarKeys?.includes(calendar.key))?.color??'#2563eb';}
 function label(item:ScheduleItem){return `${item.title??text.busy} · ${item.allDay?text.allDay+' · '+item.start:DateTime.fromISO(item.start,{zone:$localization.timeZone}).toFormat('M/d HH:mm')}–${item.allDay?item.end:DateTime.fromISO(item.end,{zone:$localization.timeZone}).toFormat('M/d HH:mm')}`;}
 function create(start:number,end:number){onCreate(DateTime.fromMillis(start,{zone:$localization.timeZone}).toISO()!,DateTime.fromMillis(end,{zone:$localization.timeZone}).toISO()!,false);}
 function begin(event:PointerEvent,item:ScheduleItem,resize=false){
  if(event.button!==0||!editable||!item.canEdit||item.allDay)return;
  (event.currentTarget as HTMLElement).focus({preventScroll:true});
  gesture={item,resize,x:event.clientX,y:event.clientY,start:DateTime.fromISO(item.start).toMillis(),end:DateTime.fromISO(item.end).toMillis(),moved:false};
 }
 function pointerMove(event:PointerEvent){
  if(!gesture||event.buttons!==1)return;
  const track=document.elementFromPoint(event.clientX,event.clientY)?.closest<HTMLElement>('.timeline-track');
  if(!track||!scroller.contains(track))return;
  if(!gesture.moved&&Math.hypot(event.clientX-gesture.x,event.clientY-gesture.y)<6)return;
  const start=DateTime.fromISO(gesture.item.start,{zone:$localization.timeZone}),end=DateTime.fromISO(gesture.item.end,{zone:$localization.timeZone});
  const steps=Math.round((event.clientX-gesture.x)/(view==='week'?dayWidth:hourWidth/2));
  const shift=view==='week'?{days:steps}:{minutes:steps*30};
  const movedStart=gesture.resize?start:start.plus(shift),movedEnd=end.plus(shift);
  if(movedEnd<=movedStart)return;
  gesture={...gesture,moved:true,start:movedStart.toMillis(),end:movedEnd.toMillis()};
 }
 function finish(){
  const previous=gesture;gesture=null;if(!previous?.moved)return;
  suppressClick=true;setTimeout(()=>suppressClick=false,0);
  if(previous.start===DateTime.fromISO(previous.item.start).toMillis()&&previous.end===DateTime.fromISO(previous.item.end).toMillis())return;
  (previous.resize?onResize:onMove)(previous.item,DateTime.fromMillis(previous.start,{zone:$localization.timeZone}).toISO()!,DateTime.fromMillis(previous.end,{zone:$localization.timeZone}).toISO()!,false);
 }
 function open(item:ScheduleItem){if(!suppressClick)onOpen(item);}
</script>
<svelte:window onpointermove={pointerMove} onpointerup={finish} onpointercancel={()=>gesture=null} onkeydown={event=>{if(event.key==='Escape')gesture=null;}} onblur={()=>gesture=null}/>
<!-- svelte-ignore a11y_no_noninteractive_tabindex (The scroll region needs keyboard scrolling.) -->
<div class="schedule-timeline" bind:this={scroller} role="region" aria-label={`${text.title} · ${text.horizontal}`} tabindex="0" class:week-view={view==='week'} style={`--timeline-width:${axisWidth}px;--event-height:${eventHeight}px`}>
 <div class="timeline-header">
  <div class="corner">{text.calendars}</div>
  <div class="timeline-dates">
   {#each days as day(day.date)}
    <div class="timeline-date" style={`width:${view==='week'?dayWidth:axisWidth}px`}>
     <div class="date-heading" title={day.date} class:today={day.date===DateTime.now().setZone($localization.timeZone).toISODate()}><span class="full-date">{DateTime.fromISO(day.date).toFormat('M/d')}</span><span class="short-date">{Number(day.date.slice(-2))}</span><small>{DateTime.fromISO(day.date).setLocale($localization.displayLanguage).toFormat('ccc')}</small></div>
     {#if view==='day'}<div class="hours" aria-hidden="true">{#each day.ticks as tick}<span style={`width:${Math.min(1,day.hours-tick.hour)*hourWidth}px`} title={`${tick.label} UTC${tick.offset}`}>{#if tick.hour%hourLabelStep===0&&day.hours-tick.hour>=Math.min(hourLabelStep,day.hours)}<i>{tick.label}</i>{/if}</span>{/each}</div>{/if}
    </div>
   {/each}
  </div>
 </div>
 {#each rows as row(row.calendar.key)}
  <section class="timeline-calendar-row" aria-label={row.calendar.name} data-calendar={row.calendar.key}>
   <div class="calendar-label" style={`--calendar-color:${row.calendar.color}`}>
    <strong>{row.calendar.name}</strong>
   </div>
   <div class="timeline-track" data-start={range.start} style={`height:${row.height}px`}>
    {#each days as day(day.date)}
     {@const offset=view==='week'?days.indexOf(day)*dayWidth:0}
     <div class="day-slots" style={`left:${offset}px;width:${view==='week'?dayWidth:axisWidth}px`}>
      {#each row.context.filter(entry=>entry.date===day.date) as entry}<div class="context-day" class:working={entry.kind==='working_day'}><span>{entry.title}</span></div>{/each}
      <div class="time-slots">{#each Array.from({length:view==='week'?1:Math.round(day.hours*2)},(_,index)=>index) as index}<button type="button" class="time-slot" disabled={!creatable} aria-label={`${text.create} · ${row.calendar.name} · ${view==='week'?day.date:DateTime.fromMillis(day.start+index*1800000,{zone:$localization.timeZone}).toFormat('yyyy-MM-dd HH:mm ZZ')}`} onclick={()=>{if(suppressClick)return;if(view==='week')onCreate(day.date,DateTime.fromMillis(day.end,{zone:$localization.timeZone}).toISODate()!,true);else create(day.start+index*1800000,day.start+(index+1)*1800000);}}></button>{/each}</div>
     </div>
    {/each}
    {#each row.events as event(event.item.key+':'+event.dayStart)}
     <div class="event-position" style={`left:${eventLeft(event)}px;width:${eventWidth(event)}px;top:${event.lane*laneHeight+contextHeight}px;--event-color:${color(event.item)}`}>
      <button type="button" class="timeline-event" class:all-day-event={event.item.allDay} class:canceled={event.item.canceled} class:movable={editable&&event.item.canEdit&&!event.item.allDay} title={label(event.item)} aria-label={label(event.item)} onclick={()=>open(event.item)} onpointerdown={pointer=>begin(pointer,event.item)}><span>{event.item.title??text.busy}<small>{event.item.allDay?text.allDay:DateTime.fromMillis(event.start,{zone:$localization.timeZone}).toFormat('HH:mm')+'–'+DateTime.fromMillis(event.end,{zone:$localization.timeZone}).toFormat('HH:mm')}</small></span></button>
      {#if editable&&event.item.canEdit&&!event.item.allDay&&eventWidth(event)>=18&&DateTime.fromISO(event.item.end).toMillis()<=(view==='week'?days.find(day=>day.start===event.dayStart)!.end:range.end)}<button type="button" class="resize-event" aria-label={`${text.resizeEvent} · ${event.item.title??text.busy}`} title={text.resizeEvent} onpointerdown={pointer=>begin(pointer,event.item,true)} onkeydown={key=>{if(key.key==='ArrowRight'||key.key==='ArrowLeft'){key.preventDefault();const start=DateTime.fromISO(event.item.start),end=DateTime.fromISO(event.item.end).plus(view==='week'?{days:key.key==='ArrowRight'?1:-1}:{minutes:key.key==='ArrowRight'?30:-30});if(end>start)onResize(event.item,start.toISO()!,end.toISO()!,false);}}}>⋮</button>{/if}
     </div>
    {/each}
   </div>
  </section>
 {:else}<p class="empty-timeline">{text.empty}</p>{/each}
</div>
<style>
 .schedule-timeline{--label-width:160px;overflow:auto;max-height:calc(100dvh - 210px);min-height:200px;border:1px solid var(--border);border-radius:var(--sph-radius-4px);position:relative;isolation:isolate;font-size:var(--font-size-support)}.timeline-header{position:sticky;top:0;z-index:4;display:flex;width:max-content;border-bottom:1px solid var(--border);background:var(--surface-secondary)}.corner{position:sticky;left:0;z-index:5;flex:none;width:var(--label-width);padding:var(--sph-space-12px);background:var(--surface-secondary);border-right:1px solid var(--border);font-weight:var(--sph-weight-600)}.timeline-dates{display:flex;width:var(--timeline-width)}.timeline-date{flex:none;border-right:1px solid var(--border)}.date-heading{height:32px;padding:var(--sph-space-6px);background:var(--surface-secondary);font-weight:var(--sph-weight-600)}.date-heading span{position:static}.date-heading.today{color:var(--action-primary)}.timeline-calendar-row{display:grid;grid-template-columns:var(--label-width) var(--timeline-width);width:max-content;min-width:100%;border-bottom:1px solid var(--border)}.timeline-calendar-row:last-child{border-bottom:0}.calendar-label{position:sticky;left:0;z-index:3;display:flex;flex-direction:column;align-items:flex-start;gap:var(--sph-space-8px);padding:var(--sph-space-12px);background:var(--surface);border-right:1px solid var(--border);box-shadow:inset 3px 0 var(--calendar-color);overflow-wrap:anywhere}.calendar-label strong{font-size:var(--font-size-body)}.hours{display:flex;height:28px;border-top:1px solid var(--border);color:var(--muted);background:var(--surface-secondary)}.hours span{position:relative;flex:none;border-left:1px solid var(--border);font-size:var(--font-size-support)}.hours i{position:absolute;left:3px;top:4px;font-style:normal;white-space:nowrap}.short-date{display:none}.date-heading{display:flex;align-items:center;justify-content:center;gap:var(--sph-space-4px);overflow:hidden}.date-heading small{font-size:var(--font-size-support)}.timeline-track{position:relative;background:var(--surface)}.day-slots{position:absolute;top:0;bottom:0;border-right:1px solid var(--border)}.time-slots{display:flex;height:100%}.time-slot{flex:1 1 0;width:0;min-width:0;height:100%;padding:0;margin:0;border:0;border-left:1px dashed var(--border);border-radius:0;background:transparent}.time-slot:nth-child(odd){border-left-style:solid}.time-slot:disabled{cursor:default;opacity:1}.time-slot:not(:disabled):hover{background:var(--surface-hover)}.time-slot:focus-visible{position:relative;z-index:2;outline:2px solid var(--action-primary);outline-offset:-2px}.context-day{position:absolute;inset:0;background:color-mix(in srgb,var(--sph-color-warning-strong) 8%,transparent);pointer-events:none}.context-day span{position:sticky;left:calc(var(--label-width) + 6px);color:var(--muted);font-size:var(--font-size-support)}.context-day.working{background:color-mix(in srgb,var(--sph-color-success-strong) 8%,transparent)}.event-position{position:absolute;height:var(--event-height);display:flex;min-width:0;background:var(--event-color);border-radius:var(--sph-radius-4px);color:var(--sph-color-on-emphasis)}.timeline-event{flex:1;min-width:0;width:100%;height:var(--event-height);margin:0;padding:var(--sph-space-1px) var(--sph-space-5px);text-align:left;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;background:transparent!important;color:var(--sph-color-on-emphasis)!important;border:0;border-radius:var(--sph-radius-4px);font-size:var(--font-size-body);line-height:20px}.timeline-event>span{display:block;overflow:hidden;text-overflow:ellipsis}.timeline-event small{display:block;font-size:var(--font-size-support);line-height:18px}.all-day-event{overflow:visible}.all-day-event>span{position:sticky;left:calc(var(--label-width) + 6px);display:inline-block;max-width:100%;vertical-align:top}.movable,.resize-event{touch-action:pan-y}.movable{cursor:grab}.resize-event{flex:none;width:12px;min-width:0;height:var(--event-height);padding:0;margin:0;border:0;border-left:1px solid var(--sph-color-on-emphasis-muted);border-radius:0 var(--sph-radius-4px) var(--sph-radius-4px) 0;background:transparent!important;color:var(--sph-color-on-emphasis)!important;cursor:ew-resize}.canceled{text-decoration:line-through;opacity:.6}.event-position:focus-within{outline:2px solid var(--action-primary);outline-offset:2px}.week-view .all-day-event>span{position:static;display:block}.week-view .timeline-event{padding-inline:var(--sph-space-3px)}.empty-timeline{padding:var(--sph-space-12px);margin:0}@media(max-width:700px){.schedule-timeline{--label-width:116px;max-height:65dvh}.week-view .full-date{display:none}.week-view .short-date{display:inline}.week-view .date-heading{flex-direction:column;height:48px;gap:0;padding:var(--sph-space-4px) 0}.calendar-label{padding:var(--sph-space-10px)}}
</style>
