import { defineConfig } from 'prisma/config';

export default defineConfig({
	schema: 'prisma/schema.prisma',
	migrations: {
		path: 'prisma/migrations'
	},
	datasource: {
		// `prisma generate` does not connect to the database. Runtime access still requires DATABASE_URL.
		url: process.env.DATABASE_URL ?? 'postgresql://localhost:5432/sph'
	}
});
