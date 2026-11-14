import {emptyGroup,type SearchField,type SearchGroup,type SearchNode,type SearchRule} from './search';

// This value exists only in controls. Persisted definitions use ordinary predicates.
export const unsetSelection='__search_unset__';
export type SelectionField={context:string;field:SearchField;root?:boolean};
export function choiceConditionNode(field:SearchField,values:string[],negative=false):SearchNode|undefined{
 const concrete=values.filter(value=>value!==unsetSelection),children:SearchNode[]=[];
 if(concrete.length)children.push({kind:'rule',field:field.code,operator:negative?'notIn':'in',value:concrete});
 if(values.includes(unsetSelection)&&field.unsetMode==='value')children.push({kind:'rule',field:field.code,operator:negative?'set':'unset'});
 return children.length>1?{...emptyGroup(),mode:negative?'all':'any',children}:children[0];
}
export function choiceConditionValues(node:SearchNode,field:SearchField):{values:string[];negative:boolean}|undefined{
 if(node.kind==='rule'){
  if(node.field!==field.code)return;
  if(['set','unset'].includes(node.operator))return {values:[unsetSelection],negative:node.operator==='set'};
  if(['eq','ne'].includes(node.operator)&&typeof node.value==='string')return {values:[node.value],negative:node.operator==='ne'};
  if(['in','notIn'].includes(node.operator)&&Array.isArray(node.value)&&node.value.every(v=>typeof v==='string'))return {values:node.value as string[],negative:node.operator==='notIn'};
  return;
 }
 if(node.context||node.children.length!==2)return;
 const parts=node.children.map(child=>choiceConditionValues(child,field));
 if(parts.some(part=>!part)||parts[0]!.negative!==parts[1]!.negative||!parts.some(part=>part?.values.includes(unsetSelection)))return;
 const negative=parts[0]!.negative;if(node.mode!==(negative?'all':'any'))return;
 return {values:parts.flatMap(part=>part!.values),negative};
}
export function selectionNode(item:SelectionField,values:string[]):SearchNode|undefined{
 const ids=values.filter(v=>v!==unsetSelection),nodes:SearchNode[]=[];
 if(ids.length){const rule:SearchRule={kind:'rule',field:item.field.code,operator:ids.length===1&&!item.field.multiple?'eq':'in',value:ids.length===1&&!item.field.multiple?ids[0]:ids};nodes.push(item.root?rule:{...emptyGroup(),context:item.context,match:'some',children:[rule]});}
 if(values.includes(unsetSelection)&&item.field.unsetMode)nodes.push(item.root?{kind:'rule',field:item.field.code,operator:'unset'}:{...emptyGroup(),context:item.context,match:item.field.unsetMode==='relation'?'none':'some',children:item.field.unsetMode==='relation'?[]:[{kind:'rule',field:item.field.code,operator:'unset'}]});
 return nodes.length>1?{...emptyGroup(),mode:'any',children:nodes}:nodes[0];
}
export function selectionValues(node:SearchNode|undefined,item:SelectionField):string[]|undefined{
 if(!node)return;
 if(node.kind==='group'&&!node.context&&node.mode==='any'&&node.children.length===2){const parts=node.children.map(n=>selectionValues(n,item));if(parts.every(p=>p?.length)&&parts.some(p=>p?.includes(unsetSelection)))return [...new Set(parts.flat() as string[])];return;}
 if(!item.root){if(node.kind!=='group'||node.context!==item.context||node.mode!=='all')return;if(node.match==='none'&&!node.children.length&&item.field.unsetMode==='relation')return [unsetSelection];if(node.match!=='some'||node.children.length!==1)return;node=node.children[0];}
 if(node.kind!=='rule'||node.field!==item.field.code)return;
 if(node.operator==='unset'&&item.field.unsetMode==='value')return [unsetSelection];
 if(node.operator==='eq'&&typeof node.value==='string')return [node.value];
 if(node.operator==='in'&&Array.isArray(node.value)&&node.value.every(v=>typeof v==='string'))return node.value as string[];
}
export function readSelection(group:SearchGroup,item:SelectionField,fallback:string[]=[]):string[]{
 if(group.mode!=='all'||group.context)return fallback;
 const matches=group.children.map(n=>selectionValues(n,item)).filter(v=>v!==undefined);return matches.length===1?matches[0]!:fallback;
}
export function replaceSelection(group:SearchGroup,item:SelectionField,values:string[]):SearchGroup{
 const node=selectionNode(item,values);
 if(group.mode!=='all'||group.context)return {...emptyGroup(),children:[group,...(node?[node]:[])]};
 const matches=group.children.filter(n=>selectionValues(n,item)!==undefined);
 // Ambiguous repeated conditions belong to the condition editor and remain untouched.
 const children=matches.length===1?group.children.filter(n=>n!==matches[0]):group.children;
 return {...group,children:[...children,...(node?[node]:[])]};
}
