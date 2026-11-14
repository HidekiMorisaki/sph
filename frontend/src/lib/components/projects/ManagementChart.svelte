<script lang="ts">
 import {onMount} from 'svelte';
 import {localization} from '#lib/localization.js';
 let {title,labels,series,unit=''}:{title:string;labels:string[];series:Array<{name:string;values:Array<string|null>;color:string;dashed?:boolean}>;unit?:string}=$props();
 let host=$state<HTMLDivElement>(),width=$state(700),active=$state<number|null>(null);
 let pointerX=$state(0),pointerY=$state(0),tooltipWidth=$state(0),tooltipHeight=$state(0);
 let tooltipReady=$state(false);
 $effect(()=>{if(active===null){tooltipReady=false;return;}if(!tooltipWidth||!tooltipHeight)return;const frame=requestAnimationFrame(()=>tooltipReady=true);return()=>cancelAnimationFrame(frame);});
 const tr=(j:string,e:string)=>$localization.displayLanguage==='ja'?j:e;
 let maximum=$derived(Math.max(1,...series.flatMap(s=>s.values.filter(v=>v!==null).map(Number)))),minimum=$derived(Math.min(0,...series.flatMap(s=>s.values.filter(v=>v!==null).map(Number))));
 const x=(i:number)=>54+i*(width-108)/Math.max(1,labels.length-1),y=(value:string)=>220-(Number(value)-minimum)/(maximum-minimum)*190;
 const fmt=(v:string|null)=>v===null?'-':new Intl.NumberFormat($localization.displayLanguage,{maximumFractionDigits:2}).format(Number(v));
 const columnStart=(i:number)=>i===0?0:(x(i-1)+x(i))/2;
 const columnEnd=(i:number)=>i===labels.length-1?width:(x(i)+x(i+1))/2;
 let axisLabels=$derived.by(()=>{const count=Math.min(labels.length,Math.max(2,Math.floor((width-108)/100)+1));return new Set(Array.from({length:count},(_,i)=>Math.round(i*(labels.length-1)/Math.max(1,count-1))));});
 const description=(i:number)=>labels[i]+': '+series.map(s=>s.name+': '+fmt(s.values[i]??null)+' '+unit).join(', ');
 let tooltipLeft=$derived(Math.max(tooltipWidth/2+8,Math.min(width-tooltipWidth/2-8,pointerX)));
 let tooltipTop=$derived(Math.max(8,Math.min(260-tooltipHeight-8,pointerY+14)));
 function inspect(i:number){active=i;pointerX=x(i);pointerY=30;}
 function move(e:PointerEvent){const r=e.currentTarget instanceof SVGElement?e.currentTarget.getBoundingClientRect():null;if(r){pointerX=(e.clientX-r.left)/r.width*width;pointerY=(e.clientY-r.top)/r.height*260;active=Math.max(0,Math.min(labels.length-1,Math.round((pointerX-54)/Math.max(1,width-108)*Math.max(1,labels.length-1))));}}
 function keydown(e:KeyboardEvent,i:number){if(e.key==='Enter'||e.key===' '){e.preventDefault();inspect(i);}else if(e.key==='Escape'){e.preventDefault();active=null;}}
 onMount(()=>{if(!host)return;const o=new ResizeObserver(()=>width=Math.max(120,host!.clientWidth));o.observe(host);return()=>o.disconnect();});
</script>
<section class="app-detail-section chart-card" aria-label={title}><h3>{title}</h3><div class="legend">{#each series as s}<span><i style:background={s.color}></i>{s.name}{s.dashed?' · '+tr('計画','Plan'):''}</span>{/each}<small>{unit}</small></div>
{#if !labels.length}<p class="empty">{tr('測定・確定したデータがまだありません。','No measurements or confirmed reports yet.')}</p>{:else}
<div class="plot" bind:this={host}>
 <svg viewBox={`0 0 ${width} 260`} role="group" aria-label={title} onpointerenter={move} onpointermove={move} onpointerleave={()=>active=null}>
  {#each [0,1,2,3,4] as tick}<line x1="54" x2={width-54} y1={30+tick*47.5} y2={30+tick*47.5} stroke="var(--border)"/><text x="48" y={34+tick*47.5} text-anchor="end">{new Intl.NumberFormat($localization.displayLanguage,{notation:'compact',maximumFractionDigits:1}).format(maximum-(maximum-minimum)*tick/4)}</text>{/each}
  {#if active!==null}<rect class="guide" x={columnStart(active)} y="20" width={columnEnd(active)-columnStart(active)} height="210" fill="var(--action-primary)" opacity="0.09"/><line class="guide" x1={x(active)} x2={x(active)} y1="20" y2="230" stroke="var(--action-primary)" stroke-width="1.5" stroke-dasharray="4 4"/>{/if}
  {#each series as s}{#each s.values as value,i}{#if value!==null}{#if i>0&&s.values[i-1]!==null}<line x1={x(i-1)} y1={y(s.values[i-1]!)} x2={x(i)} y2={y(value)} stroke={s.color} stroke-width="2.5" stroke-dasharray={s.dashed?'6 4':undefined}/>{/if}<circle cx={x(i)} cy={y(value)} r={active===i?5:3} fill={s.color}/>{/if}{/each}{/each}
  {#each labels as label,i}{#if axisLabels.has(i)}<text class:active={active===i} x={x(i)} y="246" text-anchor="middle">{label}</text>{/if}{/each}
  {#each labels as label,i}<rect class="value-target" role="button" tabindex="0" aria-label={description(i)} aria-pressed={active===i} x={columnStart(i)} y="20" width={columnEnd(i)-columnStart(i)} height="238" fill="transparent" onkeydown={e=>keydown(e,i)} onclick={()=>inspect(i)} onblur={()=>active=null}/>{/each}
 </svg>
 {#if active!==null}<div class="tooltip" class:ready={tooltipReady} role="status" bind:clientWidth={tooltipWidth} bind:clientHeight={tooltipHeight} style:left={`${tooltipLeft}px`} style:top={`${tooltipTop}px`}><strong>{labels[active]}</strong>{#each series as s}<div><i style:background={s.color}></i><span>{s.name}</span><b>{fmt(s.values[active]??null)} {unit}</b></div>{/each}</div>{/if}
</div>
{/if}</section>
<section class="app-detail-section chart-table" aria-label={tr('データ表','Data table')}><h3>{tr('データ表','Data table')}</h3><div class="table-scroll"><table><thead><tr><th>{tr('測定時点','Measured at')}</th>{#each series as s}<th>{s.name}</th>{/each}</tr></thead><tbody>{#each labels as label,i}<tr><th>{label}</th>{#each series as s}<td>{fmt(s.values[i]??null)}</td>{/each}</tr>{/each}</tbody></table></div></section>
<style>
 .chart-card{min-width:0}.legend{display:flex;flex-wrap:wrap;gap:var(--sph-space-12px);color:var(--text-secondary);font-size:var(--font-size-support)}.legend span{display:flex;gap:var(--sph-space-6px);align-items:center}i{display:inline-block;width:9px;height:9px;border-radius:50%;flex:none}.plot{position:relative;min-width:0;margin-top:var(--sph-space-16px)}svg{display:block;width:100%;height:260px;font-family:inherit}text{font-size:var(--font-size-support);fill:var(--text-secondary)}text.active{fill:var(--text);font-weight:700}.guide{pointer-events:none}.value-target{cursor:pointer}.value-target:focus-visible{outline:2px solid var(--action-primary);outline-offset:-2px}
 .tooltip{position:absolute;z-index:1;transform:translateX(-50%);pointer-events:none;box-sizing:border-box;width:max-content;max-width:min(270px,calc(100% - 16px));padding:10px 12px;border:1px solid var(--border);border-radius:var(--sph-radius-8px);background:var(--surface);color:var(--text);box-shadow:0 8px 24px rgba(0,0,0,.16);font-size:var(--font-size-support);line-height:1.6;overflow-wrap:anywhere;transition:left .14s ease-out,top .14s ease-out}.tooltip>strong{font-weight:500;color:var(--muted)}.tooltip>div{display:flex;gap:var(--sph-space-6px);align-items:center}.tooltip span{min-width:0;color:var(--text-secondary)}.tooltip b{font-weight:600;white-space:nowrap}
 .table-scroll{overflow:auto}table{width:100%;border-collapse:collapse;font-size:var(--font-size-body)}th,td{padding:var(--sph-space-8px);border-bottom:1px solid var(--border);text-align:left}thead th{font-size:var(--font-size-support)}.empty{color:var(--muted);padding:var(--sph-space-24px) 0}
 .tooltip{visibility:hidden;transition:none}.tooltip.ready{visibility:visible;transition:left .14s ease-out,top .14s ease-out}
 @media(prefers-reduced-motion:reduce){.tooltip.ready{transition:none}}
</style>
