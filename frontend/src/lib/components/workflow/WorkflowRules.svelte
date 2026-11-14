<script lang="ts">
 import ActionButton from '#lib/components/ActionButton.svelte';
 import type {Condition,Field} from '#lib/workflow-form.js';
 import {choose} from '#lib/workflow-client.js';
 import Control from './WorkflowControl.svelte';
 let {value=$bindable(),fields,ja=true,label,beforeChange=()=>{}}:{value?:Condition;fields:Field[];ja?:boolean;label:string;beforeChange?:()=>void}=$props();
 const t=(a:string,b:string)=>choose(ja,a,b);
 const ops=[['eq','等しい','Equals'],['ne','等しくない','Does not equal'],['empty','空欄','Empty'],['filled','入力あり','Filled'],['gt','より大きい','Greater than'],['lt','より小さい','Less than'],['contains','含む','Contains']];
 function update(next:Condition|undefined){beforeChange();value=next;}
 function rule(index:number,patch:Partial<Condition['rules'][number]>){if(value)update({...value,rules:value.rules.map((r,i)=>i===index?{...r,...patch}:r)});}
 function add(){update({mode:value?.mode??'all',rules:[...(value?.rules??[]),{field:fields[0]?.id??'',op:'eq',value:''}]});}
</script>
<fieldset><legend>{label}</legend>
 {#if value}
  <Control kind="select" label={t('条件の組合せ','Match conditions')} value={value.mode} options={[{value:'all',label:t('すべて満たす','All conditions')},{value:'any',label:t('いずれかを満たす','Any condition')}]} onValueChange={v=>update({...value!,mode:v as Condition['mode']})}/>
  {#each value.rules as r,i}
   <div class="rule">
    <Control kind="select" label={t('対象項目','Field')} value={r.field} options={fields.map(f=>({value:f.id,label:f.label}))} onValueChange={v=>rule(i,{field:v})}/>
    <Control kind="select" label={t('比較方法','Comparison')} value={r.op} options={ops.map(o=>({value:o[0],label:o[ja?1:2]}))} onValueChange={v=>rule(i,{op:v as Condition['rules'][number]['op']})}/>
    {#if !['empty','filled'].includes(r.op)}<Control label={t('比較する値','Value')} value={r.value??''} onValueChange={v=>rule(i,{value:v})}/>{/if}
    <ActionButton type="button" onclick={()=>{const rules=value!.rules.filter((_,n)=>n!==i);update(rules.length?{...value!,rules}:undefined);}} variant="secondary" data-button-scope="button-33d3433149">{t('削除','Remove')}</ActionButton>
   </div>
  {/each}
 {/if}
 <ActionButton type="button" disabled={!fields.length} onclick={add} variant="secondary" data-button-scope="button-33d3433149">＋ {t('条件を追加','Add condition')}</ActionButton>
</fieldset>
<style>
 fieldset{display:grid;gap:var(--sph-space-12px);margin:0;min-width:0;border:1px solid var(--border);border-radius:var(--sph-radius-6px);padding:var(--sph-space-12px)}legend{font-size:var(--font-size-support)}.rule{display:grid;gap:var(--sph-space-10px);padding:var(--sph-space-8px) 0;border-bottom:1px solid var(--border)}.rule :global(button[data-button-scope="button-33d3433149"]){justify-self:start}
</style>
