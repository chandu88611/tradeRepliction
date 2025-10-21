// src/core/idempotency/keys.ts
import crypto from 'node:crypto';

/**
 * Produce a short, deterministic idempotency key for an order slice.
 * Stable across retries, unique across (broker, account, signal, slice).
 *
 * @example
 * const key = buildIdemKey('ZERODHA','ACC-123','S-10001',0)
 */
export function buildIdemKey(
  broker: string,
  accountId: string,
  signalId: string,
  sliceIndex: number | string
): string {
  const raw = `${normalize(broker)}|${normalize(accountId)}|${normalize(signalId)}|${sliceIndex}`;
  return sha256hex(raw).slice(0, 32); // 32 hex chars (128-bit) is plenty for most brokers
}

/**
 * Variant for MODIFY/CANCEL actions where you may not have a slice index.
 * Provide a stable action label to keep keys distinct from NEW.
 */
export function buildActionIdemKey(
  broker: string,
  accountId: string,
  signalId: string,
  action: 'NEW' | 'MODIFY' | 'CANCEL' | 'CLOSE'
): string {
  const raw = `${normalize(broker)}|${normalize(accountId)}|${normalize(signalId)}|${action}`;
  return sha256hex(raw).slice(0, 32);
}

/**
 * Namespacing helper in case you want different key spaces (e.g., per environment).
 * Example: namespaceIdem('prod', key)
 */
export function namespaceIdem(namespace: string, key: string): string {
  const raw = `${normalize(namespace)}|${key}`;
  return sha256hex(raw).slice(0, 32);
}

/**
 * Convert arbitrary input to a 32-char stable id (useful for brokers with strict header limits).
 */
export function compactId(input: string): string {
  return sha256hex(input).slice(0, 32);
}

/* ------------------------- internals ------------------------- */

function sha256hex(s: string): string {
  return crypto.createHash('sha256').update(s).digest('hex');
}

function normalize(s: unknown): string {
  return String(s ?? '').trim();
}
