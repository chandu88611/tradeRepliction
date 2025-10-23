// src/api/zerodhaRoutes.ts
import { FastifyInstance } from "fastify";
import fs from "fs";
import path from "path";

// Zerodha SDK (CommonJS)
const { KiteConnect } = require("kiteconnect");

// Load API key/secret
const api_key = process.env.ZERODHA_API_KEY || "ocwgsnlcimmpumwa";
const api_secret =
  process.env.ZERODHA_API_SECRET || "3e5cziolnhjit6csqvcqn2h2u4buqspe";

const tokenPath = path.resolve("access_token.json");
let access_token: string | null = null;

// Try loading saved token
if (fs.existsSync(tokenPath)) {
  try {
    const saved = JSON.parse(fs.readFileSync(tokenPath, "utf8"));
    access_token = saved.accessToken;
  } catch {
    access_token = null;
  }
}

const kc = new KiteConnect({ api_key });
if (access_token) {
  kc.setAccessToken(access_token);
  console.log("✅ Zerodha client initialized with saved token");
} else {
  console.log("⚠️ No access token found. Please login at /zerodha/login");
}

// Helper: check market hours
function isMarketHours() {
  const now = new Date();
  const hrs = now.getHours();
  const mins = now.getMinutes();
  const time = hrs * 60 + mins;
  return time >= 9 * 60 + 15 && time <= 15 * 60 + 30;
}

export default async function zerodhaRoutes(app: FastifyInstance) {
  /** 🔹 Step 1: Login */
  app.get("/login", async (_, reply) => {
    return reply.redirect(kc.getLoginURL());
  });

  /** 🔹 Step 2: Callback */
  app.get("/callback", async (req, reply) => {
    try {
      const { request_token, status } = req.query as {
        request_token?: string;
        status?: string;
      };
      if (!request_token || status !== "success") {
        throw new Error("Invalid request_token or status");
      }

      const session = await kc.generateSession(request_token, api_secret);
      access_token = session.access_token;
      kc.setAccessToken(access_token);

      fs.writeFileSync(
        tokenPath,
        JSON.stringify({ accessToken: access_token }, null, 2)
      );

      console.log("✅ New Zerodha access token saved:", access_token);
      return reply.send({ ok: true, accessToken: access_token });
    } catch (err: any) {
      console.error("❌ Error in /zerodha/callback:", err.message);
      return reply.status(500).send({ error: err.message });
    }
  });

  /** 🔹 Step 3: Get profile */
  app.get("/profile", async (_, reply) => {
    try {
      if (!access_token)
        throw new Error("Login required. Visit /zerodha/login first.");
      const profile = await kc.getProfile();
      return reply.send(profile);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  /** 🔹 Step 4: Get funds */
  app.get("/funds", async (_, reply) => {
    try {
      if (!access_token)
        throw new Error("Login required. Visit /zerodha/login first.");
      const funds = await kc.getMargins();
      return reply.send(funds);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  /** 🔹 Place order */
  app.post("/order", async (req, reply) => {
    try {
      if (!access_token) throw new Error("Login required.");
      const body = req.body as any;
      const [exchange, tradingsymbol] = (body.symbol || "NSE:RELIANCE").split(
        ":"
      );

      const variety = isMarketHours() ? "regular" : "amo"; // ✅ FIXED

      const params = {
        exchange,
        tradingsymbol,
        transaction_type: body.side || "BUY",
        quantity: body.qty || 1,
        order_type: body.price ? "LIMIT" : "MARKET",
        price: body.price ?? 0,
        product: body.product || "MIS",
        validity: "DAY",
      };

      const resp = await kc.placeOrder(variety, params);
      return reply.send({ ok: true, order: resp });
    } catch (err: any) {
      console.error("❌ Place Order Error:", err);
      return reply.status(500).send({ error: err.message });
    }
  });

  /** 🔹 Get all orders */
  app.get("/orders", async (_, reply) => {
    try {
      if (!access_token) throw new Error("Login required.");
      const orders = await kc.getOrders();
      return reply.send(orders);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  /** 🔹 Get specific order by ID */
  app.get("/order/:id", async (req, reply) => {
    try {
      if (!access_token) throw new Error("Login required.");
      const { id } = req.params as any;
      const orders = await kc.getOrders();
      const order = orders.find((o: any) => o.order_id === id);
      if (!order) return reply.status(404).send({ error: "Order not found" });
      return reply.send(order);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  /** 🔹 Cancel order */
  app.post("/order/cancel", async (req, reply) => {
    try {
      if (!access_token) throw new Error("Login required.");
      const { order_id } = req.body as any;
      if (!order_id) throw new Error("order_id is required");

      const resp = await kc.cancelOrder("regular", order_id);
      return reply.send({ ok: true, cancelled: resp });
    } catch (err: any) {
      console.error("❌ Cancel Order Error:", err);
      return reply.status(500).send({ error: err.message });
    }
  });

  /** 🔹 Modify order */
  app.post("/order/modify", async (req, reply) => {
    try {
      if (!access_token) throw new Error("Login required.");
      const { order_id, changes } = req.body as any;
      if (!order_id) throw new Error("order_id is required");

      const resp = await kc.modifyOrder("regular", order_id, changes);
      return reply.send({ ok: true, modified: resp });
    } catch (err: any) {
      console.error("❌ Modify Order Error:", err);
      return reply.status(500).send({ error: err.message });
    }
  });

  /** 🔹 Positions */
  app.get("/positions", async (_, reply) => {
    try {
      if (!access_token) throw new Error("Login required.");
      const positions = await kc.getPositions();
      return reply.send(positions);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  /** 🔹 Holdings */
  app.get("/holdings", async (_, reply) => {
    try {
      if (!access_token) throw new Error("Login required.");
      const holdings = await kc.getHoldings();
      return reply.send(holdings);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });
}
