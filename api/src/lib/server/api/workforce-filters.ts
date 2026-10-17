import { Prisma } from '$lib/server/generated/prisma/client';
import { throwApiError } from './response';

export function workforceFilters(url: URL, today: Date) {
 const invalid = (field:string):never => throwApiError(422,'INVALID_FILTER','Invalid workforce filter.',[{field,reason:'INVALID_VALUE'}]);
 const raw = url.searchParams.get('skillIds');
 const skillIds = raw === null ? [] : raw.split(',').map(value=>/^[1-9]\d*$/.test(value)&&Number.isSafeInteger(Number(value))?Number(value):invalid('skillIds'));
 if (skillIds.length>100 || new Set(skillIds).size!==skillIds.length) invalid('skillIds');
 const mode = url.searchParams.get('skillMode') ?? 'all'; if (!['all','any'].includes(mode)) invalid('skillMode');
 const level = url.searchParams.get('minProficiency');
 const proficiency = level === null ? 1 : /^[1-3]$/.test(level)?Number(level):invalid('minProficiency');
 if (level !== null && !skillIds.length) invalid('skillIds');
 const status = url.searchParams.get('participationStatus') ?? ''; if (!['','planned','active','ended','none'].includes(status)) invalid('participationStatus');
 const ending = url.searchParams.get('endingWithinDays');
 const days = ending===null?null:/^[1-9]\d{0,3}$/.test(ending)&&Number(ending)<=3650?Number(ending):invalid('endingWithinDays');
 const last = new Date(today); if (days!==null) last.setUTCDate(last.getUTCDate()+days);
 const where: Prisma.EmployeeWhereInput[] = [];
 const sql: Prisma.Sql[] = [];
 const skillWhere = (skillId:number):Prisma.EmployeeWhereInput=>({skills:{some:{skillId,deletedAt:null,skill:{deletedAt:null},proficiency:{gte:proficiency}}}});
 const skillSql = (skillId:number)=>Prisma.sql`EXISTS(SELECT 1 FROM employee_skills es JOIN skills s ON s.id=es.skill_id AND s.deleted_at IS NULL WHERE es.employee_id=employee.id AND es.deleted_at IS NULL AND es.skill_id=${skillId} AND es.proficiency>=${proficiency})`;
 if (skillIds.length) {
  where.push(mode==='all'?{AND:skillIds.map(skillWhere)}:{OR:skillIds.map(skillWhere)});
  sql.push(Prisma.sql`(${Prisma.join(skillIds.map(skillSql),mode==='all'?' AND ':' OR ')})`);
 }
 const date = today.toISOString().slice(0,10), lastDate = last.toISOString().slice(0,10);
 if (status || days!==null) {
  const conditions:Prisma.ProjectParticipationWhereInput[] = [];
  const clauses:Prisma.Sql[] = [];
  if (status==='planned') { conditions.push({startsOn:{gt:today}}); clauses.push(Prisma.sql`pp.starts_on > CAST(${date} AS DATE)`); }
  if (status==='active' || days!==null) { conditions.push({startsOn:{lte:today},OR:[{endsOn:null},{endsOn:{gte:today}}]}); clauses.push(Prisma.sql`pp.starts_on<=CAST(${date} AS DATE) AND (pp.ends_on IS NULL OR pp.ends_on>=CAST(${date} AS DATE))`); }
  if (status==='ended') { conditions.push({endsOn:{lt:today}}); clauses.push(Prisma.sql`pp.ends_on<CAST(${date} AS DATE)`); }
  if (days!==null) { conditions.push({endsOn:{gte:today,lte:last}}); clauses.push(Prisma.sql`pp.ends_on BETWEEN CAST(${date} AS DATE) AND CAST(${lastDate} AS DATE)`); }
  const participation = {deletedAt:null,project:{deletedAt:null},AND:conditions};
  where.push({projectParticipations:status==='none'?{none:participation}:{some:participation}});
  sql.push(Prisma.sql`${status==='none'?Prisma.sql`NOT`:Prisma.empty} EXISTS (SELECT 1 FROM project_participations pp JOIN projects p ON p.id=pp.project_id AND p.deleted_at IS NULL WHERE pp.employee_id=employee.id AND pp.deleted_at IS NULL ${clauses.length?Prisma.sql`AND ${Prisma.join(clauses,' AND ')}`:Prisma.empty})`);
 }
 if (days!==null && status && status!=='active') invalid('participationStatus');
 return {where:{AND:where} satisfies Prisma.EmployeeWhereInput,sql:sql.length?Prisma.sql`AND ${Prisma.join(sql,' AND ')}`:Prisma.empty};
}
