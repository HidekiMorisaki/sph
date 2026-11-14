<script lang="ts">
 import {DateTime} from 'luxon';
 import {localization} from '#lib/localization.js';
 import {automaticGanttPeriod,validGanttPeriod,type GanttPeriod} from '#lib/project-gantt-period.js';
 import type {Ticket} from '#lib/projects.js';
 import DatePicker from '../DatePicker.svelte';
 import ActionButton from '../ActionButton.svelte';
 let {tickets,onapply}:{tickets:Ticket[];onapply:(period:GanttPeriod|null)=>void}=$props();
 let draft=$state<GanttPeriod|null>(null),open=$state<'from'|'to'|null>(null);
 let ja=$derived($localization.displayLanguage==='ja');const tr=(j:string,e:string)=>ja?j:e;
 let automatic=$derived(automaticGanttPeriod(tickets,DateTime.now().setZone($localization.timeZone).toISODate()!));
 let values=$derived(draft??automatic),valid=$derived(validGanttPeriod(values));
 function select(key:'from'|'to',value:string){draft={...values,[key]:value};open=null;}
 function apply(event:SubmitEvent){event.preventDefault();if(valid)onapply({...values});}
</script>
<form class="period-controls" aria-label={tr('表示期間','Display period')} onsubmit={apply}>
 <div class="period-fields"><span class="period-label">{tr('表示期間','Display period')}</span>
 <div class="date-field"><DatePicker label={tr('表示開始日','Display start date')} field="gantt-period-from" value={values.from} showLabel={false} compact={false} required min="0001-01-01" max="9999-12-31" open={open==='from'} onToggle={()=>open=open==='from'?null:'from'} onSelect={value=>select('from',value)}/></div>
 <span aria-hidden="true">〜</span>
 <div class="date-field"><DatePicker label={tr('表示終了日','Display end date')} field="gantt-period-to" value={values.to} showLabel={false} compact={false} required min="0001-01-01" max="9999-12-31" align="end" open={open==='to'} onToggle={()=>open=open==='to'?null:'to'} onSelect={value=>select('to',value)}/></div>
 <ActionButton type="submit" label={tr('適用','Apply')} disabled={!valid}/><ActionButton type="button" label={tr('全期間','All dates')} onclick={()=>{draft=null;open=null;onapply(null);}}/>
 </div>
 {#if !valid}<p class="period-error" role="alert">{tr('終了日は開始日以降の日付を指定してください。','The end date must be on or after the start date.')}</p>{/if}
</form>
<style>.period-controls{min-width:0;max-width:100%}.period-fields{display:flex;align-items:center;justify-content:flex-end;flex-wrap:wrap;gap:8px;min-width:0;max-width:100%}.period-label{font-size:var(--font-size-support);color:var(--muted);white-space:nowrap}.date-field{width:148px;max-width:100%;min-width:0}.period-error{margin:6px 0 0;color:var(--danger);font-size:var(--font-size-support)}@media(max-width:700px){.period-fields{gap:6px}.period-label{flex-basis:100%}.date-field{flex:1 1 130px;width:130px}}</style>
