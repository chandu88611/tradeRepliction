// import { connect, StringCodec, consumerOpts, AckPolicy, type NatsConnection, type JetStreamClient } from 'nats';
// import { cfg } from '../../config/index.js';

// export type NatsBus = {
//   nc: NatsConnection;
//   js: JetStreamClient;
//   publish: (subject: string, data: string | Uint8Array) => Promise<void>;
//   subscribe: (subject: string, onMsg: (data: Uint8Array) => Promise<void>) => Promise<() => Promise<void>>;
//   ensureStreams: (brokers: string[]) => Promise<void>;
// };

// export async function createNatsBus(): Promise<NatsBus> {
//   const nc = await connect({
//     servers: cfg.nats.url,
//     user: cfg.nats.user,
//     pass: cfg.nats.pass,
//   });
//   const js = nc.jetstream();
//   const sc = StringCodec();

//   async function ensureStream(name: string, subjects: string[]) {
//     try {
//       await js.addStream({ name, subjects, retention: 'limits' as any });
//     } catch (e: any) {
//       const m = String(e?.message || '');
//       if (!m.includes('already in use') && !m.includes('stream name already in use')) throw e;
//     }
//   }

//   return {
//     nc,
//     js,
//     async publish(subject, data) {
//       await js.publish(subject, typeof data === 'string' ? sc.encode(data) : data);
//     },
//     async subscribe(subject, onMsg) {
//       const durable = subject.replace(/\W/g, '_');
//       const opts = consumerOpts();
//       opts.durable(durable);
//       opts.manualAck();
//       opts.ackPolicy(AckPolicy.Explicit);
//       const sub = await js.subscribe(subject, opts);
//       (async () => {
//         for await (const m of sub) {
//           try {
//             await onMsg(m.data);
//             m.ack();
//           } catch {
//             // no ack → JetStream will redeliver
//           }
//         }
//       })();
//       return async () => {
//         await sub.drain();
//       };
//     },
//     async ensureStreams(brokers: string[]) {
//       for (const b of brokers) {
//         await ensureStream(`SIG_${b}`, [`signals.${b}.p.*`]);
//       }
//     },
//   };
// }

// src/infra/bus/nats.ts
import {
  connect,
  StringCodec,
  consumerOpts,
  RetentionPolicy,
  type NatsConnection,
  type JetStreamClient,
  type JetStreamManager,
} from "nats";
import { cfg } from "../../config/index.js";

export type NatsBus = {
  nc: NatsConnection;
  js: JetStreamClient;
  jsm: JetStreamManager;
  publish: (subject: string, data: string | Uint8Array) => Promise<void>;
  subscribe: (
    subject: string,
    onMsg: (data: Uint8Array) => Promise<void>
  ) => Promise<() => Promise<void>>;
  ensureStreams: (brokers: string[]) => Promise<void>;
};

export async function createNatsBus(): Promise<NatsBus> {
  const nc = await connect({
    servers: cfg.nats?.url || process.env.NATS_URL || "nats://localhost:4222",
    user: cfg.nats?.user || process.env.NATS_USER,
    pass: cfg.nats?.pass || process.env.NATS_PASS,
  });

  const js = nc.jetstream();
  const jsm = await nc.jetstreamManager();
  const sc = StringCodec();

  async function ensureStream(name: string, subjects: string[]) {
    try {
      await jsm.streams.add({
        name,
        subjects,
        retention: RetentionPolicy.Limits, // ✅ enum, not string
      });
    } catch (e: any) {
      const m = String(e?.message || "");
      if (
        !m.toLowerCase().includes("already in use") &&
        !m.toLowerCase().includes("exists")
      ) {
        throw e;
      }
    }
  }

  return {
    nc,
    js,
    jsm,

    async publish(subject, data) {
      await js.publish(
        subject,
        typeof data === "string" ? sc.encode(data) : data
      );
    },

    async subscribe(subject, onMsg) {
      const durable = subject.replace(/\W/g, "_");

      // ✅ use consumerOpts builder
      const opts = consumerOpts();
      opts.durable(durable);
      opts.manualAck();
      opts.ackExplicit();

      const sub = await js.pullSubscribe(subject, opts);

      (async () => {
        for await (const m of sub) {
          try {
            await onMsg(m.data);
            m.ack();
          } catch (err) {
            console.error("❌ Handler failed", err);
            // no ack → message will be retried
          }
        }
      })();

      return async () => {
        await sub.drain();
      };
    },

    async ensureStreams(brokers: string[]) {
      for (const b of brokers) {
        await ensureStream(`SIG_${b}`, [`signals.${b}.p.*`]);
      }
    },
  };
}
