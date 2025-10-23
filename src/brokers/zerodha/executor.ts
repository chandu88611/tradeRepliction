// import { cfg } from "../../config/index.js";
// import { createNatsBus } from "../../infra/bus/nats.js";
// import { enqueue } from "../../workers/accountWorker.js";
// import { expandAccounts } from "../../core/allocator/expandAccounts.js";

// const PARTS = Number(process.env.PARTITIONS_PER_BROKER ?? 256);

// function accountPartition(accountId: string, partitions = PARTS) {
//   let h = 0;
//   for (let i = 0; i < accountId.length; i++)
//     h = (h * 31 + accountId.charCodeAt(i)) | 0;
//   return Math.abs(h) % partitions;
// }

// export async function startExecutor(
//   broker: "ZERODHA" | "UPSTOX" | "ANGEL" | "DHAN" | "ALICE" | "FIVEPAISA"
// ) {
//   const shardIdx = cfg.shard.index;
//   const shardCnt = cfg.shard.count;
//   const bus = await createNatsBus();
//   await bus.ensureStreams([broker]);

//   const unsubs: Array<() => Promise<void>> = [];
//   for (let p = 0; p < PARTS; p++) {
//     const owns = Math.floor((p * shardCnt) / PARTS) === shardIdx;
//     if (!owns) continue;

//     const subject = `signals.${broker}.p.${p}`;
//     const unsub = await bus.subscribe(subject, async (buf) => {
//       const signal = JSON.parse(new TextDecoder().decode(buf));
//       const accounts = await expandAccounts(signal, broker);

//       for (const acct of accounts) {
//         const ap = accountPartition(acct.accountId);
//         const shardOwns = Math.floor((ap * shardCnt) / PARTS) === shardIdx;
//         if (!shardOwns) continue;
//         enqueue({ signal, acct });
//       }
//     });
//     unsubs.push(unsub);
//   }

//   process.on("SIGINT", async () => {
//     await Promise.all(unsubs.map((u) => u()));
//     process.exit(0);
//   });
// }
import { cfg } from "../../config/index.js";
import { createNatsBus } from "../../infra/bus/nats.js";
import { expandAccounts } from "../../core/allocator/expandAccounts.js";
import { computeSizedOrder, sliceOrder } from "../../core/allocator/sizing.js";
import { buildIdemKey } from "../../core/idempotency/keys.js";
import { placeOrder } from "./client.js"; // 🔗 real Zerodha client
import { logger } from "../../utils/logger.js";

const PARTS = Number(process.env.PARTITIONS_PER_BROKER ?? 256);

function accountPartition(accountId: string, partitions = PARTS) {
  let h = 0;
  for (let i = 0; i < accountId.length; i++)
    h = (h * 31 + accountId.charCodeAt(i)) | 0;
  return Math.abs(h) % partitions;
}

export async function startExecutor(
  broker: "ZERODHA" | "UPSTOX" | "ANGEL" | "DHAN" | "ALICE" | "FIVEPAISA"
) {
  const shardIdx = cfg.shard.index;
  const shardCnt = cfg.shard.count;
  const bus = await createNatsBus();
  await bus.ensureStreams([broker]);

  const unsubs: Array<() => Promise<void>> = [];
  for (let p = 0; p < PARTS; p++) {
    const owns = Math.floor((p * shardCnt) / PARTS) === shardIdx;
    if (!owns) continue;

    const subject = `signals.${broker}.p.${p}`;
    const unsub = await bus.subscribe(subject, async (buf) => {
      const signal = JSON.parse(new TextDecoder().decode(buf));
      const accounts = await expandAccounts(signal, broker);

      for (const acct of accounts) {
        const ap = accountPartition(acct.accountId);
        const shardOwns = Math.floor((ap * shardCnt) / PARTS) === shardIdx;
        if (!shardOwns) continue;

        const sized = computeSizedOrder(signal, acct);
        for (const slice of sliceOrder(sized, { maxQtyPerSlice: 100 })) {
          const idem = buildIdemKey(
            broker,
            acct.accountId,
            signal.id,
            (slice as any).seq
          );

          try {
            const resp = await placeOrder({
              symbol: slice.symbol,
              side: slice.side,
              qty: slice.qty,
              price: slice.price,
            });
            logger.info(
              { resp, idem },
              "✅ Zerodha order placed from executor"
            );
          } catch (err: any) {
            logger.error(
              { err, idem },
              "❌ Executor failed to place Zerodha order"
            );
          }
        }
      }
    });
    unsubs.push(unsub);
  }

  process.on("SIGINT", async () => {
    await Promise.all(unsubs.map((u) => u()));
    process.exit(0);
  });
}
