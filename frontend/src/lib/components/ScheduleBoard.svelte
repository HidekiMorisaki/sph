<script lang="ts">
 import ScheduleTimeline from './ScheduleTimeline.svelte';
 import ScheduleVerticalBoard from './ScheduleVerticalBoard.svelte';
 import type { ScheduleItem,CalendarChoice } from '$lib/schedule';
 let {timeAxis='vertical',view,date,firstDay,items,calendars,context=[],editable,creatable,onOpen,onCreate,onMove,onResize=onMove}:{timeAxis?:'vertical'|'horizontal';view:'day'|'week'|'month';date:string;firstDay:number;items:ScheduleItem[];calendars:CalendarChoice[];context?:{calendarKey?:string;date:string;kind:string;title:string}[];editable:boolean;creatable:boolean;onOpen:(item:ScheduleItem)=>void;onCreate:(start:string,end:string,allDay:boolean)=>void;onMove:(item:ScheduleItem,start:string,end:string,allDay:boolean)=>void;onResize?:(item:ScheduleItem,start:string,end:string,allDay:boolean)=>void}=$props();
</script>
{#if timeAxis==='horizontal'&&view!=='month'}
 <ScheduleTimeline view={view} {date} {firstDay} {items} {calendars} {context} {editable} {creatable} {onOpen} {onCreate} {onMove} {onResize}/>
{:else}
 <ScheduleVerticalBoard {view} {date} {firstDay} {items} {calendars} {context} {editable} {creatable} {onOpen} {onCreate} {onMove} {onResize}/>
{/if}
