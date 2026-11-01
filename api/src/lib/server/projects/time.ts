import {Prisma} from '$lib/server/generated/prisma/client';
import {success,throwApiError} from '../api/response';

// The REST contract remains numeric minutes. Decimal storage preserves hundredths
// of an hour (0.60 minutes), as well as all pre-existing minute values.
export function timeMinutes(value:unknown,min:number,max:number):Prisma.Decimal {
 if(typeof value!=='number'||!Number.isFinite(value))throwApiError(422,'INVALID_NUMBER','Invalid time.');
 const decimal=new Prisma.Decimal(value);
 if(decimal.decimalPlaces()>2||decimal.lessThan(min)||decimal.greaterThan(max))throwApiError(422,'INVALID_NUMBER','Invalid time.');
 return decimal;
}

function numericDecimals(value:unknown):unknown {
 if(Prisma.Decimal.isDecimal(value))return value.toNumber();
 if(Array.isArray(value))return value.map(numericDecimals);
 if(value&&typeof value==='object'&&Object.getPrototypeOf(value)===Object.prototype)return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,numericDecimals(item)]));
 return value;
}

export function projectSuccess(data:unknown,responseCode=200,meta?:Record<string,unknown>){
 return success(numericDecimals(data),responseCode,meta?numericDecimals(meta) as Record<string,unknown>:undefined);
}
