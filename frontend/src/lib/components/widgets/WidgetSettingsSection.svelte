<script lang="ts">
 import FormInput from '../FormInput.svelte';
 import FormCheckbox from '../FormCheckbox.svelte';
 import FormSection from '../FormSection.svelte';
 import AddButton from '../AddButton.svelte';
 import SearchSelect from '../SearchSelect.svelte';
 import DetailModal from '../DetailModal.svelte';import ModalActionButton from '../ModalActionButton.svelte';
 import {onMount,tick} from 'svelte';import {apiData} from '$lib/api';import {localization} from '$lib/localization';import {widgetDefaultSize,widgetPreview,widgetSizeLabel,widgetText,type WidgetRelease,type WidgetSize} from '$lib/widgets';
 import StatusNotice from '../StatusNotice.svelte';import WidgetContent from './WidgetContent.svelte';
 let lang:'ja'|'en'=$derived($localization.displayLanguage==='ja'?'ja':'en');let t=$derived(widgetText[lang]);
 type CatalogueRelease=WidgetRelease&{sourceId:number};
 type Source={id:number;name:string;url:string;sourceKey:string};let sources=$state<Source[]>([]),releases=$state<CatalogueRelease[]>([]);let name=$state(''),url=$state(''),message=$state(''),failed=$state(false),busy=$state(false),loading=$state(true);let selected=$state<WidgetRelease|null>(null),reviewed=$state(false),size=$state<WidgetSize>('1x1');
 let returnFocus=$state<HTMLElement|null>(null);
 let executePreview=$state(false);
 let addingSource=$state(false),sourceReturnFocus=$state<HTMLElement|null>(null);
 function closeSource(){if(busy)return;addingSource=false;name='';url='';void tick().then(()=>sourceReturnFocus?.focus({preventScroll:true}));}
 async function addSource(){if(await mutate('/v1/widget-sources','POST',{name,url}))closeSource();}
 let stopping=$state<WidgetRelease|null>(null),stopReturnFocus=$state<HTMLElement|null>(null);
 const userCountLabel=(count:number)=>lang==='ja'?`利用者数：${count}人`:`Users: ${count}`;
 type SortKey='name'|'version'|'provider'|'author'|'usageCount';
 type Sort={key:SortKey;order:'asc'|'desc'};
 let groupSorts=$state<Record<number,Sort>>({});
 let columns=$derived<Array<{key:SortKey;label:string}>>([
  {key:'name',label:lang==='ja'?'ウィジェット名':'Widget name'},
  {key:'version',label:lang==='ja'?'バージョン':'Version'},
  {key:'provider',label:lang==='ja'?'提供元名':'Provider'},
  {key:'author',label:lang==='ja'?'開発者名':'Developer'},
  {key:'usageCount',label:lang==='ja'?'利用人数':'Users'}
 ]);
 const sortFor=(id:number):Sort=>groupSorts[id]??{key:'name',order:'asc'};
 const authorFor=(release:WidgetRelease)=>release.definition.author??release.definition.provider;
 function changeSort(id:number,key:SortKey){const current=sortFor(id);groupSorts={...groupSorts,[id]:{key,order:current.key===key&&current.order==='asc'?'desc':'asc'}};}
 function compareVersions(a:string,b:string){
  const [mainA,...suffixA]=a.split('-'),[mainB,...suffixB]=b.split('-');
  const preA=suffixA.length?suffixA.join('-'):undefined,preB=suffixB.length?suffixB.join('-'):undefined;
  const partsA=mainA.split('.').map(Number),partsB=mainB.split('.').map(Number);
  for(let i=0;i<3;i++){const difference=partsA[i]-partsB[i];if(difference)return difference;}
  if(preA===preB)return 0;if(preA===undefined)return 1;if(preB===undefined)return -1;
  const identifiersA=preA.split('.'),identifiersB=preB.split('.');
  for(let i=0;i<Math.max(identifiersA.length,identifiersB.length);i++){
   const left=identifiersA[i],right=identifiersB[i];if(left===right)continue;
   if(left===undefined)return -1;if(right===undefined)return 1;
   const numericA=/^\d+$/.test(left),numericB=/^\d+$/.test(right);
   if(numericA&&numericB){const difference=Number(left)-Number(right);if(difference)return difference;continue;}
   if(numericA!==numericB)return numericA?-1:1;
   return left<right?-1:1;
  }
  return 0;
 }
 let groups=$derived.by(()=>{
  const collator=new Intl.Collator(lang,{numeric:true,sensitivity:'base'});
  return sources.map(source=>{
   const sort=sortFor(source.id);
   const items=releases.filter(release=>release.sourceId===source.id).sort((a,b)=>{
    const value=(release:WidgetRelease)=>sort.key==='name'?release.definition.name[lang]:sort.key==='provider'?release.definition.provider:authorFor(release);
    const difference=sort.key==='usageCount'?(a.usageCount??0)-(b.usageCount??0):sort.key==='version'?compareVersions(a.version,b.version):collator.compare(value(a),value(b));
    return difference*(sort.order==='asc'?1:-1)||a.id-b.id;
   });
   return {source,items,sort};
  });
 });
 function rowClick(event:MouseEvent,release:WidgetRelease){if(event.target instanceof Element&&event.target.closest('button,a,input'))return;openReview(release,event.currentTarget as HTMLElement);}
 function rowKeydown(event:KeyboardEvent,release:WidgetRelease){if(event.target===event.currentTarget&&(event.key==='Enter'||event.key===' ')){event.preventDefault();openReview(release,event.currentTarget as HTMLElement);}}
 // Render tokens as text nodes so catalogue strings never become executable markup.
 let definitionTokens=$derived.by(()=>{
  const json=selected?JSON.stringify(selected.definition,null,2):'';
  return [...json.matchAll(/"(?:\\.|[^"\\])*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null|\s+|[^\s]/g)].map(match=>{
   const text=match[0];
   const kind=text.startsWith('"')?(json.slice(match.index!+text.length).trimStart().startsWith(':')?'key':'string'):/^-?\d/.test(text)?'number':text==='true'||text==='false'?'boolean':text==='null'?'null':'plain';
   return {text,kind};
  });
 });
 // Escape the settings panel's isolated stacking context so the shared modal covers the app shell.
 function portal(node:HTMLElement){document.body.appendChild(node);return{destroy:()=>node.remove()};}
 function openReview(release:WidgetRelease,target:HTMLElement){if(busy)return;returnFocus=target;selected=release;executePreview=false;reviewed=false;size=widgetDefaultSize(release.definition);}
 function closeReview(){if(busy)return;selected=null;void tick().then(()=>returnFocus?.focus({preventScroll:true}));}
 function closeStop(){if(busy)return;stopping=null;void tick().then(()=>stopReturnFocus?.focus({preventScroll:true}));}
 function requestStop(release:WidgetRelease,target:HTMLElement){
  if(busy)return;stopReturnFocus=target;
  if((release.usageCount??0)>0){message='';stopping=release;}else void stopRelease(release);
 }
 async function stopRelease(release:WidgetRelease,confirmedUserCount?:number){
  const saved=await mutate(`/v1/widget-releases/${release.id}/approval`,'PUT',{allowed:false,digest:release.digest,...(confirmedUserCount===undefined?{}:{confirmedUserCount})},count=>{
   releases=releases.map(item=>item.id===release.id?{...item,usageCount:count}:item);
   stopping={...release,usageCount:count};
  },false);
  if(saved)closeStop();
 }
 async function readAll<T>(endpoint:string){
  const items:T[]=[];
  for(let offset=0;;offset+=500){const response=await fetch(`${endpoint}${endpoint.includes('?')?'&':'?'}limit=500&offset=${offset}`,{cache:'no-store'});if(!response.ok)throw Error();const page=await apiData<T[]>(response);items.push(...page);if(page.length<500)return items;}
 }
 async function load(){try{const [s,r]=await Promise.all([readAll<Source>('/v1/widget-sources'),readAll<CatalogueRelease>('/v1/widget-releases?review=true')]);sources=s;releases=r;}catch{message=t.failed;failed=true;}finally{loading=false;}}
 onMount(()=>void load());
 async function mutate(endpoint:string,method:string,body?:unknown,onInUse?:(count:number)=>void,notifySuccess=true){busy=true;message='';failed=false;try{const response=await fetch(endpoint,{method,headers:{'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});if(!response.ok){const p=await response.json().catch(()=>null);if(response.status===409&&p?.error?.code==='WIDGET_IN_USE'&&onInUse){const count=Number(p.error.details?.find((detail:{field?:string})=>detail.field==='usageCount')?.reason);if(Number.isSafeInteger(count)&&count>0){onInUse(count);return false;}}message=response.status===409?(lang==='ja'?'同じバージョンの内容が変更されています。新しいバージョンで公開してください。':p?.error?.message??t.saveFailed):t.saveFailed;failed=true;return false;}await load();if(notifySuccess&&!failed)message=t.saved;return true;}catch{failed=true;message=t.saveFailed;return false;}finally{busy=false;}}
</script>
<section class="widget-settings">
 {#if message&&!selected&&!stopping&&!addingSource}<StatusNotice {message} tone={failed?'error':'success'} onDismiss={()=>message=''}/>{/if}
 {#if loading}<p role="status">{t.loading}</p>{:else}
 <section class="panel"><header class="catalogue-header"><h3>{lang==='ja'?'カタログと利用許可':'Catalogue and approvals'}</h3><AddButton label={lang==='ja'?'ソースを追加':'Add source'} disabled={busy} onclick={event=>{sourceReturnFocus=event.currentTarget as HTMLElement;message='';addingSource=true;}}/></header>
 {#each groups as group (group.source.id)}
 <section class="source-group" data-source-id={group.source.id} aria-labelledby={`widget-source-${group.source.id}`}>
 <header class="source-group-header"><div><h4 id={`widget-source-${group.source.id}`}>{group.source.name}</h4><small>{group.source.url}</small></div><div class="actions">{#if group.source.sourceKey!=='sph-official'}<ModalActionButton label={t.remove} variant="danger" disabled={busy} onclick={()=>void mutate(`/v1/widget-sources/${group.source.id}`,'DELETE')}/>{/if}<ModalActionButton label={lang==='ja'?'カタログを更新':'Update catalogue'} variant="secondary" disabled={busy} onclick={async()=>{if(await mutate(`/v1/widget-sources/${group.source.id}/catalogue-revisions`,'POST'))message=t.refreshDone;}}/></div></header>
 <div class="mobile-sort"><SearchSelect label={lang==='ja'?'並び順':'Sort by'} field={`widget-sort-${group.source.id}`} value={group.sort.key} searchable={false} disabled={busy} options={columns.map(column=>({value:column.key,label:column.label}))} onSelect={value=>{groupSorts={...groupSorts,[group.source.id]:{key:value as SortKey,order:group.sort.order}};}}/><SearchSelect label={lang==='ja'?'並び方向':'Sort direction'} field={`widget-sort-order-${group.source.id}`} value={group.sort.order} searchable={false} disabled={busy} options={[{value:'asc',label:lang==='ja'?'昇順':'Ascending'},{value:'desc',label:lang==='ja'?'降順':'Descending'}]} onSelect={value=>{groupSorts={...groupSorts,[group.source.id]:{key:group.sort.key,order:value as Sort['order']}};}}/></div>
 <div class="app-table-scroll catalogue-scroll"><table class="release-list" aria-labelledby={`widget-source-${group.source.id}`}>
 <colgroup><col class="name-column"/><col class="version-column"/><col class="provider-column"/><col class="author-column"/><col/><col class="approval-column"/></colgroup>
 <thead><tr>{#each columns as column}<th scope="col" aria-sort={group.sort.key===column.key?group.sort.order==='asc'?'ascending':'descending':'none'}><button type="button" class="sort-button" data-sort={column.key} disabled={busy} onclick={()=>changeSort(group.source.id,column.key)}>{column.label}<span class="sort-indicator" class:ascending={group.sort.key===column.key&&group.sort.order==='asc'} class:descending={group.sort.key===column.key&&group.sort.order==='desc'} aria-hidden="true"></span></button></th>{/each}<th scope="col" class="approval-column"><span class="sr-only">{lang==='ja'?'利用許可':'Allow use'}</span></th></tr></thead>
 <tbody>{#each group.items as release (release.id)}
 <tr class="release-row" data-release-id={release.id} tabindex={busy?-1:0} aria-label={`${release.definition.name[lang]}: ${t.review}`} onclick={event=>rowClick(event,release)} onkeydown={event=>rowKeydown(event,release)}>
 <td><strong>{release.definition.name[lang]}</strong></td><td><span class="mobile-label">{columns[1].label}</span>{release.version}</td><td><span class="mobile-label">{columns[2].label}</span>{release.definition.provider}</td><td><span class="mobile-label">{columns[3].label}</span>{authorFor(release)}</td><td class="usage-cell"><span class="mobile-label">{columns[4].label}</span><span class="usage-count" aria-label={userCountLabel(release.usageCount??0)}>{release.usageCount??0}</span></td>
 <td class="approval-cell"><button type="button" class="app-status-switch" class:is-on={!!release.approval?.allowed} role="switch" aria-checked={!!release.approval?.allowed} aria-label={`${release.definition.name[lang]}: ${lang==='ja'?'利用許可':'Allow use'}`} disabled={busy} onclick={event=>{if(release.approval?.allowed)requestStop(release,event.currentTarget);else openReview(release,event.currentTarget);}}><span class="app-status-switch__knob"></span></button></td>
 </tr>{:else}<tr><td class="catalogue-empty" colspan="6">{lang==='ja'?'ウィジェットは登録されていません。カタログを更新してください。':'No widgets registered. Update the catalogue to load them.'}</td></tr>{/each}</tbody>
 </table></div></section>
 {:else}<p>{lang==='ja'?'「＋」からソースを追加してください。':'Choose “+” to add a source.'}</p>{/each}
 </section>
 {#if selected}<div use:portal><DetailModal title={t.review} titleId="widget-review-title" pretitle={selected.definition.name[lang]} closeLabel={t.cancel} {returnFocus} onClose={closeReview} compactHeader dialogClass="widget-review-dialog"><section class="review">
 {#if message&&failed}<StatusNotice {message} tone="error" onDismiss={()=>message=''}/>{/if}
 <dl><dt>{lang==='ja'?'宣言されたデータ':'Declared data'}</dt><dd>{selected.definition.runtime?(lang==='ja'?'独自JavaScript（隔離実行）':'Custom JavaScript (isolated)')+(selected.definition.storage?(lang==='ja'?'・本人専用の保存データ':' · Private widget records'):''):selected.definition.capabilities.join(', ')||'—'}</dd><dt>{lang==='ja'?'ライセンス':'License'}</dt><dd><a href={selected.definition.license.url} target="_blank" rel="noopener noreferrer">{selected.definition.license.name}</a></dd><dt>SHA-256</dt><dd>{selected.digest}</dd></dl>
 <SearchSelect label={t.displaySize} field="widget-review-size" value={size} searchable={false} disabled={busy} options={selected.definition.sizes.map(value=>({value,label:widgetSizeLabel(selected!.definition,value,lang)}))} onSelect={value=>size=value as WidgetSize}/>
 <div class="preview"><h4>{t.preview}</h4>{#if selected.definition.runtime&&!executePreview}<ModalActionButton label={lang==='ja'?'プレビューを実行':'Run preview'} onclick={()=>executePreview=true}/>{:else}<WidgetContent definition={selected.definition} {size} data={widgetPreview(lang)} previewOnly={true}/>{/if}</div>
 <details><summary>{lang==='ja'?'定義全体':'Complete definition'}</summary><pre class="definition-json"><code>{#each definitionTokens as token}<span class={`json-${token.kind}`}>{token.text}</span>{/each}</code></pre></details>
 {#if !selected.approval?.allowed}<FormCheckbox field="widget-review-consent" disabled={busy} checked={reviewed} onChange={value=>reviewed=value} label={lang==='ja'?'このバージョンの内容、データ権限、利用条件を確認しました。':'I reviewed this version, its data capabilities and license terms.'}/>{/if}
 </section>
 {#snippet actions()}<ModalActionButton label={t.cancel} variant="secondary" disabled={busy} onclick={closeReview}/>{#if selected&&!selected.approval?.allowed}<ModalActionButton label={t.allow} disabled={!reviewed||busy} onclick={async()=>{if(selected&&await mutate(`/v1/widget-releases/${selected.id}/approval`,'PUT',{allowed:true,digest:selected.digest},undefined,false))closeReview();}}/>{/if}{/snippet}
 </DetailModal></div>{/if}
 {#if addingSource}<div use:portal><DetailModal title={lang==='ja'?'ソースを追加':'Add source'} titleId="widget-source-title" closeLabel={t.cancel} returnFocus={sourceReturnFocus} onClose={closeSource} compact compactHeader dialogClass="app-confirm-dialog widget-source-dialog" initialFocusSelector="input">
 {#if message&&failed}<StatusNotice {message} tone="error" onDismiss={()=>message=''}/>{/if}
 <form id="widget-source-form" onsubmit={event=>{event.preventDefault();void addSource();}}><FormSection title={lang==='ja'?'ソース情報':'Source information'} framed columns={2}><div class="wide"><FormInput label={t.sourceName} field="widget-source-name" value={name} required maxlength={128} disabled={busy} onValueChange={value=>name=value}/></div><div class="wide"><FormInput label={t.sourceUrl} field="widget-source-url" type="url" placeholder="https://" value={url} required maxlength={2048} disabled={busy} onValueChange={value=>url=value}/></div></FormSection></form>
 {#snippet actions()}<ModalActionButton label={t.cancel} variant="secondary" disabled={busy} onclick={closeSource}/><ModalActionButton label={t.register} type="submit" form="widget-source-form" disabled={busy}/>{/snippet}
 </DetailModal></div>{/if}
 {#if stopping}<div use:portal><DetailModal title={lang==='ja'?'利用中のユーザーがいます':'This widget is in use'} titleId="widget-stop-title" pretitle={stopping.definition.name[lang]} closeLabel={t.cancel} returnFocus={stopReturnFocus} onClose={closeStop} compact compactHeader dialogClass="app-confirm-dialog widget-stop-dialog" initialFocusSelector=".secondary">
 {#if message&&failed}<StatusNotice {message} tone="error" onDismiss={()=>message=''}/>{/if}
 <p class="stop-description">{lang==='ja'?`${stopping.usageCount}人が利用しています。利用を停止しますか？`:`${stopping.usageCount} user(s) are using this widget. Stop its use?`}</p>
 <p class="stop-description">{lang==='ja'?'すべての利用者がこのバージョンを利用できなくなります。配置・設定・保存済みのデータは削除されません。':'All users will lose access to this version. Layouts, settings and saved data will be kept.'}</p>
 {#snippet actions()}<ModalActionButton label={t.cancel} variant="secondary" disabled={busy} onclick={closeStop}/><ModalActionButton label={t.stop} variant="danger" disabled={busy} onclick={()=>{if(stopping)void stopRelease(stopping,stopping.usageCount);}}/>{/snippet}
 </DetailModal></div>{/if}
 {/if}
</section>
<style>
 .widget-settings{min-width:0}.catalogue-header{display:flex;align-items:center;justify-content:space-between;gap:12px}.catalogue-header h3{margin:0}.stop-description{margin:0 0 12px;line-height:1.6;color:var(--text-secondary)}h3{font-size:var(--font-size-section);margin:0 0 12px}h4{margin:0 0 8px}.panel{min-width:0;padding:18px;background:var(--surface);border:1px solid var(--border);border-radius:7px;margin-bottom:16px;overflow-wrap:anywhere}.actions{display:flex;flex-wrap:wrap;align-items:center;gap:8px}.wide{grid-column:1/-1;min-width:0}small{display:block;color:var(--muted);overflow-wrap:anywhere}.preview{padding:16px;border:1px dashed var(--border);margin:12px 0}.review{min-width:0} .source-group{margin-top:20px;min-width:0;border:1px solid var(--border);border-radius:6px;overflow:hidden}.source-group-header{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;padding:14px 16px;background:var(--surface-secondary)}.source-group-header>div{min-width:0}.source-group-header h4{font-size:var(--font-size-subsection);margin:0 0 4px}.source-group-header .actions{margin-left:auto;align-items:center}.catalogue-scroll{max-width:100%}.release-list{width:100%;min-width:880px;table-layout:fixed;border-collapse:collapse;text-align:left;font-size:var(--font-size-body)}.release-list th,.release-list td{padding:12px;border-top:1px solid var(--border);overflow-wrap:anywhere;vertical-align:middle}.release-list .name-column{width:28%}.release-list .version-column{width:12%}.release-list .provider-column,.release-list .author-column{width:18%}.release-list th{font-weight:600;color:var(--muted);background:var(--surface-secondary)}.release-row{cursor:pointer}.release-row:hover{background:var(--surface-hover,var(--surface-secondary))}.release-row:focus-visible{outline:2px solid var(--action-primary);outline-offset:-2px}.approval-column .sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}.release-list th:nth-child(5){text-align:center}.release-list .usage-cell{text-align:center;font-variant-numeric:tabular-nums}.release-list .approval-column,.release-list .approval-cell{width:104px;text-align:center}.release-list .app-status-switch{--app-status-switch-width:52px;min-height:32px;padding:0}.catalogue-empty{color:var(--muted);text-align:center}.release-list .sort-button{display:inline-flex;align-items:center;gap:6px;margin:0;padding:0;min-height:32px;border:0;border-radius:2px;background:transparent;color:var(--muted);font:inherit;font-weight:600;text-align:left;white-space:nowrap}.sort-button:focus-visible{outline:2px solid var(--action-primary);outline-offset:3px}.sort-indicator{position:relative;flex:none;width:10px;height:14px;opacity:.75}.sort-indicator::before,.sort-indicator::after{position:absolute;left:1px;width:0;height:0;content:'';border-right:4px solid transparent;border-left:4px solid transparent}.sort-indicator::before{top:1px;border-bottom:4px solid var(--muted)}.sort-indicator::after{bottom:1px;border-top:4px solid var(--muted)}.sort-indicator.ascending::before{border-bottom-color:#1abb9c}.sort-indicator.ascending::after{opacity:.3}.sort-indicator.descending::before{opacity:.3}.sort-indicator.descending::after{border-top-color:#1abb9c}
 .review :global(.preview){min-width:0}:global(.widget-review-dialog .app-detail-body){scrollbar-gutter:stable}dt{font-weight:600;margin-top:8px}dd{margin:4px 0;overflow-wrap:anywhere}.definition-json{margin:12px 0 0;padding:16px;border:1px solid var(--border);border-radius:6px;background:var(--surface-secondary);color:var(--text);white-space:pre-wrap;overflow-wrap:anywhere;font-size:var(--font-size-support);line-height:1.6}.definition-json code{font-family:ui-monospace,SFMono-Regular,Consolas,monospace}.json-key{color:#075985}.json-string{color:#166534}.json-number{color:#9a3412}.json-boolean{color:#6b21a8}.json-null{color:#9f1239}:global([data-theme='dark']) .json-key{color:#7dd3fc}:global([data-theme='dark']) .json-string{color:#86efac}:global([data-theme='dark']) .json-number{color:#fdba74}:global([data-theme='dark']) .json-boolean{color:#d8b4fe}:global([data-theme='dark']) .json-null{color:#fda4af}a{color:var(--action-primary)}
 .mobile-sort,.mobile-label{display:none}
 @media(max-width:700px),(min-width:701px) and (max-width:1024px) and (max-height:500px) and (any-pointer:coarse){
 .mobile-sort{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:8px;padding:12px;border-top:1px solid var(--border)}
 .catalogue-scroll{overflow:visible}.release-list{display:block;min-width:0;width:100%;table-layout:auto}.release-list colgroup,.release-list thead{display:none}.release-list tbody{display:block}.release-list .release-row{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:10px 16px;padding:12px;border-top:1px solid var(--border)}.release-list .release-row td{min-width:0;padding:0;border:0;text-align:left}.release-list .release-row td:first-child{grid-area:1/1/2/3;align-self:center;padding-right:68px;min-height:44px;display:flex;align-items:center}.release-list .release-row td:nth-child(2){grid-area:2/1}.release-list .release-row td:nth-child(3){grid-area:3/1/4/3}.release-list .release-row td:nth-child(4){grid-area:4/1/5/3}.release-list .release-row .usage-cell{grid-area:2/2}.release-list .release-row .approval-cell{grid-area:1/2;justify-self:end;align-self:center;display:flex;align-items:center;justify-content:flex-end;width:52px;min-height:44px}.mobile-label{display:block;color:var(--muted);font-size:var(--font-size-support);margin-bottom:2px}.release-list .catalogue-empty{display:block;padding:16px}
 }
 @media(max-width:700px){.panel{padding:14px}.source-group-header{padding:12px}.release-list .sort-button{min-height:44px}}
</style>
