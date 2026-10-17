import { env } from '$env/dynamic/private';
import { SerialPrismaPg } from './serial-prisma-pg';

import { PrismaClient } from './generated/prisma/client';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

function createPrismaClient(): PrismaClient {
	if (!env.DATABASE_URL) {
		throw new Error('DATABASE_URL must be configured for server-side database access.');
	}

	return new PrismaClient({
		adapter: new SerialPrismaPg({
			connectionString: env.DATABASE_URL,
			options: '-c timezone=UTC'
		})
	});
}

export function getPrisma(): PrismaClient {
	const client = globalForPrisma.prisma ?? createPrismaClient();

	globalForPrisma.prisma = client;

	return client;
}
