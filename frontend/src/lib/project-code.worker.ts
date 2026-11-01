/// <reference lib="webworker" />
import highlight,{type LanguageDefinition} from '../../vendor/highlightjs-11.12.0/core.mjs';
import catalogue from './project-code-languages.json' with {type:'json'};
import {syntaxTokens} from './project-code-tokens';
const modules=import.meta.glob<{default:LanguageDefinition}>('../../vendor/highlightjs-11.12.0/languages/*.js');
const loaded=new Set<string>();
const identity=(id:string)=>catalogue.find(row=>row.id===id)??catalogue.find(row=>row.aliases.includes(id));
async function load(id:string){
 const language=identity(id);if(!language||loaded.has(language.id))return;loaded.add(language.id);
 try{for(const embedded of language.embedded)await load(embedded);const module=await modules[`../../vendor/highlightjs-11.12.0/languages/${language.id}.js`]();highlight.registerLanguage(language.id,module.default);}catch{loaded.delete(language.id);throw Error('Language load failed');}
}
self.onmessage=async(event:MessageEvent<{id:number;source:string;language:string}>)=>{
 const {id,source,language}=event.data;
 try{const canonical=identity(language);if(source.length>20000||!canonical)throw Error();await load(canonical.id);const result=highlight.highlight(source,{language:canonical.id,ignoreIllegals:true});self.postMessage({id,tokens:syntaxTokens(result._emitter.rootNode,source)});}catch{self.postMessage({id,tokens:[{text:source,kind:'plain'}]});}
};
