import { computeSizedOrder, sliceOrder } from '../core/allocator/sizing.js';
import { buildIdemKey } from '../core/idempotency/keys.js';
import { AccountAssignment } from '../core/allocator/expandAccounts.js';
import { SignalEvent } from '../core/types.js';
import { placeOrder } from '../brokers/zerodha/client.js';

const inflight = new Set<string>();
let tokens = Number(process.env.SHARD_CONCURRENCY ?? 64);

const mailboxes = new Map<string, Array<{ signal: SignalEvent; acct: AccountAssignment }>>();

export function enqueue(evt: { signal: SignalEvent; acct: AccountAssignment }) {
  const q = mailboxes.get(evt.acct.accountId) ?? [];
  q.push(evt);
  mailboxes.set(evt.acct.accountId, q);
  schedule();
}

async function schedule() {
  if (tokens <= 0) return;
  for (const [accountId, q] of mailboxes) {
    if (!q.length) continue;
    if (inflight.has(accountId)) continue;
    if (tokens <= 0) break;

    const evt = q.shift()!;
    inflight.add(accountId);
    tokens--;

    (async () => {
      try {
        const sized = computeSizedOrder(evt.signal, evt.acct);
        const sliceCfg = { maxQtyPerSlice: 100 };

        for (const slice of sliceOrder(sized, sliceCfg)) {
          const idem = buildIdemKey(
            evt.acct.broker,
            evt.acct.accountId,
            evt.signal.id,
            (slice as any).seq
          );

          await placeOrder({
            broker: evt.acct.broker,
            accountId: evt.acct.accountId,
            order: { ...sized, qty: slice.qty },
            idem,
          });
        }
      } finally {
        inflight.delete(accountId);
        tokens++;
        if (!q.length) mailboxes.delete(accountId);
        schedule();
      }
    })();
  }
}
