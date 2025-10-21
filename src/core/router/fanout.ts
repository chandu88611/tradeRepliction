import { createNatsBus } from '../../infra/bus/nats.js';
import { SignalEvent } from '../types.js';

const BROKERS = ['ZERODHA', 'UPSTOX', 'ANGEL', 'DHAN', 'ALICE', 'FIVEPAISA'] as const;

 
let busPromise: Promise<Awaited<ReturnType<typeof createNatsBus>>> | null = null;

async function bus() {
  return (busPromise ??= createNatsBus());
}

export async function publishSignal(signal: SignalEvent) {
  const b = await bus();
  await b.ensureStreams([...BROKERS]);
  const payload = JSON.stringify(signal);

  for (const broker of BROKERS) {
    await b.publish(`signals.${broker}.p.0`, payload);
  }
}
