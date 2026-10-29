import {get,writable} from 'svelte/store';

export type NotificationTargetKind='project-ticket'|'workflow-request'|'schedule-occurrence';
type Target={kind:NotificationTargetKind;key:string};
export const notificationTargetRequest=writable<Target|null>(null);
let finish:((viewed:boolean)=>void)|undefined;

/** A detail view confirms its own successful rendering; navigation alone is insufficient. */
export function awaitNotificationView(href:string){
 finish?.(false);
 const url=new URL(href,'http://localhost');
 const target:Target|null=url.pathname==='/projects/tickets'&&url.searchParams.get('ticket')?{kind:'project-ticket',key:url.searchParams.get('ticket')!}
  :url.pathname==='/workflows'&&url.searchParams.get('request')?{kind:'workflow-request',key:url.searchParams.get('request')!}
  :url.pathname==='/schedule'&&url.searchParams.get('occurrence')?{kind:'schedule-occurrence',key:url.searchParams.get('occurrence')!}:null;
 if(!target)return {promise:Promise.resolve(false),cancel:()=>{}};
 let settle!:(viewed:boolean)=>void;
 const promise=new Promise<boolean>(resolve=>settle=resolve);
 const timer=setTimeout(()=>complete(false),15000);
 function complete(viewed:boolean){if(finish!==complete)return;clearTimeout(timer);finish=undefined;notificationTargetRequest.set(null);settle(viewed);}
 finish=complete;notificationTargetRequest.set(target);
 return {promise,cancel:()=>complete(false)};
}
export function confirmNotificationView(kind:NotificationTargetKind,key:string){
 const target=get(notificationTargetRequest);
 if(target?.kind===kind&&target.key===key)finish?.(true);
}
