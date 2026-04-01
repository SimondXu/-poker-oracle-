import type { AddressInfo } from 'node:net';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import type { FastifyInstance } from 'fastify';
import type { Server } from 'socket.io';

import { parseServerConfig, type ServerConfig } from './config.ts';
import { createServer } from './index.ts';
import { attachRealtime } from './realtime.ts';

export interface StartServerOptions {
  host?: string;
  port?: number;
  env?: Record<string, string | undefined>;
  nowMs?: () => number;
  actionTimeoutMs?: number;
  registerSignalHandlers?: boolean;
}

export interface StartedServer {
  app: FastifyInstance;
  io: Server;
  host: string;
  port: number;
  close: () => Promise<void>;
}

function resolveServerConfig(options: StartServerOptions): ServerConfig {
  const parsed = parseServerConfig(options.env ?? process.env);
  if (!parsed.ok) {
    throw new Error('invalid_server_config');
  }

  return {
    ...parsed.value,
    host: options.host ?? parsed.value.host,
    port: options.port ?? parsed.value.port,
  };
}

function resolveBoundPort(app: FastifyInstance): number {
  const address = app.server.address();
  if (!address) {
    throw new Error('server_not_listening');
  }

  if (typeof address === 'string') {
    throw new Error('unsupported_listen_address');
  }

  return (address as AddressInfo).port;
}

async function closeStartedServer(app: FastifyInstance, io: Server): Promise<void> {
  await new Promise<void>((resolve) => io.close(() => resolve()));
  await app.close();
}

function installSignalHandlers(started: StartedServer): void {
  let shuttingDown = false;

  const shutdown = async (signal: string) => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    try {
      await started.close();
      console.log(`[aipoker-server] received ${signal}, server closed`);
      process.exit(0);
    } catch (error) {
      console.error('[aipoker-server] graceful shutdown failed', error);
      process.exit(1);
    }
  };

  process.once('SIGINT', () => {
    void shutdown('SIGINT');
  });
  process.once('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
}

export async function startServer(options: StartServerOptions = {}): Promise<StartedServer> {
  const serverConfig = resolveServerConfig(options);
  const app = createServer({
    nowMs: options.nowMs ?? (() => Date.now()),
    corsOrigin: serverConfig.corsOrigin,
    authSecret: serverConfig.authSecret,
    authCookieName: serverConfig.authCookieName,
    authTtlSeconds: serverConfig.authTtlSeconds,
    httpRateLimitPerMinute: serverConfig.httpRateLimitPerMinute,
    secureCookies: serverConfig.secureCookies
  });
  const realtimeOptions = {
    authSecret: serverConfig.authSecret,
    authCookieName: serverConfig.authCookieName,
    authStrict: serverConfig.authStrict,
    ...(options.nowMs ? { nowMs: options.nowMs } : {})
  };
  const io =
    options.actionTimeoutMs === undefined
      ? attachRealtime(app, realtimeOptions)
      : attachRealtime(app, {
          ...realtimeOptions,
          actionTimeoutMs: options.actionTimeoutMs,
        });

  await app.listen({
    host: serverConfig.host,
    port: serverConfig.port
  });

  const started: StartedServer = {
    app,
    io,
    host: serverConfig.host,
    port: resolveBoundPort(app),
    close: () => closeStartedServer(app, io)
  };

  if (options.registerSignalHandlers ?? true) {
    installSignalHandlers(started);
  }

  return started;
}

function isDirectExecution(): boolean {
  const entryPath = process.argv[1];
  if (!entryPath) {
    return false;
  }

  return import.meta.url === pathToFileURL(entryPath).href;
}

if (isDirectExecution()) {
  startServer()
    .then((started) => {
      console.log(`[aipoker-server] listening on http://${started.host}:${started.port}`);
    })
    .catch((error) => {
      console.error('[aipoker-server] failed to start', error);
      process.exit(1);
    });
}
