import Fastify, { type FastifyInstance } from 'fastify';

export interface HealthStatus {
  service: 'aipoker-server';
  nowMs: number;
  ok: true;
}

export function createHealthStatus(nowMs: number): HealthStatus {
  return {
    service: 'aipoker-server',
    nowMs,
    ok: true
  };
}

export interface ServerDependencies {
  nowMs: () => number;
}

export function createServer(deps: ServerDependencies): FastifyInstance {
  const server = Fastify({
    logger: false
  });

  server.get('/health', async () => createHealthStatus(deps.nowMs()));

  return server;
}
