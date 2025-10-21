import { nanoid } from 'nanoid';
import { MasterOrder, SignalEvent } from '../types.js';

export function toSignal(m: MasterOrder, event: SignalEvent['event']): SignalEvent {
  return {
    id: nanoid(),
    masterOrderId: m.id,
    event,
    symbol: m.symbol,
    side: m.side,
    qty: m.qty,
    price: m.price ?? null,
    tif: m.tif ?? 'DAY',
    ts: Date.now(),
  };
}
