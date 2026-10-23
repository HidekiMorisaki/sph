export type TimerClock={elapsed:number;startedAt:number|null};
export const elapsedAt=(clock:TimerClock,now:number)=>clock.elapsed+(clock.startedAt===null?0:Math.max(0,now-clock.startedAt));
export const startClock=(clock:TimerClock,now:number):TimerClock=>clock.startedAt===null?{...clock,startedAt:now}:clock;
export const pauseClock=(clock:TimerClock,now:number):TimerClock=>({elapsed:elapsedAt(clock,now),startedAt:null});
export function formatDuration(milliseconds:number,fraction=false):string{
 const total=Math.max(0,Math.floor(milliseconds/1000));
 const text=[Math.floor(total/3600),Math.floor(total/60)%60,total%60].map(v=>String(v).padStart(2,'0')).join(':');
 return text+(fraction?'.'+Math.floor(Math.max(0,milliseconds)%1000/10).toString().padStart(2,'0'):'');
}
