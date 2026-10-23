export type ProgrammerBase=2|8|10|16;
export type ProgrammerBits=8|16|32|64;
export type ProgrammerOperation='+'|'-'|'*'|'/'|'mod'|'and'|'or'|'xor'|'shl'|'shr';
export type ProgrammerState={value:bigint;base:ProgrammerBase;bits:ProgrammerBits;signed:boolean;left:bigint|null;operation:ProgrammerOperation|null;replace:boolean;entered:boolean;repeat:ProgrammerOperation|null;repeatValue:bigint|null;last:{left:bigint;right:bigint;operation:ProgrammerOperation}|null;error:'zero'|'shift'|null};
export const initialProgrammer=():ProgrammerState=>({value:0n,base:10,bits:64,signed:true,left:null,operation:null,replace:false,entered:false,repeat:null,repeatValue:null,last:null,error:null});
const integer=(value:bigint,bits:ProgrammerBits,signed:boolean)=>signed?BigInt.asIntN(bits,value):BigInt.asUintN(bits,value);
export const programmerFormat=(value:bigint,base:ProgrammerBase,bits:ProgrammerBits,signed:boolean)=> (base===10?integer(value,bits,signed):BigInt.asUintN(bits,value)).toString(base).toUpperCase();
export const programmerDisplay=(state:ProgrammerState)=>programmerFormat(state.value,state.base,state.bits,state.signed);
export function programmerValue(left:bigint,right:bigint,operation:ProgrammerOperation,bits:ProgrammerBits,signed:boolean):bigint{
 const a=integer(left,bits,signed),b=integer(right,bits,signed);let result:bigint;
 switch(operation){
  case '+':result=a+b;break;case '-':result=a-b;break;case '*':result=a*b;break;
  case '/':if(b===0n)throw Error('zero');result=a/b;break;
  case 'mod':if(b===0n)throw Error('zero');result=a%b;break;
  case 'and':result=left&right;break;case 'or':result=left|right;break;case 'xor':result=left^right;break;
  case 'shl':case 'shr':if(right<0n||right>=BigInt(bits))throw Error('shift');result=operation==='shl'?BigInt.asUintN(bits,left)<<right:BigInt.asUintN(bits,left)>>right;break;
 }
 return BigInt.asUintN(bits,result);
}
export function programmerConfigure(state:ProgrammerState,change:{base?:ProgrammerBase;bits?:ProgrammerBits;signed?:boolean}):ProgrammerState{
 if(change.base!==undefined&&![2,8,10,16].includes(change.base)||change.bits!==undefined&&![8,16,32,64].includes(change.bits))return state;
 let result={...state,...change};
 if(change.bits!==undefined||change.signed!==undefined){
  result={...initialProgrammer(),base:result.base,bits:result.bits,signed:result.signed,value:BigInt.asUintN(result.bits,integer(state.value,state.bits,state.signed))};
 }
 return result;
}
const read=(text:string,base:ProgrammerBase)=>BigInt(base===10?text:(base===16?'0x':base===8?'0o':'0b')+text);
export function programmerInput(previous:ProgrammerState,key:string):ProgrammerState{
 const reset=()=>({...initialProgrammer(),base:previous.base,bits:previous.bits,signed:previous.signed});
 if(key==='clear')return reset();let state={...previous};
 if(state.error){if(/^[0-9A-F]$/.test(key)||key==='ce')state=reset();else return state;}
 try{
  if(/^[0-9A-F]$/.test(key)){
   const digit=parseInt(key,16);if(digit>=state.base)return state;
   const current=state.replace?0n:state.base===10?integer(state.value,state.bits,state.signed):state.value;
   const next=current<0n?current*BigInt(state.base)-BigInt(digit):current*BigInt(state.base)+BigInt(digit);
   const max=state.base===10&&state.signed?(1n<<BigInt(state.bits-1))-1n:(1n<<BigInt(state.bits))-1n;
   const min=state.base===10&&state.signed?-(1n<<BigInt(state.bits-1)):0n;
   if(next<min||next>max)return state;
   state.value=BigInt.asUintN(state.bits,next);state.replace=false;state.entered=true;state.repeat=null;state.repeatValue=null;state.last=null;return state;
  }
  if(key==='ce'){state.value=0n;state.replace=false;state.entered=true;state.repeat=null;state.repeatValue=null;state.last=null;return state;}
  if(key==='back'){if(!state.replace){const text=programmerDisplay(state).slice(0,-1);state.value=BigInt.asUintN(state.bits,read(!text||text==='-'?'0':text,state.base));}return state;}
  if(key==='not'||key==='sign'){state.value=BigInt.asUintN(state.bits,key==='not'?~state.value:-state.value);state.replace=key==='not';state.entered=true;return state;}
  if(['+','-','*','/','mod','and','or','xor','shl','shr'].includes(key)){
   if(state.left!==null&&state.operation&&state.entered)state.value=programmerValue(state.left,state.value,state.operation,state.bits,state.signed);
   state.left=state.value;state.operation=key as ProgrammerOperation;state.replace=true;state.entered=false;state.repeat=null;state.repeatValue=null;state.last=null;return state;
  }
  if(key==='='){
   const operation=state.operation??state.repeat,right=state.operation?state.value:state.repeatValue;
   if(operation&&right!==null){const left=state.left??state.value;state.value=programmerValue(left,right,operation,state.bits,state.signed);state.last={left,right,operation};state.repeat=operation;state.repeatValue=right;}
   state.left=null;state.operation=null;state.replace=true;return state;
  }
  return state;
 }catch(error){return {...reset(),error:error instanceof Error&&error.message==='shift'?'shift':'zero'};}
}
