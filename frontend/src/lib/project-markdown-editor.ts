import catalogue from './project-code-languages.json' with {type:'json'};
import {Lexer,type Token,type Tokens} from 'marked';
export type CodeLanguageOption={id:string;name:string;aliases?:string[]};
export const codeLanguageOptions:CodeLanguageOption[]=[
 {id:'text',name:'Plain text',aliases:['plaintext','txt','plain']},...catalogue.filter(row=>row.id!=='plaintext'),
 {id:'mermaid',name:'Mermaid',aliases:[]},{id:'plantuml',name:'PlantUML',aliases:['puml']}
];

// Return the opening fence immediately before the caret, never a closing fence.
export function openingCodeFence(source:string,caret:number):{from:number;to:number}|null {
 if(!Number.isInteger(caret)||caret<0||caret>source.length||source.length>20000)return null;
 const prefix=source.slice(0,caret);
 if(!prefix.endsWith('```')||source.slice(caret).split('\n')[0].trim())return null;
 const last=(tokens:Token[]):Token|undefined=>tokens.findLast(token=>token.type!=='space'&&token.type!=='def');
 try{
  let token=last(Lexer.lex(prefix,{gfm:true}));
  while(token?.type==='blockquote'||token?.type==='list')token=token.type==='blockquote'?last((token as Tokens.Blockquote).tokens):last((token as Tokens.List).items.at(-1)?.tokens??[]);
  return token?.type==='code'&&(token as Tokens.Code).codeBlockStyle!=='indented'&&token.raw.trim()==='```'?{from:caret-3,to:caret}:null;
 }catch{return null;}
}
