export const cfg = {
  port: Number(process.env.PORT ?? 8080),
  partitionsPerBroker: Number(process.env.PARTITIONS_PER_BROKER ?? 256),
  shard: {
    index: Number(process.env.SHARD_INDEX ?? 0),
    count: Number(process.env.SHARD_COUNT ?? 1),
    concurrency: Number(process.env.SHARD_CONCURRENCY ?? 64),
  },
  nats: {
    url: process.env.NATS_URL || 'nats://localhost:4222',
    user: process.env.NATS_USER,
    pass: process.env.NATS_PASS,
  },
};
