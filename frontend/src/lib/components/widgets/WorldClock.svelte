<script lang="ts">
 let {zone,now,lang,showSeconds=false,design='digital',compact=false}:{zone:string;now:Date;lang:'ja'|'en';showSeconds?:boolean;design?:string;compact?:boolean}=$props();
 const uid=$props.id();
 let time=$derived.by(()=>{try{return new Intl.DateTimeFormat(lang,{timeZone:zone,hour:'2-digit',minute:'2-digit',second:showSeconds&&!compact?'2-digit':undefined,hourCycle:'h23'}).format(now);}catch{return '—';}});
 let day=$derived.by(()=>{try{return new Intl.DateTimeFormat(lang,{timeZone:zone,month:'short',day:'numeric'}).format(now);}catch{return '—';}});
 let offset=$derived.by(()=>{try{return new Intl.DateTimeFormat('en',{timeZone:zone,timeZoneName:'shortOffset'}).formatToParts(now).find(p=>p.type==='timeZoneName')?.value??'';}catch{return '';}});
 let hands=$derived.by(()=>{try{const parts=new Intl.DateTimeFormat('en',{timeZone:zone,hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(now);const n=(type:string)=>Number(parts.find(p=>p.type===type)?.value??0),h=n('hour'),m=n('minute'),s=n('second');return {hour:(h%12)*30+m/2+s/120,minute:m*6+s/10,second:s*6,night:h<6||h>=18};}catch{return null;}});
</script>
<div class="clock-container"><div class="world-clock" class:analog={design==='analog'&&hands} class:night={hands?.night} data-design={design}>
 {#if design==='analog'&&hands}
 <svg class="analog-clock" viewBox="0 0 120 120" role="img" aria-label={`${zone}: ${time}`}>
  <defs>
   <linearGradient id={`${uid}-rim`} x1="0" y1="0" x2="1" y2="1"><stop stop-color="#f2f6fc"/><stop offset=".3" stop-color="#8c9cb2"/><stop offset=".53" stop-color="#e6edf7"/><stop offset="1" stop-color="#53647e"/></linearGradient>
   <radialGradient id={`${uid}-dial`} cx=".35" cy=".25" r=".9"><stop stop-color="var(--dial-light)"/><stop offset="1" stop-color="var(--dial-edge)"/></radialGradient>
   <linearGradient id={`${uid}-hand`}><stop stop-color="var(--hand-light)"/><stop offset=".5" stop-color="var(--hand-light)"/><stop offset=".51" stop-color="var(--dial-ink)"/><stop offset="1" stop-color="var(--dial-ink)"/></linearGradient>
   <filter id={`${uid}-shadow`} x="-40%" y="-40%" width="180%" height="180%"><feDropShadow dx="0" dy="1.2" stdDeviation="1.1" flood-color="#09111f" flood-opacity=".35"/></filter>
  </defs>
  <circle cx="60" cy="61" r="58" fill="#09111f" opacity=".18"/>
  <circle cx="60" cy="60" r="57" fill={`url(#${uid}-rim)`}/>
  <circle cx="60" cy="60" r="53" fill="var(--dial-ring)"/>
  <circle cx="60" cy="60" r="50.5" fill={`url(#${uid}-dial)`} stroke="var(--dial-line)" stroke-width=".6"/>
  <circle cx="60" cy="60" r="40" fill="none" stroke="var(--dial-line)" stroke-width=".5" opacity=".65"/>
  {#each Array(60) as _,i}<line x1="60" y1={i%5===0?13:15} x2="60" y2={i%5===0?21:18} stroke="var(--dial-ink)" stroke-width={i%5===0?1.8:.65} opacity={i%5===0?1:.55} transform={`rotate(${i*6} 60 60)`}/>{/each}
  <g class="numerals" fill="var(--dial-ink)"><text x="60" y="34">12</text><text x="87" y="64">3</text><text x="60" y="94">6</text><text x="33" y="64">9</text></g>
  <g filter={`url(#${uid}-shadow)`}>
   <path d="M57.5 66 58.5 39 60 30 61.5 39 62.5 66Z" fill={`url(#${uid}-hand)`} stroke="var(--dial-ink)" stroke-width=".5" transform={`rotate(${hands.hour} 60 60)`}/>
   <path d="M58.5 67 59 27 60 19 61 27 61.5 67Z" fill={`url(#${uid}-hand)`} stroke="var(--dial-ink)" stroke-width=".45" transform={`rotate(${hands.minute} 60 60)`}/>
  </g>
  <g transform={`rotate(${hands.second} 60 60)`}><path d="M60 72V16" stroke="var(--second-hand)" stroke-width="1.1"/><circle cx="60" cy="71" r="2.3" fill="none" stroke="var(--second-hand)" stroke-width="1.1"/></g>
  <circle cx="60" cy="60" r="3.5" fill={`url(#${uid}-rim)`}/><circle cx="60" cy="60" r="1.8" fill="var(--second-hand)"/>
 </svg>
 {/if}
 <div class="clock-meta"><span class="city" title={zone}>{design==='analog'?zone.split('/').at(-1)?.replaceAll('_',' '):zone.replaceAll('_',' ')}</span>
 {#if design!=='analog'||!hands}<strong class="clock">{time}</strong>{:else}<span class="analog-time">{time}</span>{/if}
 <small title={offset}>{day}</small>{#if design==='analog'}<small class="offset">{offset}</small>{/if}

 </div>
</div></div>
<style>
 .clock-container{container-type:inline-size;min-width:0}.world-clock{--dial-light:#fffef6;--dial-edge:#e7e0cd;--dial-ink:#26354c;--dial-line:#b2aa91;--dial-ring:#4b586c;--hand-light:#728eaf;--second-hand:#b34f36;min-width:0}.world-clock.night{--dial-light:#273c57;--dial-edge:#101c2d;--dial-ink:#dfe9f6;--dial-line:#627994;--dial-ring:#07111f;--hand-light:#91aed2;--second-hand:#e5b777}.world-clock{display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}.analog{gap:0}.analog .clock-meta{display:contents}.analog .city{font-size:calc(12px*var(--widget-scale,1));line-height:calc(14px*var(--widget-scale,1));max-width:100%}.analog small{font-size:calc(10px*var(--widget-scale,1));line-height:calc(12px*var(--widget-scale,1))}.analog-time,.analog .offset{display:none}.analog-clock{display:block;width:calc(192px*var(--widget-scale,1));max-width:100%;height:auto;aspect-ratio:1;overflow:visible;filter:drop-shadow(0 2px 3px #09111f25)}.numerals{text-anchor:middle;font-size:10px;font-weight:600;letter-spacing:.3px}.clock-meta{min-width:0;max-width:100%;width:100%}.city{display:block;font-size:1em;line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.clock{display:block;font-size:calc(1.8rem*var(--widget-scale,1));font-variant-numeric:tabular-nums;line-height:1.3}.analog-time{font-size:calc(14px*var(--widget-scale,1));line-height:1.3;font-weight:600;font-variant-numeric:tabular-nums}small{display:block;font-size:calc(12px*var(--widget-scale,1));line-height:1.4;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.offset{font-size:calc(11px*var(--widget-scale,1))}
 @container(max-width:190px){.city{font-size:13px}.clock{font-size:calc(1.6rem*var(--widget-scale,1))}}
 @container(max-width:100px){.clock{font-size:calc(1.3rem*var(--widget-scale,1))}.city{font-size:calc(11px*var(--widget-scale,1))}small{font-size:calc(10px*var(--widget-scale,1))}}
</style>
