import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // `prisma generate` não precisa do banco; as migrações sim.
    url: process.env.DATABASE_URL ?? '',
  },
});
