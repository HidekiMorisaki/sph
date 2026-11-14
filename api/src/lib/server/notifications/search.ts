import {Prisma} from '#lib/server/generated/prisma/client.js';
import type {AuthenticatedUser} from '#lib/server/auth/types.js';
import {workflowVisibility} from '../workflow/search';
import {projectVisibility} from '../projects/service';
import {ticketCodeExpression} from '../projects/codes';

const labels:Record<string,string>={
 'project.ticket.created':'プロジェクト チケットが作成されました Ticket created',
 'project.ticket.updated':'プロジェクト チケットが更新されました Ticket updated',
 'project.comment.updated':'プロジェクト チケットのコメントが編集されました Ticket comment edited',
 'project.assigned':'プロジェクト チケットが割り当てられました Ticket assigned',
 'project.comment':'プロジェクト チケットにコメントが追加されました New ticket comment',
 'workflow.requested':'ワークフロー 承認依頼 Approval requested','workflow.approved':'ワークフロー 承認されました Approved',
 'workflow.returned':'ワークフロー 差し戻されました Returned','workflow.rejected':'ワークフロー 却下されました Rejected',
 'workflow.completed':'ワークフロー 最終承認が完了しました Final approval completed','workflow.cancelled':'ワークフロー 申請が取り下げられました Request withdrawn',
 'workflow.comment':'ワークフロー コメントが追加されました New comment','workflow.reassigned':'ワークフロー 承認者が変更されました Approver reassigned',
 'schedule.invitation':'お知らせ 予定への招待 Invitation','schedule.change':'お知らせ 予定の変更 Change',
 'schedule.cancellation':'お知らせ 予定の取消 Cancellation','schedule.response':'お知らせ 出欠回答 Response','schedule.resource-release':'お知らせ 会議室予約の解除 Resource release'
};

/** Search only current resource titles that the recipient is still permitted to read. */
export function notificationSearch(actor:AuthenticatedUser,query:string):Prisma.Sql{
 const terms=query.trim().split(/\s+/).filter(Boolean);
 if(!terms.length)return Prisma.sql`true`;
 const kind=Prisma.sql`CASE ${Prisma.join(Object.entries(labels).map(([type,label])=>Prisma.sql`WHEN n.type=${type} THEN ${label}`),' ')} ELSE n.type END`;
 const clauses=terms.map(term=>{
  const pattern='%'+term.toLowerCase().replace(/[\\%_]/g,c=>'\\'+c)+'%';
  return Prisma.sql`(lower(${kind}) LIKE ${pattern}
   OR (${actor.permissionOperations.includes('projects.read')} AND n.type LIKE 'project.%' AND n.target_type='project-ticket' AND EXISTS(SELECT 1 FROM project_tickets t JOIN projects p ON p.id=t.project_id WHERE t.id::text=n.target_key AND t.deleted_at IS NULL AND p.deleted_at IS NULL AND ${projectVisibility(actor)} AND (lower(t.title) LIKE ${pattern} OR lower(p.name) LIKE ${pattern} OR lower(p.code) LIKE ${pattern} OR lower(${Prisma.raw(ticketCodeExpression)}) LIKE ${pattern})))
   OR (${actor.permissionOperations.includes('workflows.read')} AND n.type LIKE 'workflow.%' AND n.target_type='workflow-action' AND EXISTS(SELECT 1 FROM workflow_actions action JOIN workflow_requests workflow ON workflow.id=action.request_id WHERE action.action_key::text=n.target_key AND action.deleted_at IS NULL AND workflow.deleted_at IS NULL AND ${workflowVisibility(actor)} AND lower(workflow.title) LIKE ${pattern}))
   OR (${actor.permissionOperations.includes('schedule.read')} AND n.type LIKE 'schedule.%' AND n.target_type='schedule-occurrence' AND EXISTS(SELECT 1 FROM schedule_occurrences occurrence JOIN schedule_events event ON event.id=occurrence.event_id WHERE occurrence.occurrence_key::text=n.target_key AND occurrence.deleted_at IS NULL AND event.deleted_at IS NULL AND (occurrence.visibility='public' OR event.organizer_id=${actor.id} OR EXISTS(SELECT 1 FROM schedule_participants participant WHERE participant.occurrence_id=occurrence.id AND participant.employee_id=${actor.id} AND participant.deleted_at IS NULL)) AND lower(occurrence.title) LIKE ${pattern})))`;
 });
 return Prisma.sql`(${Prisma.join(clauses,' AND ')})`;
}
