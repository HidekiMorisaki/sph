<script lang="ts">
 import StatusSwitch from '$lib/components/StatusSwitch.svelte';
 import {untrack} from 'svelte';
 import DetailModal from '../DetailModal.svelte';
 import ActionButton from '../ActionButton.svelte';
 import StatusNotice from '../StatusNotice.svelte';
 import SortableList from '../SortableList.svelte';
 import {localization} from '$lib/localization';
 import {projectColumns,defaultProjectColumns} from '$lib/project-columns';
 let {columns,userId,onclose,onsaved,returnFocus}:{columns:string[];userId:number;onclose:()=>void;onsaved:(columns:string[])=>void;returnFocus:HTMLElement|null}=$props();
 let selected=$state(untrack(()=>[...columns])),order=$state(untrack(()=>[...columns,...projectColumns.map(c=>c[0]).filter(c=>!columns.includes(c))])),busy=$state(false),error=$state('');
 let ja=$derived($localization.displayLanguage==='ja');const tr=(j:string,e:string)=>ja?j:e;
 const columnId=(key:string)=>projectColumns.findIndex(c=>c[0]===key)+1;
 const columnKey=(id:number)=>projectColumns[id-1][0];
 const columnLabel=(id:number)=>projectColumns[id-1][ja?1:2];
 function toggle(key:string){if(busy||selected.length===1&&selected.includes(key))return;selected=selected.includes(key)?selected.filter(c=>c!==key):[...selected,key];}
 async function save(){busy=true;error='';try{const r=await fetch('/v1/personal-settings/project-columns',{method:'PUT',headers:{'content-type':'application/json','x-settings-owner':String(userId)},body:JSON.stringify({columns:order.filter(c=>selected.includes(c))})});if(!r.ok)throw Error();const p=await r.json();if(p.data.employeeId!==userId)throw Error();onsaved(p.data.columns);}catch{error=tr('保存できませんでした。再試行してください。','Unable to save. Please retry.');}finally{busy=false;}}
</script>
<DetailModal title={tr('表示項目','Display columns')} titleId="project-column-title" closeLabel={tr('閉じる','Close')} {returnFocus} onClose={()=>{if(!busy)onclose();}}>
 {#if error}<StatusNotice message={error} tone="error" onDismiss={()=>error=''}/>{/if}
 <p>{tr('表示する項目をON/OFFで切り替え、左のハンドルをドラッグして順序を変更します。少なくとも1項目をONにしてください。','Toggle columns on or off and drag the handles on the left to reorder. Keep at least one column on.')}</p>
 <div class="column-options"><SortableList ids={order.map(columnId)} label={tr('表示項目の順序を変更','Reorder display columns')} labelFor={columnLabel} disabled={busy} onreorder={ids=>order=ids.map(columnKey)}>
 {#snippet children(id:number)}{@const key=columnKey(id)}<div class="option" data-column={key}><span>{columnLabel(id)}</span><StatusSwitch width={52} checked={selected.includes(key)} label={columnLabel(id)} disabled={busy||(selected.length===1&&selected.includes(key))} onclick={()=>toggle(key)}/></div>{/snippet}
 </SortableList></div>
 {#snippet actions()}<ActionButton label={tr('初期設定に戻す','Restore defaults')} disabled={busy} onclick={()=>{selected=[...defaultProjectColumns];order=[...defaultProjectColumns,...projectColumns.map(c=>c[0]).filter(c=>!defaultProjectColumns.includes(c))];}}/><ActionButton label={tr('キャンセル','Cancel')} disabled={busy} onclick={onclose}/><ActionButton label={tr('保存','Save')} variant="primary" disabled={busy} onclick={save}/>{/snippet}
</DetailModal>
<style>.column-options{min-width:0}.option{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:44px;border-bottom:1px solid var(--border);padding:6px 0}.option>span{min-width:0;overflow-wrap:anywhere}p{font-size:var(--font-size-support);color:var(--muted)}</style>
