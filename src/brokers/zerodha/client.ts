import { getAgent } from '../../infra/http/agent.js';

export async function placeOrder(p: {
  broker: string;
  accountId: string;
  order: { symbol: string; side: 'BUY' | 'SELL'; qty: number; price: number | null };
  idem: string;
}) {
  // TODO: real Zerodha API mapping + auth
  const _agent = getAgent('ZERODHA');
  await new Promise((r) => setTimeout(r, 50 + Math.random() * 50));
  return { ok: true } as const;
}
