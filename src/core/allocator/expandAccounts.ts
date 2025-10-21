// src/core/allocator/expandAccounts.ts
import { SignalEvent } from '../types.js';

export type AllocationRule =
  | { mode: 'fixed_qty'; quantity: number }
  | { mode: 'percent_of_master'; multiplier?: number }
  | { mode: 'fixed_value'; value: number; multiplier?: number }; // ₹ value target

export interface AccountAssignment {
  accountId: string;
  broker: string;
  allocation: AllocationRule;
  risk?: { maxQty?: number; maxValue?: number; slippageBps?: number };
}

export async function expandAccounts(signal: SignalEvent, broker: string): Promise<AccountAssignment[]> {
  // TODO: load from DB. Mock 3 accounts for now.
  return Array.from({ length: 3 }, (_, i) => ({
    accountId: `${broker}-ACC-${i + 1}`,
    broker,
    allocation: { mode: 'percent_of_master', multiplier: 1.0 },
    risk: { maxQty: undefined, maxValue: undefined, slippageBps: 0 },
  }));
}
