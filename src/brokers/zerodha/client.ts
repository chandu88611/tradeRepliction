// import { getAgent } from "../../infra/http/agent.js";

// export async function placeOrder(p: {
//   broker: string;
//   accountId: string;
//   order: {
//     symbol: string;
//     side: "BUY" | "SELL";
//     qty: number;
//     price: number | null;
//   };
//   idem: string;
// }) {
//   // TODO: real Zerodha API mapping + auth
//   const _agent = getAgent("ZERODHA");
//   await new Promise((r) => setTimeout(r, 50 + Math.random() * 50));
//   return { ok: true } as const;
// }
// src/brokers/zerodha/client.ts
import fs from "fs";
import path from "path";
import { logger } from "../../utils/logger.js";

// CommonJS import because kiteconnect is CJS
// eslint-disable-next-line @typescript-eslint/no-var-requires
const KiteConnect = require("kiteconnect").KiteConnect;

const api_key = process.env.ZERODHA_API_KEY!;
const api_secret = process.env.ZERODHA_API_SECRET!;

const tokenPath = path.resolve("access_token.json");
let access_token: string | null = null;

if (fs.existsSync(tokenPath)) {
  const saved = JSON.parse(fs.readFileSync(tokenPath, "utf8"));
  access_token = saved.accessToken;
}

const kc = new KiteConnect({ api_key });

if (access_token) {
  kc.setAccessToken(access_token);
  logger.info("✅ Zerodha client initialized with saved token");
} else {
  logger.warn("⚠️ No access_token found. Login via /login route first.");
}

// ---------------- API wrappers ---------------- //

export async function getProfile() {
  return await kc.getProfile();
}

export async function getFunds() {
  return await kc.getMargins();
}

export async function placeOrder(order: {
  symbol: string;
  side: "BUY" | "SELL";
  qty: number;
  price: number | null;
}) {
  const [exchange, tradingsymbol] = order.symbol.split(":"); // e.g. NSE:RELIANCE
  const params = {
    exchange,
    tradingsymbol,
    transaction_type: order.side,
    quantity: order.qty,
    order_type: order.price ? "LIMIT" : "MARKET",
    price: order.price ?? 0,
    product: "CNC", // cash & carry
    validity: "DAY",
  };
  return await kc.placeOrder("regular", params);
}

export async function modifyOrder(orderId: string, changes: Partial<any>) {
  return await kc.modifyOrder("regular", orderId, changes);
}

export async function cancelOrder(orderId: string) {
  return await kc.cancelOrder("regular", orderId);
}
