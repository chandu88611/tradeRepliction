// src/index.ts
import 'dotenv/config';
import { logger } from './utils/logger.js';

const ROLE = (process.env.ROLE ?? 'core').toLowerCase();
const HOST = process.env.HOST ?? '0.0.0.0';
const PORT = Number(process.env.PORT ?? 8080);

process.on('unhandledRejection', (err) => {
  logger.error({ err }, 'Unhandled promise rejection');
});
process.on('uncaughtException', (err) => {
  logger.error({ err }, 'Uncaught exception');
  process.exit(1);
});

async function startCore() {
  const { createServer } = await import('./api/server.js');
  const app = await createServer();
  await app.listen({ host: HOST, port: PORT });
  logger.info({ host: HOST, port: PORT }, 'Core service listening');
}

async function startExecutor() {
  const broker = (process.env.BROKER ?? 'ZERODHA').toUpperCase() as
    | 'ZERODHA' | 'UPSTOX' | 'ANGEL' | 'DHAN' | 'ALICE' | 'FIVEPAISA';

  // Shard env (used by executors for partition ownership logs)
  const shardIndex = Number(process.env.SHARD_INDEX ?? 0);
  const shardCount = Number(process.env.SHARD_COUNT ?? 1);
  const concurrency = Number(process.env.SHARD_CONCURRENCY ?? 64);

  logger.info({ broker, shardIndex, shardCount, concurrency }, 'Starting executor');

  // Dynamic import per broker (only Zerodha stub exists now; add others later)
  let mod: any;
  switch (broker) {
    case 'ZERODHA':
      mod = await import('./brokers/zerodha/executor.js');
      break;
    case 'UPSTOX':
      mod = await import('./brokers/upstox/executor.js');
      break;
    case 'ANGEL':
      mod = await import('./brokers/angel/executor.js');
      break;
    case 'DHAN':
      mod = await import('./brokers/dhan/executor.js');
      break;
    case 'ALICE':
      mod = await import('./brokers/alice/executor.js');
      break;
    case 'FIVEPAISA':
      mod = await import('./brokers/fivepaisa/executor.js');
      break;
    default:
      throw new Error(`Unsupported broker: ${broker}`);
  }

  if (!mod?.startExecutor) {
    throw new Error(`Executor module for ${broker} does not export startExecutor()`);
  }
  await mod.startExecutor(broker);
}

(async () => {
  logger.info({ ROLE }, 'Booting application');

  if (ROLE === 'core') {
    await startCore();
  } else if (ROLE === 'executor') {
    await startExecutor();
  } else {
    logger.error({ ROLE }, 'Unknown ROLE');
    process.exit(1);
  }

  // Graceful shutdown hooks
  const shutdown = async (sig: string) => {
    try {
      logger.info({ sig }, 'Shutting down gracefully');
      // If you keep handles (servers, bus connections), close them here.
      process.exit(0);
    } catch (e) {
      logger.error({ e }, 'Error during shutdown');
      process.exit(1);
    }
  };

  ['SIGINT', 'SIGTERM'].forEach((sig) => {
    process.on(sig as NodeJS.Signals, () => void shutdown(sig));
  });
})();
