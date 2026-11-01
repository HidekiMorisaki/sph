// Arithmetic uses hundredths of a minute to avoid binary floating-point sums.
export function sumMinutes(values:number[]):number {
 return values.reduce((sum,value)=>sum+Math.round(value*100),0)/100;
}

export function formatHours(minutes:number):string {
 const hundredths=Math.round(Math.round(minutes*100)/60);
 return `${Math.floor(hundredths/100)}.${String(hundredths%100).padStart(2,'0')}`;
}

export function hoursToMinutes(value:string,maxMinutes:number,allowZero=true):number|null {
 if(!/^\d+(?:\.\d{1,2})?$/.test(value))return null;
 const [whole,fraction='']=value.split('.');
 const hundredths=Number(whole)*100+Number(fraction.padEnd(2,'0'));
 if(!Number.isSafeInteger(hundredths)||hundredths<(allowZero?0:1)||hundredths*60>maxMinutes*100)return null;
 return hundredths*60/100;
}
