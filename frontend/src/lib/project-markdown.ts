import { Lexer, type Token, type Tokens } from 'marked';

export type MarkdownNode = {
 kind: 'text'|'paragraph'|'heading'|'strong'|'em'|'del'|'quote'|'list'|'item'|'table'|'row'|'cell'|'link'|'image'|'code'|'inline-code'|'break'|'rule';
 text?: string; children?: MarkdownNode[]; href?: string; language?: string; title?: string;
 level?: number; ordered?: boolean; start?: number; checked?: boolean; header?: boolean; literal?:boolean;
};
export type ProjectReference = {code:string;href:string};
export const markdownImagePattern = /^sph-image:([a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12})$/;

export function markdownHref(value:string):string|undefined {
 value=decodeMarkdownEntities(value);
 if(/[\u0000-\u0020\u007f\\]/.test(value)||value.startsWith('//'))return;
 if(value.startsWith('#')||/^\/(?!\/)/.test(value))return value;
 try{const url=new URL(value);if(['https:','http:','mailto:'].includes(url.protocol)&&!url.username&&!url.password)return url.href;}catch{/* Plain text for unsupported destinations. */}
}

export function decodeMarkdownEntities(value:string):string {
 const named:Record<string,string>={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:'\u00a0'};
 return value.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi,(original,key:string)=>{
  if(key[0]!=='#')return named[key.toLowerCase()]??original;
  const code=key[1]?.toLowerCase()==='x'?parseInt(key.slice(2),16):Number(key.slice(1));
  return code>0&&code<=0x10ffff&&!(code>=0xd800&&code<=0xdfff)?String.fromCodePoint(code):'\ufffd';
 });
}

// Match complete canonical references, including next to Japanese punctuation.
export function referenceParts(text:string):Array<{text:string;code?:string}> {
 const matches=/(?<![A-Za-z0-9_./@-])([A-Z][A-Z0-9_]{0,63}(?:-[0-9]{4,10})?)(?![A-Za-z0-9_/@-]|\.[A-Za-z0-9_])/g;
 const parts:Array<{text:string;code?:string}>=[];let end=0;
 for(const m of text.matchAll(matches)){
  if(m.index>end)parts.push({text:text.slice(end,m.index)});
  const suffix=/-([0-9]+)$/.exec(m[0]);
  const valid=!suffix||(Number(suffix[1])>0&&Number(suffix[1])<=2147483647&&String(Number(suffix[1])).padStart(4,'0')===suffix[1]);
  parts.push({text:m[0],...(valid?{code:m[0]}:{})});end=m.index+m[0].length;
 }
 if(end<text.length)parts.push({text:text.slice(end)});
 return parts;
}

export function referenceCandidates(nodes:MarkdownNode[]):string[] {
 const codes=new Set<string>();
 function walk(items:MarkdownNode[]){for(const n of items){if(n.literal||['link','image','code','inline-code'].includes(n.kind))continue;if(n.kind==='text')for(const p of referenceParts(n.text??''))if(p.code)codes.add(p.code);if(n.children)walk(n.children);}}
 walk(nodes);return [...codes];
}

// Render a bounded AST as escaped Svelte nodes, never as generated HTML.
export function parseProjectMarkdown(source:string):MarkdownNode[] {
 if(source.length>20000)return [{kind:'text',text:source}];
 let count=0;
 function convert(tokens:Token[],depth=0):MarkdownNode[]{
  if(depth>48||count>10000)throw Error('Markdown complexity limit');
  return tokens.flatMap((token):MarkdownNode[]=>{
   if(++count>10000)throw Error('Markdown complexity limit');
   switch(token.type){
    case 'space': case 'def': return [];
    case 'html': return [{kind:'text',text:token.raw,literal:true}];
    case 'escape': return [{kind:'text',text:(token as Tokens.Escape).text,literal:true}];
    case 'text': {const t=token as Tokens.Text;return t.tokens?convert(t.tokens,depth+1):[{kind:'text',text:decodeMarkdownEntities(t.text)}];}
    case 'paragraph': return [{kind:'paragraph',children:convert((token as Tokens.Paragraph).tokens,depth+1)}];
    case 'heading': {const t=token as Tokens.Heading;return [{kind:'heading',level:t.depth,children:convert(t.tokens,depth+1)}];}
    case 'strong':case 'em':case 'del': return [{kind:token.type,children:convert((token as Tokens.Strong).tokens,depth+1)}];
    case 'blockquote': return [{kind:'quote',children:convert((token as Tokens.Blockquote).tokens,depth+1)}];
    case 'br': return [{kind:'break'}];
    case 'hr': return [{kind:'rule'}];
    case 'code': {
     const t=token as Tokens.Code,info=t.lang??'',titled=/^([^\s:]+)[ \t]*:([\s\S]*)$/.exec(info);
     const title=titled?.[2].trim();
     return [{kind:'code',text:t.text,language:titled?.[1]??(info.split(/\s/)[0]||'text'),...(title?{title}:{})}];
    }
    case 'codespan': return [{kind:'inline-code',text:(token as Tokens.Codespan).text}];
    case 'link': {const t=token as Tokens.Link;return [{kind:'link',href:markdownHref(t.href),children:convert(t.tokens,depth+1)}];}
    case 'image': {const t=token as Tokens.Image;return [{kind:'image',text:t.text,href:markdownImagePattern.test(t.href)?t.href:markdownHref(t.href)}];}
    case 'list': {const t=token as Tokens.List;return [{kind:'list',ordered:t.ordered,start:Number(t.start)||1,children:t.items.map(item=>({kind:'item',...(item.task?{checked:Boolean(item.checked)}:{}),children:convert(item.tokens,depth+1)}))}];}
    case 'table': {const t=token as Tokens.Table;const row=(cells:Tokens.TableCell[],header:boolean):MarkdownNode=>({kind:'row',children:cells.map(cell=>({kind:'cell',header,children:convert(cell.tokens,depth+1)}))});return [{kind:'table',children:[row(t.header,true),...t.rows.map(cells=>row(cells,false))]}];}
    default:return [{kind:'text',text:token.raw}];
   }
  });
 }
 try{return convert(Lexer.lex(source,{gfm:true,breaks:true}));}catch{return [{kind:'text',text:source}];}
}

export async function resolveMarkdownReferences(codes:string[],signal:AbortSignal):Promise<ProjectReference[]> {
 const result:ProjectReference[]=[];
 for(let offset=0;offset<codes.length;offset+=500){
  const r=await fetch('/v1/project-reference-resolutions',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({codes:codes.slice(offset,offset+500)}),signal});
  if(!r.ok)throw Error('Reference lookup unavailable');
  const payload=await r.json();result.push(...payload.data);
 }
 return result;
}
