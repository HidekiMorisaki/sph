import { Prisma } from '$lib/server/generated/prisma/client';
import type { AuthenticatedUser } from '$lib/server/auth/types';
import type { SearchContext, SearchField } from './search-registry';

export const businessTargets = ['teams', 'skills', 'clients', 'engagements'] as const;
export type BusinessTarget = typeof businessTargets[number];
export const isBusinessTarget = (target: string): target is BusinessTarget => businessTargets.some(value => value === target);
const commonSorts = ['name', 'description', 'createdAt', 'updatedAt'];
export const businessSorts: Record<BusinessTarget, string[]> = {
 teams: [...commonSorts, 'memberCount'], skills: [...commonSorts, 'category'],
 clients: ['name', 'companyName', 'contactName', 'contactDepartment', 'contactEmail', 'contactMobile', 'createdAt', 'updatedAt'],
 engagements: [...commonSorts, 'contractStartsOn', 'contractEndsOn']
};

// This exact expression is shared by display, sorting and conditions. Never count
// employees outside the actor's existing employee-read scope.
export function teamMemberCount(actor: AuthenticatedUser): Prisma.Sql {
 const scope = actor.permissionOperations.includes('employees.read') ? Prisma.empty
  : actor.ownBranchPermissionOperations.includes('employees.read') ? Prisma.sql`AND member.branch_id=${actor.branchId}` : Prisma.sql`AND false`;
 return Prisma.sql`(SELECT count(*)::int FROM employee_teams membership JOIN employees member ON member.id=membership.employee_id AND member.deleted_at IS NULL WHERE membership.team_id=business.id AND membership.deleted_at IS NULL ${scope})`;
}

const snake = (value: string) => value.replace(/[A-Z]/g, char => '_' + char.toLowerCase()).replace(/([a-z])(\d)/g, '$1_$2');
function field(model: string, code: string, ja: string, en: string, type: SearchField['type'] = 'string', maxLength = 5000): SearchField {
 return {code, label: {ja,en}, type, maxLength, expression: 'business.' + snake(code), source: model + '.' + code};
}
export function businessSearchContexts(target: BusinessTarget): SearchContext[] {
 const model = {teams:'Team',skills:'Skill',clients:'Client',engagements:'Engagement'}[target];
 const f = (code: string, ja: string, en: string, type: SearchField['type'] = 'string', max = 5000) => field(model,code,ja,en,type,max);
 const fields = [f('name','名称','Name','string',128)];
 if (target !== 'clients') fields.push(f('description','説明','Description'));
 if (target === 'teams') fields.push({...f('memberCount','メンバー数','Member count','number'),source:'derived.teamMemberCount'});
 if (target === 'skills') fields.push(f('category','カテゴリー','Category','string',128));
 if (target === 'engagements') {
  fields.push(f('contractStartsOn','契約開始日','Contract start date','date'),f('contractEndsOn','契約終了日','Contract end date','date'));
  for (const [code,column,ja,en] of [['clientName','name','取引先','Client'],['companyName','company_name','企業名','Company name']]) {
   fields.push({...f(code,ja,en,'string',128),expression:`(SELECT client.${column} FROM clients client WHERE client.id=business.client_id AND client.deleted_at IS NULL)`,source:'Client.'+ (code === 'clientName' ? 'name' : code)});
  }
 }
 if (target === 'clients') {
  for (const [code,ja,en,max] of [
   ['companyName','企業名','Company name',128],['contactName','担当者名','Contact name',128],['contactDepartment','担当部署','Contact department',128],['contactEmail','担当者メール','Contact email',254],['contactMobile','携帯','Mobile phone',32],
   ['postalCode','郵便番号','Postal code',10],['prefecture','都道府県・州','Prefecture / State',64],['city','市区町村','City',128],['streetAddress','番地','Street address',255],['buildingName','建物名','Building',255],
   ['phoneNumber1','電話番号1','Phone number 1',32],['phoneNumber2','電話番号2','Phone number 2',32],['faxNumber1','FAX番号1','Fax number 1',32],['faxNumber2','FAX番号2','Fax number 2',32],['notes','備考','Notes',5000]
  ] as const) fields.push(f(code,ja,en,'string',max));
  fields.push({...f('countryCode','国','Country','choice',2),choices:['JP','US']});
 }
 fields.push(f('createdAt','作成日時','Created at','datetime'),f('updatedAt','更新日時','Updated at','datetime'));
 return [{code:target.slice(0,-1),label:{ja:{teams:'チーム',skills:'スキル',clients:'取引先',engagements:'案件'}[target],en:target==='engagements'?'Engagement':model},category:'basic',from:'',link:'',fields}];
}
