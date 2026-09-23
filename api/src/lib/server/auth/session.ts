import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

import { getPrisma } from '$lib/server/prisma';
import { throwApiError } from '$lib/server/api/response';

import type { AuthenticatedSession, AuthenticatedUser } from './types';

const scrypt = promisify(scryptCallback);

export const SESSION_COOKIE_NAME = 'equipment_session';
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

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
				select: { id: true, username: true, email: true, firstName: true, middleName: true, lastName: true, mustChangeCredentials: true,
					roleGrants: { where: { deletedAt: null, scopeType: 'global', role: { deletedAt: null } }, select: { role: { select: { code: true } } } } }
			}
		}
	});

	if (!record) {
		return null;
	}

	if (record.expiresAt <= new Date()) {
		return null;
	}
	const roles = record.employee.roleGrants.map((grant) => grant.role.code);
	if (roles.length === 0) return null;
	const role = roles.includes('system_administrator') ? 'system_administrator' : roles.includes('business_administrator') ? 'business_administrator' : 'general_user';

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
			name: [record.employee.firstName, record.employee.middleName, record.employee.lastName].filter(Boolean).join(' '),
			role,
			roles,
			mustChangeCredentials: record.employee.mustChangeCredentials
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
	if (!authenticatedUser.roles.some((role) => role === 'system_administrator' || role === 'business_administrator')) {
		throwApiError(403, 'ADMIN_REQUIRED', 'Administrator access is required.');
	}

	return authenticatedUser;
}
