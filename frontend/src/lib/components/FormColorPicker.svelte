<script lang="ts">
 import {tick} from 'svelte';
 import {localization} from '$lib/localization';
 import FormInput from './FormInput.svelte';
 let {label,field,value,disabled=false,onSelect}:{label:string;field:string;value:string;disabled?:boolean;onSelect:(value:string)=>void}=$props();
 const presets=[
  '#dbeafe','#ccfbf1','#f3e8ff','#ffedd5','#fce7f3','#ecfccb',
  '#2563eb','#0f766e','#9333ea','#c2410c','#be185d','#4d7c0f',
  '#1e3a8a','#134e4a','#581c87','#7c2d12','#831843','#365314',
  '#000000','#ffffff','#64748b','#ef4444','#eab308','#06b6d4'
 ];
 let root=$state<HTMLDivElement>(),trigger=$state<HTMLButtonElement>(),panel=$state<HTMLDivElement>(),expanded=$state(false),panelReady=$state(false),custom=$state(''),left=$state(8),top=$state(8),active=$state(0);
 let presetLabel=$derived($localization.displayLanguage==='ja'?'既定の色':'Preset colors');
 $effect(()=>{custom=value;});
 function position(){if(!trigger||!panel)return;const viewport=window.visualViewport,x=viewport?.offsetLeft??0,y=viewport?.offsetTop??0,width=viewport?.width??document.documentElement.clientWidth,height=viewport?.height??innerHeight;const r=trigger.getBoundingClientRect(),w=panel.offsetWidth,h=panel.offsetHeight;const below=y+height-r.bottom,above=below-8<h&&r.top-y>below;left=Math.max(x+8,Math.min(r.left,x+width-w-8));top=Math.max(y+8,Math.min(above?r.top-h-6:r.bottom+6,y+height-h-8));}
 function close(focus=true){expanded=false;panelReady=false;panel?.hidePopover();if(focus)trigger?.focus({preventScroll:true});}
 async function toggle(){if(disabled)return;if(expanded){close();return;}active=Math.max(0,presets.indexOf(value.toLowerCase()));panelReady=false;left=(window.visualViewport?.offsetLeft??0)+8;top=(window.visualViewport?.offsetTop??0)+8;await tick();panel?.showPopover();expanded=true;await tick();position();await tick();panelReady=true;await tick();panel?.querySelectorAll<HTMLButtonElement>('.color-swatch')[active]?.focus({preventScroll:true});}
 function choose(color:string){if(disabled||!/^#[0-9a-f]{6}$/i.test(color))return;close();onSelect(color.toLowerCase());}
 function keydown(event:KeyboardEvent){if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();}else if(event.target instanceof HTMLButtonElement&&event.target.classList.contains('color-swatch')&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key)){event.preventDefault();const buttons=[...panel!.querySelectorAll<HTMLButtonElement>('.color-swatch')],index=buttons.indexOf(event.target),next=event.key==='Home'?0:event.key==='End'?buttons.length-1:index+({ArrowLeft:-1,ArrowRight:1,ArrowUp:-6,ArrowDown:6}[event.key]??0);active=Math.max(0,Math.min(next,buttons.length-1));void tick().then(()=>buttons[active]?.focus());}}
 function ink(color:string){const r=parseInt(color.slice(1,3),16),g=parseInt(color.slice(3,5),16),b=parseInt(color.slice(5,7),16);return r*299+g*587+b*114>150000?'#111827':'#ffffff';}
 $effect(()=>{if(!expanded)return;const update=()=>position(),viewport=window.visualViewport;window.addEventListener('resize',update);window.addEventListener('scroll',update,true);viewport?.addEventListener('resize',update);viewport?.addEventListener('scroll',update);return()=>{window.removeEventListener('resize',update);window.removeEventListener('scroll',update,true);viewport?.removeEventListener('resize',update);viewport?.removeEventListener('scroll',update);};});
</script>
<div bind:this={root} class="form-color-picker" onfocusout={event=>{if(expanded&&event.relatedTarget instanceof Node&&!root?.contains(event.relatedTarget))close(false);}}>
<button bind:this={trigger} class="color-picker-trigger" type="button" {disabled} aria-label={`${label}: ${value}`} title={label} aria-haspopup="dialog" aria-controls={`${field}-palette`} aria-expanded={expanded} onclick={toggle}><span style:background={value}></span></button>
<div bind:this={panel} id={`${field}-palette`} class="color-picker-panel" popover="auto" role="dialog" tabindex="-1" aria-label={label} style:left={`${left}px`} style:top={`${top}px`} style:visibility={panelReady?'visible':'hidden'} onkeydown={keydown} ontoggle={()=>expanded=panel?.matches(':popover-open')??false}>
 <strong>{presetLabel}</strong>
 <div class="color-grid" role="group" aria-label={presetLabel}>{#each presets as color,index}<button class="color-swatch" type="button" {disabled} tabindex={active===index?0:-1} data-color={color} aria-label={`${label}: ${color.toUpperCase()}`} title={color.toUpperCase()} aria-pressed={value.toLowerCase()===color} style:background={color} style:color={ink(color)} onclick={()=>choose(color)}>{value.toLowerCase()===color?'✓':''}</button>{/each}</div>
 <FormInput label="RGB / HEX" field={`${field}-custom`} type="color" value={custom} {disabled} onValueChange={color=>custom=color} onCommit={()=>choose(custom)}/>
</div>
</div>
<style>
 .color-picker-trigger{display:grid;place-items:center;width:100%;height:36px;margin:0;padding:5px;border:1px solid var(--border);border-radius:4px;background:var(--surface);cursor:pointer}.color-picker-trigger span{width:24px;height:24px;border:1px solid #64748b;border-radius:2px}.color-picker-trigger:hover:not(:disabled){border-color:var(--muted)}.color-picker-trigger:focus-visible,.color-swatch:focus-visible{outline:2px solid var(--action-primary);outline-offset:2px}.color-picker-trigger:disabled{opacity:.7;cursor:not-allowed}
 .color-picker-panel{position:fixed;inset:auto;margin:0;width:320px;max-width:calc(100vw - 16px);max-height:calc(100dvh - 16px);overflow:auto;padding:12px;background:var(--surface);color:var(--text);border:1px solid var(--border);border-radius:6px;box-shadow:0 8px 24px #0003}.color-picker-panel strong{display:block;margin-bottom:10px;font-size:var(--font-size-support)}.color-grid{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:5px;margin-bottom:14px}.color-swatch{height:32px;min-width:0;margin:0;padding:0;border:1px solid #64748b;border-radius:3px;font-size:20px;line-height:1}.color-swatch[aria-pressed=true]{outline:2px solid var(--action-primary);outline-offset:1px;box-shadow:inset 0 0 0 2px var(--surface)}
 @media(max-width:700px),(min-width:701px) and (max-width:1024px) and (max-height:500px) and (any-pointer:coarse){.color-swatch{height:44px}.color-picker-trigger{height:36px}}
</style>
