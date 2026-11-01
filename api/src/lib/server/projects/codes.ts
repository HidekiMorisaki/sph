export const projectCodePattern = /^[A-Z][A-Z0-9_]{0,63}$/;

export function normalizeProjectCode(value: unknown): string | null {
 if (typeof value !== 'string') return null;
 const input=value.trim();
 if(!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(input))return null;
 const code=input.toUpperCase();
 return projectCodePattern.test(code)?code:null;
}

export function ticketCode(projectCode: string, number: number): string {
 return projectCode+'-'+String(number).padStart(4,'0');
}

export function parseTicketCode(value: string): {projectCode:string;number:number} | null {
 const match=/^([A-Z][A-Z0-9_]{0,63})-([0-9]{4,10})$/.exec(value);
 if(!match)return null;
 const number=Number(match[2]);
 return Number.isSafeInteger(number)&&number>0&&number<=2147483647&&ticketCode(match[1],number)===value?{projectCode:match[1],number}:null;
}

// PostgreSQL lpad truncates numbers wider than the requested width.
export const ticketCodeExpression="p.code||'-'||CASE WHEN length(t.number::text)<4 THEN lpad(t.number::text,4,'0') ELSE t.number::text END";
