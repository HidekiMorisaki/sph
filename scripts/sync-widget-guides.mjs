// First-party documentation only. No Markdown libraries or third-party assets.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
const root=new URL('../',import.meta.url),check=process.argv.includes('--check');
for(const [source,target,markdown] of [['docs/Widget_SDK.md','frontend/static/widget-sdk.md',true],['docs/Widget_Storage.md','frontend/static/widget-storage.md',true],['docs/examples/widget-todo.json','frontend/static/widget-examples/widget-todo.json',false]]) {
 const input=readFileSync(new URL(source,root),'utf8').replace(/^\uFEFF/,'').replaceAll('\r\n','\n');
 const expected=(markdown?'\uFEFF':'')+input;
 if(check){if(readFileSync(new URL(target,root),'utf8')!==expected)throw Error('Guide copy out of sync: '+target);}
 else {const file=new URL(target,root);mkdirSync(new URL('./',file),{recursive:true});writeFileSync(file,expected);}
}
console.log(check?'Widget guide copies match their sources.':'Widget guide copies synchronized.');
