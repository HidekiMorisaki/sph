<script lang="ts">
 import { tick,untrack } from 'svelte';
 import { goto } from '$app/navigation';
 import { canOperate,type SessionUser } from '$lib/auth';
 import { localization } from '$lib/localization';
 import { scheduleText } from '$lib/schedule-text';
 import { scheduleRequest } from '$lib/schedule';
 let {user}:{user:SessionUser|null}=$props();
 type Notice={id:number;key:string;type:string;createdAt:string;readAt:string|null;title:string|null;href:string|null;available:boolean};
 let text=$derived(scheduleText[$localization.displayLanguage]);
 let userId=$derived(user?.id),allowed=$derived(canOperate(user,'notifications.read'));
 let open=$state(false),unread=$state(0),readCount=$state(0),items=$state<Notice[]>([]),onlyUnread=$state(false),hasMore=$state(false),error=$state(false),busy=$state(false),snapshot=$state('');
 let updating=$state(false);
 let controller:AbortController|undefined;let generation=0;let root=$state<HTMLDivElement>();let trigger=$state<HTMLButtonElement>();
 async function load(append=false) {
  if(!allowed||!userId||busy)return;
  const current=generation;busy=true;controller=new AbortController();
  try {
   const result=await scheduleRequest<Notice[]>(`/v1/notifications?sortOrder=desc&limit=20&offset=${append?items.length:0}&unread=${onlyUnread}`,'GET',undefined,{},controller.signal);
   if(current!==generation)return;
   items=append?[...items,...result.data.filter(i=>!items.some(old=>old.id===i.id))]:result.data;unread=Number(result.meta.unreadCount??0);readCount=Number(result.meta.readCount??0);hasMore=!!result.meta.hasMore;snapshot=String(result.meta.readThrough);error=false;
  }catch(e){if(current===generation&&!(e instanceof DOMException&&e.name==='AbortError'))error=true;}
  finally{if(current===generation)busy=false;}
 }
 // One instance in the shared application header. Reset and abort on principal
 // change; the timer and focus handler share the same in-flight guard.
 $effect(()=>{
  const id=userId,enabled=allowed;++generation;controller?.abort();items=[];unread=0;readCount=0;busy=false;open=false;error=false;onlyUnread=false;hasMore=false;snapshot='';updating=false;
  if(!id||!enabled)return;
  const refresh=()=>{if(!document.hidden&&!updating)void load();};
  untrack(refresh);const timer=setInterval(refresh,30000);
  document.addEventListener('visibilitychange',refresh);window.addEventListener('focus',refresh);
  return ()=>{++generation;controller?.abort();clearInterval(timer);document.removeEventListener('visibilitychange',refresh);window.removeEventListener('focus',refresh);};
 });
 function close(){open=false;trigger?.focus();}
 function toggle(){open=!open;trigger?.focus();if(open)void load();}
 async function mark(item:Notice,navigate=false) {
  if(updating||busy)return;const current=generation;updating=true;
  try {if(canOperate(user,'notifications.update'))await scheduleRequest(`/v1/notifications/${item.id}/read-receipt`,'PUT',{});if(current!==generation)return;if(navigate){if((item.href?.startsWith('/schedule?occurrence=')||item.href?.startsWith('/workflows?request=')||item.href==='/schedule?notice=unavailable')){open=false;await goto(item.href);}else error=true;}if(current===generation)await load();}catch{if(current===generation)error=true;}finally{if(current===generation)updating=false;}
 }
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
 function kind(type:string){const ja=$localization.displayLanguage==='ja';const workflow:Record<string,[string,string]>={'workflow.requested':['承認依頼','Approval requested'],'workflow.approved':['承認されました','Approved'],'workflow.returned':['差し戻されました','Returned'],'workflow.rejected':['却下されました','Rejected'],'workflow.completed':['最終承認が完了しました','Final approval completed'],'workflow.cancelled':['申請が取り下げられました','Request withdrawn'],'workflow.comment':['コメントが追加されました','New comment'],'workflow.reassigned':['承認者が変更されました','Approver reassigned'],'workflow.payment':['受渡しの確認依頼','Transfer receipt requested'],'workflow.received':['受領が確認されました','Receipt confirmed'],'workflow.correction':['受渡し記録の訂正・取消','Transfer correction']};if(workflow[type])return workflow[type][ja?0:1];return ({'schedule.invitation':text.invitation,'schedule.change':text.change,'schedule.cancellation':text.cancellation,'schedule.response':text.response,'schedule.resource-release':text.resourceRelease} as Record<string,string>)[type]??text.notifications;}
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
    <div class="filters"><button type="button" aria-pressed={!onlyUnread} disabled={busy||updating} onclick={()=>{onlyUnread=false;void load();}}>{text.allNotifications}</button><button type="button" aria-pressed={onlyUnread} disabled={busy||updating} onclick={()=>{onlyUnread=true;void load();}}>{text.unread} ({unread})</button></div>
    {#if error}<p role="alert">{text.failed} <button type="button" onclick={()=>load()}>{text.retry}</button></p>{/if}
    <div class="items">{#each items as item(item.id)}<article class:unread={!item.readAt} data-notice-id={item.id}><button type="button" class="notice" disabled={busy||updating} onclick={()=>mark(item,true)}><strong>{kind(item.type)}</strong><span>{item.title??text.notificationUnavailable}</span><time datetime={item.createdAt}>{new Intl.DateTimeFormat($localization.displayLanguage,{dateStyle:'short',timeStyle:'short',timeZone:$localization.timeZone}).format(new Date(item.createdAt))}</time></button>{#if !item.readAt&&canOperate(user,'notifications.update')}<button class="read" type="button" disabled={busy||updating} onclick={()=>mark(item)}>{text.markRead}</button>{/if}{#if canOperate(user,'notifications.delete')}<button class="dismiss icon-action" type="button" aria-label={`${text.deleteNotification} · ${kind(item.type)}`} title={text.deleteNotification} disabled={busy||updating} onclick={()=>dismiss(item)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6"/></svg></button>{/if}</article>{:else}<p>{busy?text.loading:text.noNotifications}</p>{/each}</div>
    {#if hasMore}<button class="more" type="button" disabled={busy||updating} onclick={()=>load(true)}>{text.more}</button>{/if}
   </section>
  {/if}
 </div>
{/if}
<style>
 .notifications{position:relative}.bell{position:relative;display:grid;place-items:center;width:34px;height:34px;padding:7px;background:transparent!important;color:var(--muted)!important;border-radius:4px}.bell:hover{background:var(--surface-hover)!important}.bell svg{width:20px;height:20px}.badge{position:absolute;right:-4px;top:-2px;background:var(--danger);color:white;border-radius:12px;font-size:10px;line-height:16px;min-width:16px;padding:0 3px}.panel{position:absolute;right:0;top:43px;width:400px;max-height:calc(100dvh - 80px);display:flex;flex-direction:column;border:1px solid var(--border);border-radius:var(--radius);box-shadow:0 8px 24px #0003;background:var(--surface);color:var(--text);overflow:hidden}.panel header{display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border-bottom:1px solid var(--border)}.header-actions{display:flex;gap:4px;align-items:center}.icon-action{display:inline-grid;place-items:center;width:32px;height:32px;padding:6px;margin:0;border:0;background:transparent!important;color:var(--muted)!important}.icon-action svg{width:20px;height:20px}.icon-action:hover:not(:disabled){background:var(--surface-hover)!important}.delete-read,.dismiss:hover:not(:disabled){color:var(--danger)!important}.dismiss{grid-column:2;grid-row:1 / span 2;align-self:start}.read{grid-column:1;justify-self:start}.filters{display:flex;gap:4px;flex-wrap:wrap;padding:8px;border-bottom:1px solid var(--border)}.filters button,.read{font-size:var(--font-size-support);padding:6px 8px}.filters button[aria-pressed=true]{background:var(--action-primary)!important;color:white!important}.items{overflow-y:auto;min-height:60px}.items p,.panel>p{padding:12px 16px;margin:0}.items article{display:grid;grid-template-columns:minmax(0,1fr) 32px;gap:0 8px;border-bottom:1px solid var(--border);padding:8px 12px}.items article.unread{background:color-mix(in srgb,var(--action-primary) 10%,var(--surface));border-left:3px solid var(--action-primary)}.notice{display:flex;flex-direction:column;gap:3px;text-align:left;width:100%;padding:4px;background:transparent!important;overflow-wrap:anywhere}.notice strong{font-size:var(--font-size-support)}.notice time{font-size:12px;color:var(--muted)}.read{margin-top:4px;color:var(--action-primary)!important}.more{padding:10px;border-top:1px solid var(--border)}button:disabled{opacity:.5;cursor:default}@media(max-width:700px){.panel{position:fixed;left:8px;right:8px;top:60px;width:auto;max-height:calc(100dvh - 76px)}.bell{width:40px;height:40px}.filters button,.read{min-height:44px}.icon-action{width:44px;height:44px}.items article{grid-template-columns:minmax(0,1fr) 44px}.panel header{padding:8px 12px}}
</style>
