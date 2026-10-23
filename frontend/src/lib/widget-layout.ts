import type {WidgetDimensions} from './widgets';
export const WIDGET_COLUMN_WIDTH=230;
// Content keeps its original design scale as the minimum grid cell changes.
export const WIDGET_CONTENT_BASE_SIZE=320;
// Border, padding and fixed header occupy 82px of a one-row card.
export const widgetContentScale=(cellSize:number)=>Math.max(0,Math.min(cellSize/WIDGET_CONTENT_BASE_SIZE,(cellSize-82)/(WIDGET_CONTENT_BASE_SIZE-82)));
export const WIDGET_GAP=12;
export const widgetColumns=(width:number)=>Math.max(1,Math.min(9,Math.floor((width+WIDGET_GAP)/(WIDGET_COLUMN_WIDTH+WIDGET_GAP))));
export const widgetCellSize=(width:number)=>width>0?(width-(widgetColumns(width)-1)*WIDGET_GAP)/widgetColumns(width):WIDGET_COLUMN_WIDTH;
export type WidgetPosition={column:number;row:number;width:number;height:number};
export const WIDGET_MAX_ROW=320;
export type WidgetAnchor={columns:number;column:number;row:number};
export function widgetAnchor(settings:Record<string,string[]>):WidgetAnchor|undefined{
 const values=settings.gridPosition;
 if(!Array.isArray(values)||values.length!==3||!values.every(v=>/^[1-9]\d*$/.test(v)))return;
 const [columns,column,row]=values.map(Number);
 if(columns<=9&&column<=columns&&row<=WIDGET_MAX_ROW)return {columns,column,row};
}
export const anchorSettings=(columns:number,p:Pick<WidgetPosition,'column'|'row'>)=>[String(columns),String(p.column),String(p.row)];
function cells(p:WidgetPosition,columns:number):number[]{return Array.from({length:p.height},(_,dy)=>Array.from({length:p.width},(_,dx)=>(p.row+dy-1)*columns+p.column+dx-1)).flat();}
function fits(p:WidgetPosition,columns:number,occupied:Set<number>){return p.column>=1&&p.column+p.width-1<=columns&&p.row>=1&&p.row<=WIDGET_MAX_ROW&&cells(p,columns).every(c=>!occupied.has(c));}
function reserve(p:WidgetPosition,columns:number,occupied:Set<number>){for(const c of cells(p,columns))occupied.add(c);}
function firstFree(size:WidgetDimensions,columns:number,occupied:Set<number>,start=0):WidgetPosition{
 for(let cell=start;cell<columns*WIDGET_MAX_ROW;cell++){
  const p={column:cell%columns+1,row:Math.floor(cell/columns)+1,width:Math.min(columns,size.columns),height:size.rows};
  if(fits(p,columns,occupied))return p;
 }
 // There are at most 40 cards of height 8, so a slot always exists from row 1.
 if(start)return firstFree(size,columns,occupied);
 throw Error('Widget grid is full');
}
function addPosition(positions:WidgetPosition[],columns:number,occupied:Set<number>){let cell=0;while(occupied.has(cell))cell++;return [...positions,{column:cell%columns+1,row:Math.floor(cell/columns)+1,width:1,height:1}];}
// Reserve saved positions before filling gaps. Different column counts use auto layout.
export function placeWidgets(sizes:WidgetDimensions[],columns:number,anchors:(WidgetAnchor|undefined)[]=[]):WidgetPosition[]{
 const occupied=new Set<number>();const result:WidgetPosition[]=new Array(sizes.length);
 sizes.forEach((size,index)=>{
  const a=anchors[index];if(!a||a.columns!==columns)return;
  const p={column:a.column,row:a.row,width:Math.min(columns,size.columns),height:size.rows};
  if(fits(p,columns,occupied)){result[index]=p;reserve(p,columns,occupied);}
 });
 sizes.forEach((size,index)=>{if(!result[index]){result[index]=firstFree(size,columns,occupied);reserve(result[index],columns,occupied);}});
 return addPosition(result,columns,occupied);
}
export type WidgetMove={order:number[];positions:WidgetPosition[]};
// A card target changes order; an empty target preserves every other card's position.
export function planWidgetMove(sizes:WidgetDimensions[],columns:number,current:WidgetPosition[],from:number,target:Pick<WidgetPosition,'column'|'row'>,to?:number):WidgetMove|null{
 if(!sizes[from]||to!==undefined&&(!sizes[to]||to===from))return null;
 const moved={...target,width:Math.min(columns,sizes[from].columns),height:sizes[from].rows};
 if(to!==undefined)moved.column=Math.min(moved.column,columns-moved.width+1);
 const occupied=new Set<number>();if(!fits(moved,columns,occupied))return null;
 const order=sizes.map((_,i)=>i);if(to!==undefined){order.splice(from,1);order.splice(to,0,from);}
 const result:WidgetPosition[]=new Array(sizes.length);result[from]=moved;reserve(moved,columns,occupied);
 const firstChanged=to===undefined?from:Math.min(from,to),lastChanged=to===undefined?from:Math.max(from,to);
 for(const i of order){if(i===from)continue;if(to!==undefined&&i>=firstChanged&&i<=lastChanged)continue;const p=current[i];if(fits(p,columns,occupied)){result[i]=p;reserve(p,columns,occupied);}else if(to===undefined)return null;}
 const start=current[firstChanged];
 for(const i of order)if(!result[i]){result[i]=firstFree(sizes[i],columns,occupied,(start.row-1)*columns+start.column-1);reserve(result[i],columns,occupied);}
 return {order,positions:addPosition(result,columns,occupied)};
}
