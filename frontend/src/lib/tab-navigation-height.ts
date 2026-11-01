/** Reserve wrapping for every selected label without changing selection or mounting content. */
export function tabNavigationHeight(navigation:HTMLElement):number {
 const buttons=[...navigation.querySelectorAll<HTMLElement>('[role=tab]')];
 const weights=buttons.map(button=>button.style.fontWeight);
 navigation.style.removeProperty('min-height');
 let height=navigation.getBoundingClientRect().height;
 try{
  for(const selected of buttons){for(const button of buttons)button.style.fontWeight=button===selected?'600':'400';height=Math.max(height,navigation.getBoundingClientRect().height);}
 }finally{buttons.forEach((button,index)=>button.style.fontWeight=weights[index]);}
 navigation.style.minHeight=`${Math.ceil(height)}px`;
 return height;
}
