import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import { promisify } from 'node:util';
import { dev } from '$app/environment';

import { getPrisma } from '$lib/server/prisma';
import { throwApiError } from '$lib/server/api/response';

import type { AuthenticatedSession, AuthenticatedUser } from './types';
import { DEFAULT_DISPLAY_CURRENCY, DEFAULT_DISPLAY_LANGUAGE, DEFAULT_TIME_ZONE, isDisplayCurrency, isDisplayLanguage, isTimeZone } from './localization';
import { hasPermissionOperation, permissionOperations } from './permissions';

const scrypt = promisify(scryptCallback);

export const SESSION_COOKIE_NAME = 'equipment_session';
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

export function sessionCookieSecure(): boolean {
	if (dev) return false;
	if (process.env.GATEWAY_TLS_MODE !== 'internal-http') return true;
	try {
		const origin = new URL(process.env.ORIGIN ?? '');
		if (origin.protocol !== 'http:' || isIP(origin.hostname) !== 4) return true;
		const [first, second] = origin.hostname.split('.').map(Number);
		return !(first === 10 || (first === 172 && second >= 16 && second <= 31) || (first === 192 && second === 168));
	} catch { return true; }
}

type SessionValidation = {
	session: AuthenticatedSession;
	user: AuthenticatedUser;
};

function hashToken(token: string): string {
	return createHash('sha256').update(token).digest('base64url');
}

export async function hashPassword(password: string): Promise<string> {
	const salt = randomBytes(16).toString('base64url');
	const derivedKey = (await scrypt(password, salt, 64)) as Buffer;
	return `scrypt$${salt}$${derivedKey.toString('base64url')}`;
}

export async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
	const [algorithm, salt, encodedKey] = passwordHash.split('$');
	if (algorithm !== 'scrypt' || !salt || !encodedKey) {
		return false;
	}

	const expectedKey = Buffer.from(encodedKey, 'base64url');
	const actualKey = (await scrypt(password, salt, expectedKey.length)) as Buffer;
	return actualKey.length === expectedKey.length && timingSafeEqual(actualKey, expectedKey);
}

export async function createSession(employeeId: number): Promise<{ token: string; expiresAt: Date }> {
	const token = randomBytes(32).toString('base64url');
	const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);

	await getPrisma().session.create({
		data: {
			tokenHash: hashToken(token),
			employeeId,
			expiresAt
		}
	});

	return { token, expiresAt };
}

export async function validateSessionToken(token: string | undefined): Promise<SessionValidation | null> {
	if (!token) {
		return null;
	}

	const record = await getPrisma().session.findFirst({
		where: { tokenHash: hashToken(token), deletedAt: null, employee: { deletedAt: null, accountStatus: 'active', OR: [{ retiredAt: null }, { retiredAt: { gt: new Date() } }] } },
		select: {
			id: true,
			expiresAt: true,
			employee: {
				select: {
					id: true, username: true, email: true, firstName: true, middleName: true, lastName: true, branchId: true,
					settings: { select: { timeZone: true, displayLanguage: true, displayCurrency: true, deletedAt: true } },
					roleGrants: {
						where: { deletedAt: null, scopeType: { in: ['global', 'own_branch'] }, role: { deletedAt: null } },
						select: {
							scopeType: true,
							role: { select: {
								id: true, name: true,
								permissions: {
									where: { deletedAt: null, permission: { deletedAt: null } },
									select: { scopeType: true, permission: { select: { identifier: true, operations: { where: { deletedAt: null }, select: { operation: true } } } } }
								}
							} }
						}
					}
				}
			}
		}
	});

	if (!record) {
		return null;
	}

	if (record.expiresAt <= new Date()) {
		return null;
	}
	const roles = record.employee.roleGrants.map((grant) => ({ id: grant.role.id, name: grant.role.name })).sort((left, right) => left.name.localeCompare(right.name, 'en'));
	if (roles.length !== 1) return null;
	const grants = record.employee.roleGrants;
	const permissionIdentifiers = [...new Set(grants.filter((grant) => grant.scopeType === 'global').flatMap((grant) => grant.role.permissions.filter((entry) => entry.scopeType === 'global').map((entry) => entry.permission.identifier)))];
	const grantedOperations = [...new Set(grants.flatMap((grant) => grant.scopeType === 'global' ? grant.role.permissions.filter((entry) => entry.scopeType === 'global').flatMap((entry) => entry.permission.operations.map((operation) => operation.operation)) : []))];
	const ownBranchPermissionOperations = [...new Set(grants.flatMap((grant) => grant.role.permissions.filter((entry) => grant.scopeType === 'own_branch' || entry.scopeType === 'own_branch').flatMap((entry) => entry.permission.operations.map((operation) => operation.operation))))];
	const settings = record.employee.settings?.deletedAt == null ? record.employee.settings : null;
	const displayLanguage = isDisplayLanguage(settings?.displayLanguage) ? settings.displayLanguage : DEFAULT_DISPLAY_LANGUAGE;

	void getPrisma().session.updateMany({
		where: { id: record.id, deletedAt: null },
		data: { lastSeenAt: new Date() }
	}).catch(() => undefined);

	return {
		session: { id: record.id, expiresAt: record.expiresAt },
		user: {
			id: record.employee.id,
			username: record.employee.username ?? record.employee.email,
			email: record.employee.email,
			firstName: record.employee.firstName,
			middleName: record.employee.middleName,
			lastName: record.employee.lastName,
			roles,
			permissionIdentifiers,
			permissionOperations: grantedOperations,
			branchId: record.employee.branchId,
			ownBranchPermissionOperations,
			timeZone: isTimeZone(settings?.timeZone) ? settings.timeZone : DEFAULT_TIME_ZONE,
			displayLanguage,
			displayCurrency: isDisplayCurrency(settings?.displayCurrency) ? settings.displayCurrency : DEFAULT_DISPLAY_CURRENCY
		}
	};
}

export async function invalidateSessionToken(token: string | undefined): Promise<void> {
	if (!token) {
		return;
	}

	await getPrisma().session.updateMany({
		where: { tokenHash: hashToken(token), deletedAt: null },
		data: { deletedAt: new Date() }
	});
}

export function requireUser(user: AuthenticatedUser | null): AuthenticatedUser {
	if (!user) {
		throwApiError(401, 'AUTHENTICATION_REQUIRED', 'Authentication is required.');
	}

	return user;
}

export function requireAdmin(user: AuthenticatedUser | null): AuthenticatedUser {
	const authenticatedUser = requireUser(user);
	if (!hasPermissionOperation(authenticatedUser, permissionOperations.employeeManagement)) {
		throwApiError(403, 'ADMIN_REQUIRED', 'Administrator access is required.');
	}

	return authenticatedUser;
}
