export type DiffLine={kind:'same'|'added'|'removed';text:string};
export function lineDiff(before:string,after:string):DiffLine[]{
 const lines=(s:string)=>s===''?[]:s.split('\n');const a=lines(before),b=lines(after);
 let start=0,end=0;while(start<a.length&&start<b.length&&a[start]===b[start])start++;
 while(end<a.length-start&&end<b.length-start&&a[a.length-1-end]===b[b.length-1-end])end++;
 const x=a.slice(start,a.length-end),y=b.slice(start,b.length-end),result:DiffLine[]=a.slice(0,start).map(text=>({kind:'same',text}));
 if((x.length+1)*(y.length+1)>1000000){result.push(...x.map(text=>({kind:'removed' as const,text})),...y.map(text=>({kind:'added' as const,text})));}
 else{const cols=y.length+1,dp=new Uint32Array((x.length+1)*cols);for(let i=x.length-1;i>=0;i--)for(let j=y.length-1;j>=0;j--)dp[i*cols+j]=x[i]===y[j]?1+dp[(i+1)*cols+j+1]:Math.max(dp[(i+1)*cols+j],dp[i*cols+j+1]);let i=0,j=0;while(i<x.length||j<y.length){if(i<x.length&&j<y.length&&x[i]===y[j]){result.push({kind:'same',text:x[i++]});j++;}else if(i<x.length&&(j===y.length||dp[(i+1)*cols+j]>=dp[i*cols+j+1]))result.push({kind:'removed',text:x[i++]});else result.push({kind:'added',text:y[j++]});}}
 return result.concat(a.slice(a.length-end).map(text=>({kind:'same' as const,text})));
}
export function descriptionChange(detail:unknown):{before:string;after:string}|null{
 if(!detail||typeof detail!=='object')return null;const d=detail as Record<string,unknown>;
 if(!d.before||!d.after||typeof d.before!=='object'||typeof d.after!=='object')return null;
 const before=(d.before as Record<string,unknown>).description,after=(d.after as Record<string,unknown>).description;
 return typeof before==='string'&&typeof after==='string'&&before!==after?{before,after}:null;
}
export function withoutDescription(detail:unknown):unknown{
 if(!descriptionChange(detail))return detail;const d=detail as {before:Record<string,unknown>;after:Record<string,unknown>};const before={...d.before},after={...d.after};delete before.description;delete after.description;return {...d,before,after};
}
