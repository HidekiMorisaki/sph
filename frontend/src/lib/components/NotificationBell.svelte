<script lang="ts">
 import { tick,untrack } from 'svelte';
 import { goto } from '$app/navigation';
 import { canOperate,type SessionUser } from '$lib/auth';
 import { localization } from '$lib/localization';
 import { scheduleText } from '$lib/schedule-text';
 import { scheduleRequest } from '$lib/schedule';
 import SearchInput from './SearchInput.svelte';
 import {awaitNotificationView} from '$lib/notification-view';
 import { notificationDestination } from '$lib/notification-destination';
 let {user}:{user:SessionUser|null}=$props();
 type Notice={id:number;key:string;type:string;createdAt:string;readAt:string|null;title:string|null;href:string|null;available:boolean};
 let text=$derived(scheduleText[$localization.displayLanguage]);
 let userId=$derived(user?.id),allowed=$derived(canOperate(user,'notifications.read'));
 type Tab='all'|'unread'|'workflows'|'projects'|'information';
 const tabs:Tab[]=['all','unread','workflows','projects','information'];
 let tab=$state<Tab>('all'),query=$state(''),queryTimer:ReturnType<typeof setTimeout>|undefined,loadVersion=0,cancelVisit:(()=>void)|undefined;
 let unreadCounts=$state<Record<Tab,number>>({all:0,unread:0,workflows:0,projects:0,information:0}),total=$state(0);
 const tr=(ja:string,en:string)=>$localization.displayLanguage==='ja'?ja:en;
 const tabLabel=(key:Tab)=>({all:tr('すべて','All'),unread:tr('未読','Unread'),workflows:tr('ワークフロー','Workflows'),projects:tr('プロジェクト管理','Projects'),information:tr('おしらせ','Information')})[key];
 let open=$state(false),unread=$state(0),readCount=$state(0),items=$state<Notice[]>([]),hasMore=$state(false),error=$state(false),busy=$state(false),snapshot=$state('');
 let updating=$state(false);
 let controller:AbortController|undefined;let generation=0;let root=$state<HTMLDivElement>();let trigger=$state<HTMLButtonElement>();
 async function load(append=false) {
  if(!allowed||!userId||append&&busy)return;
  const current=generation,version=++loadVersion;controller?.abort();busy=true;controller=new AbortController();
  try {
   const result=await scheduleRequest<Notice[]>(`/v1/notifications?sortOrder=desc&limit=20&offset=${append?items.length:0}&unread=${tab==='unread'}&category=${tab==='unread'?'all':tab}&search=${encodeURIComponent(query.trim())}`,'GET',undefined,{},controller.signal);
   if(current!==generation||version!==loadVersion)return;
   items=append?[...items,...result.data.filter(i=>!items.some(old=>old.id===i.id))]:result.data;unread=Number(result.meta.unreadCount??0);readCount=Number(result.meta.readCount??0);hasMore=!!result.meta.hasMore;snapshot=String(result.meta.readThrough);total=Number(result.meta.total??0);const counts=result.meta.unreadCounts as Partial<Record<Tab,number>>|undefined;unreadCounts=Object.fromEntries(tabs.map(key=>[key,Math.max(0,Number(counts?.[key]??0))])) as Record<Tab,number>;error=false;
  }catch(e){if(current===generation&&version===loadVersion&&!(e instanceof DOMException&&e.name==='AbortError'))error=true;}
  finally{if(current===generation&&version===loadVersion)busy=false;}
 }
 // One instance in the shared application header. Reset and abort on principal
 // change; the timer and focus handler share the same in-flight guard.
 $effect(()=>{
  const id=userId,enabled=allowed;++generation;cancelVisit?.();cancelVisit=undefined;clearTimeout(queryTimer);controller?.abort();items=[];unread=0;readCount=0;busy=false;open=false;error=false;tab='all';query='';unreadCounts={all:0,unread:0,workflows:0,projects:0,information:0};total=0;hasMore=false;snapshot='';updating=false;
  if(!id||!enabled)return;
  const refresh=()=>{if(!document.hidden&&!updating)void load();};
  untrack(refresh);const timer=setInterval(refresh,30000);
  document.addEventListener('visibilitychange',refresh);window.addEventListener('focus',refresh);
  return ()=>{++generation;cancelVisit?.();clearTimeout(queryTimer);controller?.abort();clearInterval(timer);document.removeEventListener('visibilitychange',refresh);window.removeEventListener('focus',refresh);};
 });
 function close(){open=false;trigger?.focus();}
 function toggle(){open=!open;trigger?.focus();if(open&&!updating)void load();}
 async function mark(item:Notice) {
  if(updating||busy)return;
  const href=notificationDestination(item.href);if(!href)return;
  const current=generation;updating=true;
  const visit=item.available?awaitNotificationView(href):null;cancelVisit=visit?.cancel;
  try{
   open=false;await goto(href);
   const viewed=visit?await visit.promise:false;
   if(current!==generation)return;
   if(viewed&&canOperate(user,'notifications.update'))await scheduleRequest(`/v1/notifications/${item.id}/read-receipt`,'PUT',{});
   if(current===generation)await load();
  }catch{if(current===generation)error=true;}
  finally{visit?.cancel();if(current===generation){cancelVisit=undefined;updating=false;}}
 }
 function openNotice(event:MouseEvent,item:Notice){
  if(busy||updating){event.preventDefault();return;}
  if(event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
  event.preventDefault();void mark(item);
 }
 function selectTab(next:Tab){if(busy||updating)return;tab=next;items=[];hasMore=false;void load();}
 function tabKeydown(event:KeyboardEvent){if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)||busy||updating)return;event.preventDefault();const index=event.key==='Home'?0:event.key==='End'?tabs.length-1:(tabs.indexOf(tab)+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;selectTab(tabs[index]);void tick().then(()=>document.getElementById('notification-tab-'+tab)?.focus());}
 function search(value:string){query=value.slice(0,200);clearTimeout(queryTimer);queryTimer=setTimeout(()=>{items=[];hasMore=false;void load();},250);}
 async function markAll(){if(updating||busy)return;const current=generation;updating=true;try{await scheduleRequest('/v1/notifications/read-receipts','PUT',{through:snapshot});if(current===generation)await load();}catch{if(current===generation)error=true;}finally{if(current===generation)updating=false;}}
 async function dismiss(item?:Notice){
  if(updating||busy)return;
  const current=generation,cutoff=snapshot,index=item?items.findIndex(notice=>notice.id===item.id):-1;
  updating=true;
  try{
   const result=await scheduleRequest<{deleted:number}>(item?`/v1/notifications/${item.id}`:`/v1/notifications?read=true&through=${encodeURIComponent(cutoff)}`,'DELETE');
   if(current!==generation)return;
   items=items.filter(notice=>item?notice.id!==item.id:!notice.readAt||Date.parse(notice.readAt)>Date.parse(cutoff));
   if(item&&!item.readAt)unread=Math.max(0,unread-result.data.deleted);else readCount=Math.max(0,readCount-result.data.deleted);
   await load();updating=false;await tick();
   if(open&&current===generation){const choices=root?.querySelectorAll<HTMLButtonElement>('.dismiss');const next=index>=0?choices?.[Math.min(index,(choices?.length??0)-1)]:null;(next??trigger)?.focus();}
  }catch{if(current===generation)error=true;}finally{if(current===generation)updating=false;}
 }
 function kind(type:string){const ja=$localization.displayLanguage==='ja';const workflow:Record<string,[string,string]>={'project.assigned':['チケットが割り当てられました','Ticket assigned'],'project.comment':['チケットにコメントが追加されました','New ticket comment'],'workflow.requested':['承認依頼','Approval requested'],'workflow.approved':['承認されました','Approved'],'workflow.returned':['差し戻されました','Returned'],'workflow.rejected':['却下されました','Rejected'],'workflow.completed':['最終承認が完了しました','Final approval completed'],'workflow.cancelled':['申請が取り下げられました','Request withdrawn'],'workflow.comment':['コメントが追加されました','New comment'],'workflow.reassigned':['承認者が変更されました','Approver reassigned'],'workflow.payment':['受渡しの確認依頼','Transfer receipt requested'],'workflow.received':['受領が確認されました','Receipt confirmed'],'workflow.correction':['受渡し記録の訂正・取消','Transfer correction']};if(workflow[type])return workflow[type][ja?0:1];return ({'schedule.invitation':text.invitation,'schedule.change':text.change,'schedule.cancellation':text.cancellation,'schedule.response':text.response,'schedule.resource-release':text.resourceRelease} as Record<string,string>)[type]??text.notifications;}
</script>
<svelte:window onpointerdown={event=>{if(open&&!root?.contains(event.target as Node))open=false;}} onkeydown={event=>{if(open&&event.key==='Escape'){event.preventDefault();close();}}}/>
{#if allowed}
 <div class="notifications" bind:this={root}>
  <button type="button" class="bell" bind:this={trigger} aria-label={`${text.notifications}${unread?` (${unread})`:''}`} aria-expanded={open} aria-controls="notification-panel" onclick={toggle}>
   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M9 20h6"/></svg>{#if unread}<span class="badge">{unread>99?'99+':unread}</span>{/if}
  </button>
  {#if open}
   <section id="notification-panel" class="panel" aria-label={text.notifications}>
    <header><strong>{text.notifications}</strong><div class="header-actions">
     {#if canOperate(user,'notifications.delete')}<button class="delete-read icon-action" type="button" aria-label={text.deleteReadNotifications} title={text.deleteReadNotifications} disabled={busy||updating||!readCount} onclick={()=>dismiss()}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M9 10v7M15 10v7"/></svg></button>{/if}
     {#if canOperate(user,'notifications.update')}<button class="mark-all icon-action" type="button" aria-label={text.markAllRead} title={text.markAllRead} disabled={busy||updating||!unread} onclick={markAll}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m3 12 5 5L19 6M12 17l9-9"/></svg></button>{/if}
    </div></header>
    <div class="filters" role="tablist" aria-label={tr('通知の分類','Notification categories')}>{#each tabs as key}<button type="button" role="tab" id={'notification-tab-'+key} aria-selected={tab===key} aria-controls="notification-tab-panel" tabindex={tab===key?0:-1} disabled={busy||updating} onclick={()=>selectTab(key)} onkeydown={tabKeydown}>{tabLabel(key)}<span class="tab-count" class:zero={!unreadCounts[key]} aria-label={tr('未読','Unread')+' '+unreadCounts[key]}>{unreadCounts[key]}</span></button>{/each}</div>
    <div class="notice-search"><SearchInput label={tr('通知を検索','Search notifications')} placeholder={tr('件名・通知の種類で検索','Search titles or notification types')} value={query} onValueChange={search}/><span class="result-count" role="status">{total}{tr('件',' results')}</span></div>
    {#if error}<p role="alert">{text.failed} <button type="button" onclick={()=>load()}>{text.retry}</button></p>{/if}
    <div class="items" id="notification-tab-panel" role="tabpanel" aria-labelledby={'notification-tab-'+tab} aria-busy={busy||updating}>{#each items as item(item.id)}{@const href=notificationDestination(item.href)}<article class:unread={!item.readAt} data-notice-id={item.id} aria-busy={busy||updating}>
     {#if href}<a class="notice notice-link" {href} aria-disabled={busy||updating} onclick={event=>openNotice(event,item)}>{@render noticeContent(item)}</a>{:else}<div class="notice" aria-disabled="true">{@render noticeContent(item)}</div>{/if}
     {#if canOperate(user,'notifications.delete')}<button class="dismiss icon-action" type="button" aria-label={`${text.deleteNotification} · ${kind(item.type)}`} title={text.deleteNotification} disabled={busy||updating} onclick={()=>dismiss(item)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6"/></svg></button>{/if}</article>{:else}<p>{busy?text.loading:text.noNotifications}</p>{/each}</div>
    {#if hasMore}<button class="more" type="button" disabled={busy||updating} onclick={()=>load(true)}>{text.more}</button>{/if}
   </section>
  {/if}
 </div>
{/if}
{#snippet noticeContent(item:Notice)}<strong>{kind(item.type)}</strong><span>{item.title??text.notificationUnavailable}</span><time datetime={item.createdAt}>{new Intl.DateTimeFormat($localization.displayLanguage,{dateStyle:'short',timeStyle:'short',timeZone:$localization.timeZone}).format(new Date(item.createdAt))}</time>{/snippet}
<style>
 .notifications{position:relative}.bell{position:relative;display:grid;place-items:center;width:34px;height:34px;padding:var(--sph-space-7px);background:transparent!important;color:var(--muted)!important;border-radius:var(--sph-radius-4px)}.bell:hover{background:var(--surface-hover)!important}.bell svg{width:20px;height:20px}.badge{position:absolute;right:-4px;top:-2px;background:var(--danger);color:white;border-radius:var(--sph-radius-12px);font-size:var(--font-size-support);line-height:16px;min-width:20px;padding:0 var(--sph-space-3px)}.panel{position:absolute;right:0;top:43px;width:640px;max-width:calc(100vw - 16px);max-height:calc(100dvh - 80px);display:flex;flex-direction:column;border:1px solid var(--border);border-radius:var(--radius);box-shadow:var(--sph-shadow-popover);background:var(--surface);color:var(--text);overflow:hidden}.panel header{display:flex;justify-content:space-between;align-items:center;padding:var(--sph-space-12px) var(--sph-space-16px);border-bottom:1px solid var(--border)}.header-actions{display:flex;gap:var(--sph-space-4px);align-items:center}.icon-action{display:inline-grid;place-items:center;width:32px;height:32px;padding:var(--sph-space-6px);margin:0;border:0;background:transparent!important;color:var(--muted)!important}.icon-action svg{width:20px;height:20px}.icon-action:hover:not(:disabled){background:var(--surface-hover)!important}.delete-read,.dismiss:hover:not(:disabled){color:var(--danger)!important}.dismiss{grid-column:2;grid-row:1;align-self:start}.filters{display:flex;gap:var(--sph-space-8px);flex-wrap:wrap;padding:0 var(--sph-space-12px);border-bottom:1px solid var(--border)}.filters button{display:flex;align-items:center;gap:var(--sph-space-6px);min-height:44px;padding:var(--sph-space-10px) var(--sph-space-8px);margin:0;background:transparent!important;color:var(--muted)!important;border:0;border-bottom:2px solid transparent;border-radius:0;font:inherit;font-size:var(--font-size-body);white-space:nowrap}.filters button[aria-selected=true]{border-bottom-color:var(--action-primary);color:var(--action-primary)!important;font-weight:600}.filters button:hover:not(:disabled){color:var(--text)!important;background:var(--surface-hover)!important}.filters button:focus-visible{outline:2px solid var(--action-primary);outline-offset:-2px}.tab-count{display:inline-flex;align-items:center;justify-content:center;min-width:20px;height:20px;padding:0 5px;border-radius:999px;background:color-mix(in srgb,var(--action-primary) 12%,var(--surface));color:var(--action-primary);font-size:var(--font-size-support);line-height:1}.tab-count.zero{background:var(--surface-secondary);color:var(--muted)}.notice-search{display:flex;align-items:center;gap:12px;padding:12px 16px;border-bottom:1px solid var(--border)}.notice-search :global(.search-box){flex:1;width:100%;min-width:0}.result-count{flex:none;color:var(--muted);font-size:var(--font-size-support)}.items{overflow-y:auto;min-height:60px}.items p,.panel>p{padding:var(--sph-space-12px) var(--sph-space-16px);margin:0}.items article{position:relative;display:grid;grid-template-columns:minmax(0,1fr) 32px;gap:0 var(--sph-space-8px);border-bottom:1px solid var(--border);padding:var(--sph-space-8px) var(--sph-space-12px)}.items article.unread{background:color-mix(in srgb,var(--action-primary) 10%,var(--surface));border-left:3px solid var(--action-primary)}.notice{color:inherit;text-decoration:none;border:0;display:flex;flex-direction:column;gap:var(--sph-space-3px);text-align:left;width:100%;padding:var(--sph-space-4px);background:transparent!important;overflow-wrap:anywhere}.notice-link::after{content:'';position:absolute;inset:0;z-index:0}.notice-link:hover::after{background:color-mix(in srgb,var(--action-primary) 5%,transparent)}.notice-link:focus-visible{outline:none}.notice-link:focus-visible::after{outline:2px solid var(--action-primary);outline-offset:-2px}.dismiss{position:relative;z-index:1}.notice strong{font-size:var(--font-size-body)}.notice time{font-size:var(--font-size-support);color:var(--muted)}.more{padding:var(--sph-space-10px);border-top:1px solid var(--border)}button:disabled{opacity:.5;cursor:default}@media(max-width:700px){.panel{position:fixed;left:8px;right:8px;top:60px;width:auto;max-height:calc(100dvh - 76px)}.bell{width:40px;height:40px}.filters button{min-height:44px}.icon-action{width:44px;height:44px}.items article{grid-template-columns:minmax(0,1fr) 44px}.panel header{padding:var(--sph-space-8px) var(--sph-space-12px)}}
</style>
