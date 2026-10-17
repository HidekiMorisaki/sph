import { Prisma } from '$lib/server/generated/prisma/client';

/** Shared predicate for catalog output and search, evaluated before pagination. */
export function bookRentableSql(title = 'title', branch?: string) {
 return Prisma.sql`EXISTS (SELECT 1 FROM book_copies available_copy JOIN storage available_storage ON available_storage.id=available_copy.storage_id AND available_storage.deleted_at IS NULL JOIN rooms available_room ON available_room.id=available_storage.room_id AND available_room.deleted_at IS NULL JOIN branches available_branch ON available_branch.id=available_storage.branch_id AND available_branch.deleted_at IS NULL
 WHERE available_copy.title_id=${Prisma.raw(title+'.id')} AND available_copy.deleted_at IS NULL AND available_copy.status='available' ${branch?Prisma.sql`AND available_storage.branch_id=${Prisma.raw(branch)}`:Prisma.empty}
 AND NOT EXISTS (SELECT 1 FROM book_loans active_loan WHERE active_loan.copy_id=available_copy.id AND active_loan.deleted_at IS NULL AND active_loan.returned_on IS NULL)
 GROUP BY available_storage.branch_id HAVING count(*) > (SELECT count(*) FROM book_reservations held WHERE held.title_id=${Prisma.raw(title+'.id')} AND held.branch_id=available_storage.branch_id AND held.deleted_at IS NULL AND held.status='held'))`;
}
