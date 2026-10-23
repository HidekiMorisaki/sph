// A deliberately small, text-only renderer for the project's own guide syntax.
// HTML is never interpreted; Svelte escapes all tokens at the rendering boundary.
export type GuideInline = {text:string;kind:'text'|'code'|'link'|'strong';href?:string};
export type GuideBlock =
 | {kind:'heading';level:number;text:string;id:string}
 | {kind:'paragraph';text:string}
 | {kind:'code';language:string;text:string}
 | {kind:'list';ordered:boolean;items:string[]}
 | {kind:'table';headers:string[];rows:string[][]};

export function guideHref(value:string):string|undefined {
 if(/[\u0000-\u0020\\]/.test(value))return undefined;
 const local:Record<string,string>={'Widget_SDK.md':'/widget-sdk','Widget_Storage.md':'/widget-sdk?document=storage','examples/widget-todo.json':'/widget-examples/widget-todo.json'};
 if(Object.hasOwn(local,value))return local[value];
 if(/^\/(?!\/)/.test(value)||value.startsWith('#'))return value;
 try {const url=new URL(value);if(url.protocol==='https:'&&!url.username&&!url.password)return url.href;}catch{/* Render unsupported destinations as text. */}
 return undefined;
}
export function guideInline(source:string):GuideInline[] {
 const result:GuideInline[]=[];let end=0;
 for(const match of source.matchAll(/`([^`]+)`|\[([^\]]+)\]\(([^\s)]+)\)|\*\*([^*]+)\*\*/g)) {
  if(match.index>end)result.push({kind:'text',text:source.slice(end,match.index).replaceAll('\\|','|')});
  if(match[1]!==undefined)result.push({kind:'code',text:match[1].replaceAll('\\|','|')});
  else if(match[4]!==undefined)result.push({kind:'strong',text:match[4]});
  else {const href=guideHref(match[3]);result.push({kind:href?'link':'text',text:match[2],...(href?{href}:{})});}
  end=match.index+match[0].length;
 }
 if(end<source.length)result.push({kind:'text',text:source.slice(end).replaceAll('\\|','|')});
 return result;
}
function cells(line:string):string[] {
 const result:string[]=[];let cell='',code=false;
 for(let i=0;i<line.length;i++) {
  const c=line[i];if(c==='\\'&&line[i+1]==='|'){cell+='\\|';i++;continue;}
  if(c==='`')code=!code;
  if(c==='|'&&!code){result.push(cell.trim());cell='';}else cell+=c;
 }
 result.push(cell.trim());if(result[0]==='')result.shift();if(result.at(-1)==='')result.pop();return result;
}
export function parseGuide(source:string):GuideBlock[] {
 const lines=source.replace(/^\uFEFF/,'').replaceAll('\r\n','\n').split('\n'),blocks:GuideBlock[]=[];let i=0,heading=0;
 const list=(line:string)=>line.match(/^(\d+\.|-)\s+(.+)$/);
 const startsBlock=(line:string)=>!line.trim()||/^#{1,6}\s|^```/.test(line)||!!list(line)||line.startsWith('|');
 while(i<lines.length) {
  const line=lines[i];if(!line.trim()){i++;continue;}
  const title=line.match(/^(#{1,6})\s+(.+)$/);
  if(title){blocks.push({kind:'heading',level:title[1].length,text:title[2],id:`section-${heading++}`});i++;continue;}
  if(line.startsWith('```')){const language=line.slice(3).trim(),content:string[]=[];i++;while(i<lines.length&&!lines[i].startsWith('```'))content.push(lines[i++]);if(i===lines.length)throw Error('Unclosed code block');i++;blocks.push({kind:'code',language,text:content.join('\n')});continue;}
  if(line.startsWith('|')&&/^\|[\s:|\-]+\|$/.test(lines[i+1]??'')){const headers=cells(line),rows:string[][]=[];i+=2;while(i<lines.length&&lines[i].startsWith('|')){const row=cells(lines[i++]);if(row.length!==headers.length)throw Error('Invalid guide table');rows.push(row);}blocks.push({kind:'table',headers,rows});continue;}
  const first=list(line);
  if(first){const ordered=first[1]!=='-',items:string[]=[];while(i<lines.length){const item=list(lines[i]);if(!item||(item[1]!=='-')!==ordered)break;items.push(item[2]);i++;}blocks.push({kind:'list',ordered,items});continue;}
  const content=[line];i++;while(i<lines.length&&!startsBlock(lines[i]))content.push(lines[i++]);blocks.push({kind:'paragraph',text:content.join(' ')});
 }
 return blocks;
}
