// src/core/allocator/sizing.ts
import { SignalEvent } from '../types.js';
import { AccountAssignment } from './expandAccounts.js';

export interface MarketInfo {
  lotSize?: number | null;
  tickSize?: number | null;
  lastTradedPrice?: number | null;
  minQty?: number | null;
}

export interface SliceConfig {
  maxQtyPerSlice?: number;
  maxNotionalPerSlice?: number; // requires price
  minQtyPerSlice?: number;
}

export interface SizedOrder {
  accountId: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  qty: number;                 // lot-compliant
  price: number | null;        // null = MARKET
  notional?: number | null;    // qty * price if price known
}

/* ----------------- helpers ----------------- */

function roundToTick(price: number, tick?: number | null) {
  if (!tick || tick <= 0) return price;
  return Math.round(price / tick) * tick;
}
function ceilToLot(qty: number, lot?: number | null) {
  if (!lot || lot <= 1) return Math.max(1, Math.ceil(qty));
  const lots = Math.ceil(qty / (lot as number));
  return lots * (lot as number);
}
function floorToLot(qty: number, lot?: number | null) {
  if (!lot || lot <= 1) return Math.max(0, Math.floor(qty));
  const lots = Math.floor(qty / (lot as number));
  return lots * (lot as number);
}
function applySlippageBps(
  side: 'BUY' | 'SELL',
  price: number | null | undefined,
  slippageBps?: number | null,
  tick?: number | null,
) {
  if (price == null) return null; // market order
  const bps = Math.max(0, slippageBps ?? 0);
  const factor = bps / 10_000;
  const adjusted = side === 'BUY' ? price * (1 + factor) : price * (1 - factor);
  return roundToTick(adjusted, tick);
}
function notional(qty: number, price: number | null | undefined) {
  return price != null ? qty * price : null;
}

/* --------------- sizing logic --------------- */

/**
 * Compute per-account size based on allocation rule.
 * - fixed_qty: exact quantity
 * - percent_of_master: baseQty * multiplier
 * - fixed_value: ₹value / price (fallback to percent_of_master if price unknown)
 * Rounds to lot size and applies simple risk caps.
 */
export function computeSizedOrder(
  signal: SignalEvent,
  acct: AccountAssignment,
  market: MarketInfo = {},
): SizedOrder {
  const side = signal.side!;
  const baseQty = Math.max(0, Math.floor(signal.qty ?? 0));
  const lot = market.lotSize ?? 1;
  const tick = market.tickSize ?? null;

  // 1) derive desiredQty using a discriminated union
  let desiredQty = 0;
  switch (acct.allocation.mode) {
    case 'fixed_qty':
      desiredQty = Math.max(0, Math.floor(acct.allocation.quantity));
      break;

    case 'percent_of_master':
      desiredQty = Math.floor(baseQty * (acct.allocation.multiplier ?? 1));
      break;

    case 'fixed_value': {
      const refPrice = signal.price ?? market.lastTradedPrice ?? null;
      if (refPrice && refPrice > 0) {
        desiredQty = Math.floor(acct.allocation.value / refPrice);
      } else {
        // fallback if price unknown
        desiredQty = Math.floor(baseQty * (acct.allocation.multiplier ?? 1));
      }
      break;
    }
  }

  // minQty guard (if exchange requires)
  if (market.minQty && desiredQty > 0) desiredQty = Math.max(desiredQty, market.minQty);

  // 2) round up to lot so we don't under-allocate
  let roundedQty = ceilToLot(desiredQty, lot);

  // 3) risk caps (optional)
  const risk = acct.risk ?? {};
  const refPriceForNotional = signal.price ?? market.lastTradedPrice ?? null;

  if (typeof risk.maxQty === 'number') {
    roundedQty = Math.min(roundedQty, floorToLot(risk.maxQty, lot));
  }
  if (typeof risk.maxValue === 'number' && refPriceForNotional) {
    const maxByValue = Math.floor(risk.maxValue / refPriceForNotional);
    roundedQty = Math.min(roundedQty, floorToLot(maxByValue, lot));
  }

  if (roundedQty > 0 && lot > 1) {
    roundedQty = Math.max(lot, roundedQty);
  }

  // 4) slippage for LIMIT orders
  const workingPrice = applySlippageBps(side, signal.price, risk.slippageBps, tick);

  return {
    accountId: acct.accountId,
    symbol: signal.symbol,
    side,
    qty: roundedQty,
    price: workingPrice, // null keeps market
    notional: notional(roundedQty, refPriceForNotional),
  };
}

/**
 * Slice into child orders by notional/qty constraints, rounded to lots.
 */
export function* sliceOrder(
  sized: SizedOrder,
  sliceCfg: SliceConfig = {},
  market: MarketInfo = {},
): Generator<SizedOrder & { seq: number }> {
  const lot = market.lotSize ?? 1;
  const minSlice = Math.max(1, Math.floor(sliceCfg.minQtyPerSlice ?? 1));
  const minSliceRounded = ceilToLot(minSlice, lot);
  const price = sized.price ?? null;
  const useNotionalGuard = !!(sliceCfg.maxNotionalPerSlice && price);

  let remain = sized.qty;
  let seq = 0;

  while (remain > 0) {
    let take: number;

    if (useNotionalGuard) {
      const maxByValue = Math.floor((sliceCfg.maxNotionalPerSlice as number) / (price as number));
      const maxByValueRounded = floorToLot(Math.max(1, maxByValue), lot);
      take = Math.max(minSliceRounded, Math.min(remain, maxByValueRounded));
    } else if (sliceCfg.maxQtyPerSlice && sliceCfg.maxQtyPerSlice > 0) {
      const maxByQtyRounded = floorToLot(sliceCfg.maxQtyPerSlice, lot);
      take = Math.max(minSliceRounded, Math.min(remain, maxByQtyRounded));
    } else {
      take = remain;
    }

    take = floorToLot(Math.min(take, remain), lot);
    if (take <= 0) take = Math.min(remain, lot > 1 ? lot : 1);

    yield { ...sized, qty: take, notional: notional(take, price), seq: seq++ } as any;
    remain -= take;
  }
}
