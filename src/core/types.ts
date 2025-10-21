export type Broker = 'ZERODHA' | 'UPSTOX' | 'ANGEL' | 'DHAN' | 'ALICE' | 'FIVEPAISA';
export type Side = 'BUY' | 'SELL';
export type TIF = 'DAY' | 'IOC' | 'GTC';

export interface MasterOrder {
  id: string;
  symbol: string; // e.g., NSE:RELIANCE
  side: Side;
  qty: number;
  price?: number | null;
  tif?: TIF;
  ts: number;
}

export interface SignalEvent {
  id: string;
  masterOrderId: string;
  event: 'NEW' | 'MODIFY' | 'CANCEL' | 'CLOSE';
  symbol: string;
  side?: Side;
  qty?: number;
  price?: number | null;
  tif?: TIF;
  ts: number;
}
