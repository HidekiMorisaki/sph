export type CalculatorOperation='+'|'-'|'*'|'/';
export type CalculatorState={entry:string;operand:string|null;operation:CalculatorOperation|null;replace:boolean;operandEntered:boolean;repeatOperation:CalculatorOperation|null;repeatOperand:string|null;expression:string;error:'zero'|'range'|null};
export const initialCalculator=():CalculatorState=>({entry:'0',operand:null,operation:null,replace:false,operandEntered:false,repeatOperation:null,repeatOperand:null,expression:'',error:null});
const power=(n:number)=>10n**BigInt(n);
function fraction(value:string):[bigint,bigint]{
 const match=/^(-?)(\d+)(?:\.(\d*))?(?:e([+-]?\d+))?$/i.exec(value);
 if(!match)throw Error('range');
 const scale=(match[3]?.length??0)-Number(match[4]??0);
 const n=BigInt((match[1]||'')+match[2]+(match[3]??''));
 return scale>=0?[n,power(scale)]:[n*power(-scale),1n];
}
function format(n:bigint,d:bigint):string{
 if(d===0n)throw Error('zero');if(n===0n)return '0';
 const negative=(n<0n)!==(d<0n);n=n<0n?-n:n;d=d<0n?-d:d;
 let exponent=n.toString().length-d.toString().length;
 if(exponent>=0?n<d*power(exponent):n*power(-exponent)<d)exponent--;
 if(exponent>99||exponent< -99)throw Error('range');
 const shift=15-exponent,top=shift>=0?n*power(shift):n,bottom=shift>=0?d:d*power(-shift);
 let rounded=(top+bottom/2n)/bottom;
 if(rounded.toString().length>16){rounded/=10n;exponent++;}
 if(exponent>99)throw Error('range');
 const digits=rounded.toString().padStart(16,'0');let result:string;
 if(exponent>=16||exponent< -8){const tail=digits.slice(1).replace(/0+$/,'');result=digits[0]+(tail?'.'+tail:'')+'e'+(exponent>=0?'+':'')+exponent;}
 else{const point=exponent+1;result=point<=0?'0.'+'0'.repeat(-point)+digits:point>=digits.length?digits+'0'.repeat(point-digits.length):digits.slice(0,point)+'.'+digits.slice(point);if(result.includes('.'))result=result.replace(/0+$/,'').replace(/\.$/,'');}
 return (negative?'-':'')+result;
}
export function calculatorValue(a:string,b:string,operation:CalculatorOperation):string{
 const [an,ad]=fraction(a),[bn,bd]=fraction(b);
 if(operation==='+')return format(an*bd+bn*ad,ad*bd);
 if(operation==='-')return format(an*bd-bn*ad,ad*bd);
 if(operation==='*')return format(an*bn,ad*bd);
 return format(an*bd,ad*bn);
}
export function calculatorInput(previous:CalculatorState,key:string):CalculatorState{
 if(key==='C')return initialCalculator();
 let state={...previous};
 if(state.error){if(/^\d$|^\.$|^CE$/.test(key))state=initialCalculator();else return state;}
 try{
  if(/^\d$/.test(key)||key==='.'){
   if(state.replace){state.entry='0';state.replace=false;if(!state.operation)state.expression='';}
   if(key==='.'){if(!state.entry.includes('.')&&!state.entry.includes('e'))state.entry+='.';}
   else if(state.entry.replace(/[-.]/g,'').length<16)state.entry=state.entry==='0'?key:state.entry==='-0'?'-'+key:state.entry+key;
   state.operandEntered=true;state.repeatOperation=null;state.repeatOperand=null;return state;
  }
  if(key==='CE'){state.entry='0';state.replace=false;state.operandEntered=true;state.repeatOperation=null;state.repeatOperand=null;if(!state.operation)state.expression='';return state;}
  if(key==='Backspace'){if(!state.replace&&!state.entry.includes('e')){state.entry=state.entry.slice(0,-1);if(!state.entry||state.entry==='-')state.entry='0';}return state;}
  if(key==='sign'){if(state.entry!=='0')state.entry=state.entry.startsWith('-')?state.entry.slice(1):'-'+state.entry;state.replace=false;state.operandEntered=true;return state;}
  if(key==='%'){
   let percent=calculatorValue(state.entry,'100','/');
   if(state.operand!==null&&(state.operation==='+'||state.operation==='-'))percent=calculatorValue(state.operand,percent,'*');
   state.entry=percent;state.replace=true;state.operandEntered=true;return state;
  }
  if(['+','-','*','/'].includes(key)){
   if(state.operand!==null&&state.operation&&state.operandEntered)state.entry=calculatorValue(state.operand,state.entry,state.operation);
   state.operand=state.entry;state.operation=key as CalculatorOperation;state.replace=true;state.operandEntered=false;state.repeatOperation=null;state.repeatOperand=null;state.expression=state.entry+' '+key;return state;
  }
  if(key==='='){
   const operation=state.operation??state.repeatOperation,operand=state.operation?state.entry:state.repeatOperand;
   if(operation&&operand!==null){const first=state.operand??state.entry;state.entry=calculatorValue(first,operand,operation);state.expression=first+' '+operation+' '+operand+' =';state.repeatOperation=operation;state.repeatOperand=operand;}
   state.operand=null;state.operation=null;state.replace=true;return state;
  }
  return state;
 }catch(error){return {...initialCalculator(),error:error instanceof Error&&error.message==='zero'?'zero':'range'};}
}
