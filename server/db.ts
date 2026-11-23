import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client';
import { env } from './env';

const adapter = new PrismaPg({ connectionString: env.databaseUrl });

export const prisma = new PrismaClient({ adapter });

export type PrismaTransaction = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];
