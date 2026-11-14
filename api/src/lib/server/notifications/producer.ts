import type { Prisma } from '#lib/server/generated/prisma/client.js';
type NotificationInput={type:string;version:number;source:string;targetType:string;targetKey:string;deduplicationKey:string;recipientIds:number[]};
/** Trusted domain producers call this inside their business transaction. */
export async function emitNotification(tx:Prisma.TransactionClient,input:NotificationInput) {
 const ids=[...new Set(input.recipientIds)];if(!ids.length)return;
 const {recipientIds,...event}=input;void recipientIds;
 await tx.notificationEvent.create({data:{...event,recipients:{create:ids.map(employeeId=>({employeeId}))}}});
}
