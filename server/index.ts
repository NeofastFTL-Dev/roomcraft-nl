import { createApp } from './app';
import { env } from './env';
import { prisma } from './db';

const app = createApp();

const server = app.listen(env.port, '127.0.0.1', () => {
  console.log(`[api] RoomCraft NL API listening on http://127.0.0.1:${env.port} (${env.nodeEnv})`);
});

async function shutdown(signal: string): Promise<void> {
  console.log(`[api] ${signal} received, shutting down`);
  server.close();
  await prisma.$disconnect();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
