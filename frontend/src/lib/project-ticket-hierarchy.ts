import {emptyGroup,type SearchField,type SearchGroup,type SearchNode} from './search';
import {splitSearchFields,searchFieldValue,searchFieldNode} from './search-field-inputs';

const input=(field:SearchField)=>({context:'ticket',root:true,field});
const includesField=(node:SearchNode,code:string):boolean=>node.kind==='rule'?node.field===code:node.children.some(child=>includesField(child,code));

export function hierarchySelection(conditions:SearchGroup,field:SearchField){
 const item=input(field),split=splitSearchFields(conditions,[item]);
 return {value:searchFieldValue(split.represented.get(item),item)[0],additional:includesField(split.remaining,field.code)};
}

export function replaceHierarchySelection(conditions:SearchGroup,field:SearchField,value:string):SearchGroup{
 const item=input(field),split=splitSearchFields(conditions,[item]),node=searchFieldNode(item,[value,'']);
 return {...emptyGroup(),children:[...split.remaining.children,...(node?[node]:[])]};
}
