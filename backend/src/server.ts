import { createApp } from './app';
import { closePool } from './db/pool';
import { env } from './config/env';

const app = createApp();
const server = app.listen(env.PORT, () => {
  console.log(`HealthPoints backend running on http://localhost:${env.PORT}`);
});

async function shutdown(signal: string) {
  console.log(`Received ${signal}. Shutting down...`);
  server.close(async () => {
    await closePool();
    process.exit(0);
  });
}

process.on('SIGINT', () => {
  void shutdown('SIGINT');
});

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});
