import {Prisma} from '#lib/server/generated/prisma/client.js';

type Decimal = Prisma.Decimal;
export type EvmCurrency = 'JPY'|'USD';
export type EvmWork = {budget:string;planned:string;progress:string;actual:string};
// Keep financial intermediates precise without changing Prisma's global context.
const D=Prisma.Decimal.clone({precision:48,rounding:Prisma.Decimal.ROUND_HALF_UP});
function nonnegative(value:string):Decimal{
 if(typeof value!=='string'||value.length>32||!/^\d+(?:\.\d+)?$/.test(value))throw Error('INVALID_EVM_DECIMAL');
 const result=new D(value);if(!result.isFinite()||result.gt('999999999999999999.99'))throw Error('INVALID_EVM_DECIMAL');return result;
}
export function roundEvmMoney(value:Decimal,currency:EvmCurrency):Decimal{
 if(currency!=='JPY'&&currency!=='USD')throw Error('INVALID_EVM_CURRENCY');
 return value.toDecimalPlaces(currency==='JPY'?0:2,D.ROUND_HALF_UP);
}
export function laborCost(minutes:string,hourlyRate:string,currency:EvmCurrency):string{
 return roundEvmMoney(nonnegative(minutes).div(60).mul(nonnegative(hourlyRate)),currency).toFixed(currency==='JPY'?0:2);
}
/** Inputs are disjoint baseline work packages; never sum parent and child budgets. */
export function calculateEvm(work:EvmWork[],currency:EvmCurrency){
 if(currency!=='JPY'&&currency!=='USD')throw Error('INVALID_EVM_CURRENCY');
 let bac=new D(0),pv=new D(0),ev=new D(0),ac=new D(0);
 for(const item of work){
  const budget=nonnegative(item.budget),planned=nonnegative(item.planned),progress=nonnegative(item.progress),actual=nonnegative(item.actual);
  if(progress.gt(100)||planned.gt(budget))throw Error('INVALID_EVM_WORK');
  if([budget,planned,actual].some(value=>value.decimalPlaces()>(currency==='JPY'?0:2)))throw Error('INVALID_EVM_MONEY');
  bac=bac.add(budget);pv=pv.add(planned);ev=ev.add(budget.mul(progress).div(100));ac=ac.add(actual);
 }
 if([bac,pv,ac].some(value=>value.gt('999999999999999999.99')))throw Error('EVM_TOTAL_OVERFLOW');
 const cpi=ac.isZero()?null:ev.div(ac),spi=pv.isZero()?null:ev.div(pv);
 const eac=cpi===null||cpi.isZero()?null:bac.div(cpi);
 const money=(value:Decimal)=>roundEvmMoney(value,currency).toFixed(currency==='JPY'?0:2);
 return {currency,bac:money(bac),pv:money(pv),ev:money(ev),ac:money(ac),cv:money(ev.sub(ac)),sv:money(ev.sub(pv)),cpi:cpi?.toFixed(6)??null,spi:spi?.toFixed(6)??null,eac:eac===null?null:money(eac),vac:eac===null?null:money(bac.sub(eac))};
}
