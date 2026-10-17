import { openPurchaseStatuses, managedPurchaseBranches } from './book-purchases';
import { requireOperationApi } from './admin';
import { listMeta, parseListQuery } from './query';
import { failure, success } from './response';
import { permissionOperations } from '$lib/server/auth/permissions';
import { getPrisma } from '$lib/server/prisma';
import type { AuthenticatedUser } from '$lib/server/auth/types';
import { Prisma } from '$lib/server/generated/prisma/client';
import { bookRentableSql } from './book-availability';

export async function bookList(user: AuthenticatedUser | null, url: URL, advanced?: Prisma.Sql) {
	const actor = requireOperationApi(user, permissionOperations.bookRead);
	const query = parseListQuery(url, ['name', 'author', 'isbn', 'createdAt'] as const, 'name');
	const q = url.searchParams.get('q')?.trim() ?? '';
	if (q.length > (advanced ? 500 : 200)) return failure(422, 'INVALID_SEARCH', 'Search is too long.');
	const purchaseBranchIds = [...new Set([actor.branchId, ...await managedPurchaseBranches(getPrisma(), actor)])];
	const purchaseWhere = { branchId: { in: purchaseBranchIds }, branch: { deletedAt: null }, status: { in: openPurchaseStatuses }, deletedAt: null };

 const conditions: Prisma.Sql[]=[Prisma.sql`title.deleted_at IS NULL`];
 if(advanced)conditions.push(advanced);
 if(q) {const pattern='%'+q.replace(/[\\%_]/g,c=>'\\'+c)+'%';conditions.push(Prisma.sql`(title.name ILIKE ${pattern} OR title.author ILIKE ${pattern} OR title.isbn LIKE ${pattern})`);}
 if(url.searchParams.get('purchaseRequests')==='true')conditions.push(Prisma.sql`EXISTS (SELECT 1 FROM book_purchase_requests purchase JOIN branches branch ON branch.id=purchase.branch_id AND branch.deleted_at IS NULL WHERE purchase.title_id=title.id AND purchase.deleted_at IS NULL AND purchase.status IN ('pending','approved','ordered') AND purchase.branch_id IN (${Prisma.join(purchaseBranchIds)}))`);
 const whereSql=Prisma.sql`WHERE ${Prisma.join(conditions,' AND ')}`;
 const sorts:Record<string,Prisma.Sql>={name:Prisma.sql`title.name`,author:Prisma.sql`title.author`,isbn:Prisma.sql`title.isbn`,createdAt:Prisma.sql`title.created_at`};
 const direction=query.sortOrder==='asc'?Prisma.sql`ASC`:Prisma.sql`DESC`;
 const {items,total,rentableTitleIds}=await getPrisma().$transaction(async tx=>{
  const count=await tx.$queryRaw<Array<{total:number}>>(Prisma.sql`SELECT count(*)::int total FROM book_titles title ${whereSql}`);
  const page=await tx.$queryRaw<Array<{id:number;rentable:boolean}>>(Prisma.sql`SELECT title.id, ${bookRentableSql()} rentable FROM book_titles title ${whereSql} ORDER BY ${sorts[query.sortBy]} ${direction},title.id ASC OFFSET ${query.offset} LIMIT ${query.limit}`);
  const records=await tx.bookTitle.findMany({where:{id:{in:page.map(row=>row.id)}},select:{id:true,catalogCode:true,name:true,author:true,publisher:true,edition:true,isbn:true,notes:true,sourceProvider:true,sourceUrl:true,sourceRetrievedAt:true,_count:{select:{purchaseRequests:{where:purchaseWhere},copies:{where:{deletedAt:null}}}}}});
  const byId=new Map(records.map(row=>[row.id,row]));
  return {items:page.map(row=>byId.get(row.id)!),total:count[0]?.total??0,rentableTitleIds:new Set(page.filter(row=>row.rentable).map(row=>row.id))};
 },{isolationLevel:'RepeatableRead'});

	return success(items.map(({ _count, ...item }) => ({ ...item, copyCount: _count.copies, purchaseRequestCount: _count.purchaseRequests, rentable: rentableTitleIds.has(item.id) })), 200, listMeta(query, items.length, total));
}
