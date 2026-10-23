sph.ready(context=>{
 let lang=context.language,elapsed=0,started=null,laps=[],renderId=0;
 const text=()=>lang==='ja'?{start:'開始',pause:'一時停止',reset:'リセット',lap:'ラップ',all:'すべて表示',empty:'計測中に記録したラップが表示されます。'}:{start:'Start',pause:'Pause',reset:'Reset',lap:'Lap',all:'Show all',empty:'Laps recorded while running appear here.'};
 const now=()=>elapsedAt({elapsed,startedAt:started},performance.now());
 const format=ms=>formatDuration(ms,true);
 const parts=value=>{const time=format(value),colon=time.indexOf(':');return [time.slice(0,colon+1),time.slice(colon+1)];};
 const timeHtml=value=>{const [hours,tail]=parts(value);return '<span class="lap-hours">'+hours+'</span><span class="lap-tail">'+tail+'</span>';};
 const entry=(value,i,id='')=>'<div '+(id?'id="'+id+'" ':'')+'class="lap-entry"><small class="lap-number">'+(i+1)+'.</small><span class="lap-time">'+timeHtml(value)+'</span></div>';
 function draw(){const t=text();sph.ui.patch([{id:'time',text:format(now())},{id:'toggle',text:started===null?t.start:t.pause}]);}
 async function renderLaps(){
  const current=++renderId;
  // Measure all laps with the button hidden before reserving any button space.
  sph.ui.patch([{id:'laps',attribute:'class',attributeValue:laps.length?'laps':'laps empty'},{id:'lap-empty',attribute:'class',attributeValue:laps.length?'hidden':''},{id:'expand',attribute:'class',attributeValue:'hidden'},...Array.from({length:100},(_,i)=>({id:'lap-'+i,attribute:'class',attributeValue:i<laps.length?'lap-entry':'hidden'}))]);
  if(laps.length)sph.ui.patch(laps.flatMap((v,i)=>{const [hours,tail]=parts(v);return [{id:'lap-hours-'+i,text:hours},{id:'lap-tail-'+i,text:tail}];}));
  if(!laps.length||context.expanded)return;
  const full=await sph.ui.measure('laps');if(current!==renderId)return;
  if(full.scrollHeight<=full.clientHeight+1)return;
  sph.ui.patch([{id:'expand',attribute:'class',attributeValue:''}]);
  const [bounds,line]=await Promise.all([sph.ui.measure('laps'),sph.ui.measure('lap-line')]);if(current!==renderId)return;
  // clientHeight includes 20px of padding. Each row has three laps and an 8px gap.
  let rows=Math.max(0,Math.floor((bounds.clientHeight-20+8)/(Math.max(1,line.clientHeight)+8))+1);
  // Measure the actual grid to avoid losing a row to rounded clientHeight values.
  while(current===renderId){
   const start=Math.max(0,laps.length-rows*3);
   sph.ui.patch(Array.from({length:100},(_,i)=>({id:'lap-'+i,attribute:'class',attributeValue:i>=start&&i<laps.length?'lap-entry':'hidden'})));
   const fit=await sph.ui.measure('laps');if(current!==renderId)return;
   if(rows===0||fit.scrollHeight<=fit.clientHeight+1)return;
   rows--;
  }
 }
 function render(){const t=text();
  const cells=Array.from({length:100},(_,i)=>'<div id="lap-'+i+'" class="hidden"><small class="lap-number">'+(i+1)+'.</small><span class="lap-time"><span id="lap-hours-'+i+'" class="lap-hours"></span><span id="lap-tail-'+i+'" class="lap-tail"></span></span></div>').join('');
  sph.ui.html('<div class="tool"><output id="time" class="time"></output><div class="actions"><button id="toggle" class="primary">'+t.start+'</button><button id="reset">'+t.reset+'</button><button id="lap">'+t.lap+'</button></div><div id="laps" class="laps empty"><span id="lap-empty">'+t.empty+'</span>'+cells+'</div><div class="lap-probe" aria-hidden="true">'+[0,1,2].map(i=>entry(0,i,i===0?'lap-line':'')).join('')+'</div><button id="expand" class="hidden">'+t.all+'</button><small id="hint" class="hidden"></small></div>');
  sph.ui.on('toggle','click',()=>{if(started===null)started=performance.now();else{elapsed=now();started=null;}draw();});
  sph.ui.on('reset','click',()=>{elapsed=0;started=null;laps=[];renderLaps();draw();});
  sph.ui.on('lap','click',()=>{if(started!==null&&laps.length<100){laps.push(now());renderLaps();}});
  sph.ui.on('expand','click',()=>sph.expand('<div class="laps full">'+laps.map((v,i)=>entry(v,i)).join('')+'</div>'));
  renderLaps();draw();
 }
 render();setInterval(draw,100);sph.ui.on('$context','change',c=>{context=c;lang=c.language;render();});
});
