import type {SyntaxToken} from './project-code-tokens';
type Job={id:number;source:string;language:string;resolve:(tokens:SyntaxToken[])=>void};
let worker:Worker|null=null,active:Job|null=null,sequence=0,timer:ReturnType<typeof setTimeout>|undefined,idle:ReturnType<typeof setTimeout>|undefined;
const waiting:Job[]=[];
const plain=(job:Job)=>[{text:job.source,kind:'plain'}];
function stop(){worker?.terminate();worker=null;clearTimeout(timer);}
function pump(){
 if(active||!waiting.length)return;clearTimeout(idle);active=waiting.shift()!;
 try{
  if(!worker){worker=new Worker(new URL('./project-code.worker.ts',import.meta.url),{type:'module'});worker.onmessage=event=>{if(!active||event.data.id!==active.id)return;const job=active;clearTimeout(timer);active=null;const tokens=event.data.tokens as SyntaxToken[];job.resolve(Array.isArray(tokens)&&tokens.every(t=>typeof t.text==='string'&&typeof t.kind==='string')&&tokens.map(t=>t.text).join('')===job.source?tokens:plain(job));pump();if(!active)idle=setTimeout(stop,30000);};worker.onerror=()=>finishFailed();}
  timer=setTimeout(finishFailed,2000);worker.postMessage({id:active.id,source:active.source,language:active.language});
 }catch{finishFailed();}
}
function finishFailed(){const job=active;active=null;stop();if(job)job.resolve(plain(job));pump();}
export function highlightProjectCode(source:string,language:string):{result:Promise<SyntaxToken[]>;cancel:()=>void}{
 const id=++sequence;
 const result=new Promise<SyntaxToken[]>(resolve=>{if(source.length>20000||language==='text'||typeof Worker==='undefined'){resolve([{text:source,kind:'plain'}]);return;}if(waiting.length>=256){resolve([{text:source,kind:'plain'}]);return;}waiting.push({id,source,language,resolve});pump();});
 return {result,cancel:()=>{const index=waiting.findIndex(job=>job.id===id);if(index>=0){const [job]=waiting.splice(index,1);job.resolve(plain(job));}else if(active?.id===id)finishFailed();}};
}
