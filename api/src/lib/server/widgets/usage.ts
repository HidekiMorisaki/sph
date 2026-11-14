import {Prisma} from '#lib/server/generated/prisma/client.js';

// Layouts are unique per employee. Include hidden instances, but never deleted
// instances, layouts or employees; duplicate cards count as one user per release.
export async function widgetUsageCounts(db:Prisma.TransactionClient,releaseIds:number[]){
 if(!releaseIds.length)return new Map<number,number>();
 const rows=await db.$queryRaw<Array<{releaseId:number;userCount:bigint}>>(Prisma.sql`
  SELECT i.release_id AS "releaseId", COUNT(DISTINCT l.employee_id) AS "userCount"
  FROM widget_instances i
  JOIN widget_layouts l ON l.id=i.layout_id
  JOIN employees e ON e.id=l.employee_id
  WHERE i.release_id IN (${Prisma.join(releaseIds)})
    AND i.deleted_at IS NULL AND l.deleted_at IS NULL AND e.deleted_at IS NULL
  GROUP BY i.release_id
 `);
 return new Map(rows.map(row=>[row.releaseId,Number(row.userCount)]));
}

export async function widgetGroupUsageCount(db:Prisma.TransactionClient,releaseIds:number[]){
 if(!releaseIds.length)return 0;
 const rows=await db.$queryRaw<Array<{count:bigint}>>(Prisma.sql`
  SELECT COUNT(DISTINCT l.employee_id) AS count FROM widget_instances i
  JOIN widget_layouts l ON l.id=i.layout_id JOIN employees e ON e.id=l.employee_id
  WHERE i.release_id IN (${Prisma.join(releaseIds)}) AND i.deleted_at IS NULL
   AND l.deleted_at IS NULL AND e.deleted_at IS NULL`);
 return Number(rows[0].count);
}
