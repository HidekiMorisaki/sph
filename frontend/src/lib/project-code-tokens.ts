import type {SyntaxTree} from '../../vendor/highlightjs-11.12.0/core.mjs';
export type SyntaxToken={text:string;kind:string};
const allowed=new Set(['comment','string','number','keyword','literal','title','function','attr','attribute','type','symbol','meta','addition','deletion','punctuation','variable','regexp','built_in','operator','section','tag','name','link','quote','bullet','selector-tag','selector-class','selector-id','selector-attr','selector-pseudo','property']);
export function syntaxTokens(tree:SyntaxTree,source:string):SyntaxToken[]{
 const result:SyntaxToken[]=[];let count=0;
 function walk(node:SyntaxTree,scope='plain',depth=0){
  if(depth>64||++count>100000)throw Error('Syntax tree limit');
  if(typeof node==='string'){if(node){const previous=result.at(-1);if(previous?.kind===scope)previous.text+=node;else result.push({text:node,kind:scope});}return;}
  const kind=node.scope?.split('.')[0];for(const child of node.children)walk(child,kind&&allowed.has(kind)?kind:scope,depth+1);
 }
 try{walk(tree);if(result.map(token=>token.text).join('')!==source)throw Error('Syntax text changed');return result;}catch{return [{text:source,kind:'plain'}];}
}
