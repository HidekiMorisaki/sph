import { apiData } from '$lib/api';
export const clientTextFields = ['companyName','contactName','contactDepartment','contactEmail','contactMobile','postalCode','prefecture','city','streetAddress','buildingName','phoneNumber1','phoneNumber2','faxNumber1','faxNumber2'] as const;
export const removedClientFields=["openedOn","closedOn","managerEmployeeId", "deputyManagerEmployeeId", "sortOrder", "phoneNumber1Label", "phoneNumber2Label", "faxNumber1Label", "faxNumber2Label"];
export type ClientTextField = typeof clientTextFields[number];
export type WorkforceMaster = Partial<Record<ClientTextField,string|null>> & {
 countryCode?:string; notes?:string|null;
 clientId?:number|null; client?:{id:number;name:string;companyName:string}|null; contractStartsOn?:string|null; contractEndsOn?:string|null; id:number; name:string; category?:string|null; description:string|null; createdAt:string; updatedAt:string };
export type WorkforceRecord = { id:number; employeeId:number; skillId?:number; projectId?:number; proficiency?:number; experienceYears?:number|null; notes?:string|null; startsOn?:string; endsOn?:string|null; responsibility?:string|null; participationStatus?:'planned'|'active'|'ended'; skill?:WorkforceMaster; project?:WorkforceMaster };
export type RecordKind = 'skills'|'participations';
export type RecordContext = { kind:RecordKind; record:WorkforceRecord|null; trigger:HTMLElement; deleting?:boolean };
export async function workforceOptions(kind:'skills'|'projects'|'clients'):Promise<WorkforceMaster[]> {
 const items:WorkforceMaster[]=[];
 for(let offset=0;;offset+=500) {
  const response=await fetch('/v1/'+kind+'?limit=500&offset='+offset+'&sortBy=name');
  if(!response.ok) throw new Error('Unable to load workforce options.');
  const rows=await apiData<WorkforceMaster[]>(response);items.push(...rows);
  if(rows.length<500) return items;
 }
}
