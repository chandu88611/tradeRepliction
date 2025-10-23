// import Fastify from "fastify";
// import { toSignal } from "../core/normalizer/toSignal.js";
// import { publishSignal } from "../core/router/fanout.js";
// import zerodhaRoutes from "./zerodhaRoutes.js";

// export async function createServer() {

//   const app = Fastify({ logger: true });

//   app.get("/health", async () => ({ ok: true }));

//   app.post("/master/orders", async (req, reply) => {
//     const b = req.body as any;
//     const signal = toSignal(
//       {
//         id: b.id,
//         symbol: b.symbol,
//         side: b.side,
//         qty: b.qty,
//         price: b.price ?? null,
//         tif: b.tif ?? "DAY",
//         ts: Date.now(),
//       },
//       "NEW"
//     );
//     await publishSignal(signal);
//     return reply.code(202).send({ ok: true, signalId: signal.id });
//   });

//   return app;
// }

import Fastify from "fastify";
import { toSignal } from "../core/normalizer/toSignal.js";
import { publishSignal } from "../core/router/fanout.js";
import zerodhaRoutes from "./zerodhaRoutes.js";

export async function createServer() {
  const app = Fastify({ logger: true });

  // Health check
  app.get("/health", async () => ({ ok: true }));

  // Master order → publish to NATS
  app.post("/master/orders", async (req, reply) => {
    const b = req.body as any;
    const signal = toSignal(
      {
        id: b.id,
        symbol: b.symbol,
        side: b.side,
        qty: b.qty,
        price: b.price ?? null,
        tif: b.tif ?? "DAY",
        ts: Date.now(),
      },
      "NEW"
    );
    await publishSignal(signal);
    return reply.code(202).send({ ok: true, signalId: signal.id });
  });

  // ✅ Mount Zerodha REST routes under /zerodha/*
  app.register(zerodhaRoutes, { prefix: "/zerodha" });

  return app;
}
