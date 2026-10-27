import {canPlaceField,fieldGrid,gridsOverlap,FORM_GRID_COLUMNS,FORM_GRID_ROWS,type Field,type FieldGrid} from './workflow-form.ts';

/** Plan an arrow move without mutating the template, preserving every component's size. */
export function planFieldMove(fields:Field[],id:string,direction:-1|1):ReturnType<typeof fieldGrid>|null {
 const current=fieldGrid(fields),selected=current.find(item=>item.field.id===id);
 if(!selected)return null;
 const next={...selected.grid,row:selected.grid.row+direction};
 const visual=(a:typeof selected,b:typeof selected)=>a.grid.row-b.grid.row||a.grid.column-b.grid.column;
 if(canPlaceField(fields,id,next))return current.map(item=>item.field.id===id?{field:item.field,grid:next}:item).sort(visual);
 const ordered=[...current].sort(visual),index=ordered.findIndex(item=>item.field.id===id),neighbour=index+direction;
 if(neighbour<0||neighbour>=ordered.length)return null;
 [ordered[index],ordered[neighbour]]=[ordered[neighbour],ordered[index]];
 // Flow forward in the new visual order. Later components must not refill earlier gaps.
 const placed:ReturnType<typeof fieldGrid>=[];
 let startRow=1,startColumn=1;
 for(const item of ordered){
  let position:FieldGrid|null=null;
  for(let row=startRow;row<=FORM_GRID_ROWS-item.grid.height+1&&!position;row++){
   for(let column=row===startRow?startColumn:1;column<=FORM_GRID_COLUMNS-item.grid.width+1;column++){
    const candidate={...item.grid,row,column};
    if(placed.every(other=>!gridsOverlap(other.grid,candidate))){position=candidate;break;}
   }
  }
  if(!position)return null;
  placed.push({field:item.field,grid:position});startRow=position.row;startColumn=position.column+position.width;
  if(startColumn>FORM_GRID_COLUMNS){startRow++;startColumn=1;}
 }
 return placed;
}
