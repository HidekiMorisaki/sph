import { createHmac, randomBytes } from 'node:crypto';
import { isIP } from 'node:net';
import { env } from '$env/dynamic/private';
import { getPrisma } from '$lib/server/prisma';
import { employeeReferenceDate } from '$lib/server/api/employee-derived';
import { createSession, hashPassword, verifyPassword } from './session';

export const LOGIN_WINDOW_SECONDS = 15 * 60;
const dummyHash = hashPassword(randomBytes(32).toString('base64url'));

function bucketKey(value: string): string {
	const key = Buffer.from(env.IT_ASSET_CREDENTIAL_ENCRYPTION_KEY ?? '', 'base64url');
	if (key.length !== 32) throw new Error('Authentication configuration unavailable.');
	const derived = createHmac('sha256', key).update('sph:login-throttle:v1').digest();
	return createHmac('sha256', derived).update(value).digest('hex');
}

export function canonicalClientAddress(address: string): string {
	const value = address.toLowerCase().replace(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/, '$1');
	if (!isIP(value)) throw new Error('Client address unavailable.');
	return value.includes(':') ? new URL(`http://[${value}]/`).hostname.slice(1, -1) : value;
}

/** The caller supplies getClientAddress(), configured only for a trusted ingress. */
export async function authenticateLogin(identifier: string, password: string, address: string) {
	const ipKey = bucketKey(`ip:${canonicalClientAddress(address)}`);
	return getPrisma().$transaction(async tx => {
		// One source lock also serializes its account buckets. Never trust a supplied XFF here.
		await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${ipKey}, 0))::text`;
		const user = await tx.employee.findFirst({ where: {
			...(identifier.includes('@') ? { email: identifier.trim().toLowerCase() } : { username: identifier.trim() }),
			deletedAt: null, accountStatus: 'active',
			OR: [{ retiredAt: null }, { retiredAt: { gt: employeeReferenceDate() } }],
			roleGrants: { some: { deletedAt: null, scopeType: { in: ['global', 'own_branch'] }, role: { deletedAt: null } } }
		}, select: { id: true, passwordHash: true } });
		const accountKey = user ? `employee:${user.id}` : `identifier:${identifier.trim().includes('@') ? identifier.trim().toLowerCase() : identifier.trim()}`;
		const pairKey = bucketKey(`pair:${ipKey}:${accountKey}`);
		const buckets = [];
		for (const key of [ipKey, pairKey]) buckets.push(await tx.authenticationThrottle.upsert({
			where: { bucketKey: key }, create: { bucketKey: key }, update: { deletedAt: null }
		}));
		const [{ now }] = await tx.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS now`;
		const remaining = Math.max(0, ...buckets.map(bucket => (bucket.blockedUntil?.getTime() ?? 0) - now.getTime()));
		if (remaining > 0) return { status: 'limited' as const, retryAfterSeconds: Math.ceil(remaining / 1000) };
		const valid = await verifyPassword(password, user?.passwordHash ?? await dummyHash);
		if (valid && user?.passwordHash) {
			await tx.authenticationThrottle.update({ where: { bucketKey: pairKey }, data: { failureTimes: [], blockedUntil: null } });
			return { status: 'authenticated' as const, session: await createSession(user.id, tx) };
		}
		const [{ failedAt }] = await tx.$queryRaw<Array<{ failedAt: Date }>>`SELECT clock_timestamp() AS "failedAt"`;
		for (const [index, bucket] of buckets.entries()) {
			const times = bucket.failureTimes.filter(date => date.getTime() > failedAt.getTime() - LOGIN_WINDOW_SECONDS * 1000);
			times.push(failedAt);
			await tx.authenticationThrottle.update({ where: { id: bucket.id }, data: {
				failureTimes: times, blockedUntil: times.length >= (index === 0 ? 100 : 5) ? new Date(failedAt.getTime() + LOGIN_WINDOW_SECONDS * 1000) : null
			} });
		}
		return { status: 'invalid' as const };
	}, { maxWait: 5000, timeout: 15000 });
}
