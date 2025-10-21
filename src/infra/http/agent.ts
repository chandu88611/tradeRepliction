import { Agent } from 'undici';

const agents = new Map<string, Agent>();

export function getAgent(key: string) {
  let a = agents.get(key);
  if (!a) {
    a = new Agent({
      keepAliveTimeout: 10_000,
      keepAliveMaxTimeout: 60_000,
      connections: 64,
    });
    agents.set(key, a);
  }
  return a;
}
