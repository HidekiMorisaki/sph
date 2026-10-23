import { getPrisma } from './prisma';
import { validateCredentialEncryptionConfiguration } from './api/it-asset-credentials';

let pending: Promise<boolean> | undefined;

/** No records or credentials leave the database; overlapping probes share work. */
export function isServiceReady(): Promise<boolean> {
	if (pending) return pending;
	pending = probe().catch(() => false).finally(() => { pending = undefined; });
	return pending;
}

async function probe(): Promise<boolean> {
	validateCredentialEncryptionConfiguration();
	return getPrisma().$transaction(async transaction => {
		await transaction.$executeRaw`SET LOCAL statement_timeout = '1500ms'`;
		// Resolve the columns used by sign-in and session/RBAC validation without
		// reading personal data, changing records or creating a test session.
		await transaction.$queryRaw`
			SELECT e.id, e.username, e.email, e.password_hash, e.account_status,
				e.retired_at, e.deleted_at, e.first_name, e.middle_name, e.last_name, e.branch_id,
				s.id, s.token_hash, s.employee_id, s.expires_at, s.last_seen_at,
				s.created_at, s.updated_at, s.deleted_at,
				es.employee_id, es.time_zone, es.display_language, es.display_currency, es.deleted_at,
				er.employee_id, er.role_id, er.scope_type, er.deleted_at,
				r.id, r.name, r.default_key, r.deleted_at,
				rp.role_id, rp.permission_id, rp.scope_type, rp.deleted_at,
				p.id, p.identifier, p.deleted_at, po.permission_id, po.operation, po.deleted_at
			FROM employees e, sessions s, employee_settings es, employee_roles er,
				roles r, role_permissions rp, permissions p, permission_operations po
			WHERE FALSE
		`;
		const result = await transaction.$queryRaw<{ writable: boolean }[]>`
			SELECT NOT pg_is_in_recovery()
				AND current_setting('transaction_read_only') = 'off'
				AND has_table_privilege(current_user, 'sessions', 'INSERT')
				AND has_table_privilege(current_user, 'sessions', 'UPDATE')
				AND has_table_privilege(current_user, 'authentication_throttles', 'SELECT, INSERT, UPDATE')
				AND NOT EXISTS (SELECT 1 FROM _prisma_migrations
					WHERE finished_at IS NULL AND rolled_back_at IS NULL) AS writable
		`;
		await transaction.$queryRaw`SELECT bucket_key, failure_times, blocked_until, deleted_at FROM authentication_throttles WHERE FALSE`;
		return result[0]?.writable === true;
	}, { maxWait: 1000, timeout: 2500 });
}
