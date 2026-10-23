sph.ready(async context=>{
 let record;try{record=await sph.records.get('default');}catch{record={values:{note:''}};}
 let renderId=0;
 async function render(){
  const current=++renderId,text=String(record.values.note??''),empty=!text.trim(),ja=context.language==='ja';
  sph.ui.html('<div id="note-layout" class="tool note-layout"><p id="note" class="'+(empty?'empty':context.expanded?'full':'summary')+'"></p><button id="expand" class="hidden">'+(ja?'全文を表示':'Read full note')+'</button></div>');
  sph.ui.patch([{id:'note',text:empty?(ja?'設定アイコンからメモを入力して保存できます。':'Write and save a note in settings.'):text}]);
  sph.ui.on('expand','click',()=>sph.expand('<p class="full">'+text.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')+'</p>'));
  if(empty||context.expanded)return;
  // Measure with the button hidden so the entire card body is available first.
  const bounds=await sph.ui.measure('note');if(current!==renderId)return;
  if(bounds.scrollHeight>bounds.clientHeight+1)sph.ui.patch([{id:'note-layout',attribute:'class',attributeValue:'tool note-layout truncated'},{id:'expand',attribute:'class',attributeValue:''}]);
 }
 await render();sph.ui.on('$context','change',c=>{context=c;render();});
});
