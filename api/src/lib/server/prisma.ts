import { env } from '$env/dynamic/private';
import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from './generated/prisma/client';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

function createPrismaClient(): PrismaClient {
	if (!env.DATABASE_URL) {
		throw new Error('DATABASE_URL must be configured for server-side database access.');
	}

	return new PrismaClient({
		adapter: new PrismaPg({ connectionString: env.DATABASE_URL })
	});
}

export function getPrisma(): PrismaClient {
	const client = globalForPrisma.prisma ?? createPrismaClient();

	if (import.meta.env.DEV) {
		globalForPrisma.prisma = client;
	}

	return client;
}
