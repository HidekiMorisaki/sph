sph.ready(context=>{
 let state=initialCalculator(),lang=context.language;
 const keys=[['%','%'],['CE','CE'],['C','C'],['Backspace','⌫'],['7','7'],['8','8'],['9','9'],['/','÷'],['4','4'],['5','5'],['6','6'],['*','×'],['1','1'],['2','2'],['3','3'],['-','−'],['sign','±'],['0','0'],['.','.'],['+','+'],['=','=']];
 const keyClass=key=>key==='='?'primary':/^[0-9.]$/.test(key)?'key-number':['+','-','*','/'].includes(key)?'key-operator':['C','CE','Backspace'].includes(key)?'key-clear':'key-function';
 function draw(){sph.ui.patch([{id:'expression',text:state.expression.replaceAll('*','×').replaceAll('/','÷')},{id:'result',text:state.error?'—':state.entry},{id:'result',attribute:'class',attributeValue:'result'+(state.entry.length>10?' result-long':'')},{id:'error',text:state.error?(lang==='ja'?(state.error==='zero'?'0で割ることはできません。':'計算結果が範囲外です。'):(state.error==='zero'?'Cannot divide by zero.':'Result is out of range.')):''}]);}
 function press(key){state=calculatorInput(state,key);draw();}
 sph.ui.html('<div id="calculator" class="tool" role="group" tabindex="0" aria-label="Calculator"><div id="expression" class="expression"></div><button id="copy" class="copy" data-copy="result" aria-label="Copy result"><output id="result" class="result">0</output></button><small id="error" class="error" role="alert"></small><div class="keys">'+keys.map(([key,label],i)=>'<button id="key'+i+'" data-calc-key="'+key+'" class="'+keyClass(key)+'">'+label+'</button>').join('')+'</div></div>');
 keys.forEach(([key],i)=>sph.ui.on('key'+i,'click',()=>press(key)));
 const keyboard=['0','1','2','3','4','5','6','7','8','9','.','+','-','*','/','%','Enter','Backspace','Delete','Escape'];
 sph.ui.on('calculator','keydown',e=>press(({Enter:'=',Delete:'CE',Escape:'C'})[e.key]??e.key),keyboard);draw();
 sph.ui.on('$context','change',c=>{lang=c.language;draw();});
});
