export function localDate(timeZone:string,now=new Date()):string {
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
 return ['year','month','day'].map(type=>parts.find(p=>p.type===type)!.value).join('-');
}
