import { requireOperationApi } from '#lib/server/api/admin.js';
import { success,throwApiError } from '#lib/server/api/response.js';
import { parseListQuery,parseSearch,listMeta } from '#lib/server/api/query.js';
import { getPrisma } from '#lib/server/prisma.js';
export async function GET({locals,url}:import('./$types').RequestEvent) {
 requireOperationApi(locals.user,'schedule.read');const q=parseListQuery(url,['employeeCode','lastName'],'employeeCode'),search=parseSearch(url);
 const filter=(key:string)=>{const v=url.searchParams.get(key);if(v===null||v==='')return undefined;const n=Number(v);if(!Number.isSafeInteger(n)||n<1)throwApiError(422,'INVALID_FILTER','Invalid filter.');return n;};
 const branchId=filter('branchId'),departmentId=filter('departmentId');
 const where={deletedAt:null,AND:[{OR:[{retiredAt:null},{retiredAt:{gt:new Date()}}]},{OR:[{employeeCode:{contains:search,mode:'insensitive' as const}},{firstName:{contains:search,mode:'insensitive' as const}},{lastName:{contains:search,mode:'insensitive' as const}}]}],...(branchId?{branchId}:{}),...(departmentId?{departmentAssignments:{some:{departmentId,deletedAt:null}}}:{})};
 const db=getPrisma(),[items,total]=await Promise.all([db.employee.findMany({where,select:{id:true,employeeCode:true,firstName:true,lastName:true,branch:{select:{id:true,name:true}},departmentAssignments:{where:{deletedAt:null},select:{department:{select:{id:true,name:true}}}}},skip:q.offset,take:q.limit,orderBy:[{[q.sortBy]:q.sortOrder},{id:'asc'}]}),db.employee.count({where})]);
 const [branches,departments]=await Promise.all([db.branch.findMany({where:{deletedAt:null},select:{id:true,name:true},orderBy:{name:'asc'}}),db.department.findMany({where:{deletedAt:null},select:{id:true,name:true},orderBy:{name:'asc'}})]);
 return success(items.map(i=>({id:i.id,employeeCode:i.employeeCode,name:[i.lastName,i.firstName].join(' '),branch:i.branch,departments:i.departmentAssignments.map(d=>d.department)})),200,{...listMeta(q,items.length,total),branches,departments});
}
