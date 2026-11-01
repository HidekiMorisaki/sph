// SPH's narrow interface to the pinned, separately licensed upstream runtime.
export type LanguageDefinition=(engine:unknown)=>Record<string,unknown>;
export type SyntaxTree=string|{scope?:string;children:SyntaxTree[]};
declare const highlighter:{
 registerLanguage:(id:string,definition:LanguageDefinition)=>void;
 getLanguage:(id:string)=>{name?:string;aliases?:string[]}|undefined;
 highlight:(source:string,options:{language:string;ignoreIllegals:boolean})=>{_emitter:{rootNode:SyntaxTree};errorRaised?:unknown};
};
export default highlighter;
