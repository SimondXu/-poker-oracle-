import type { Server } from 'socket.io';

/** Whether the server offers Claude Code bots right now: read when `room:state` is built. */
const sources = new WeakMap<Server, () => boolean>();

export function setCliBotsOffer(io: Server, offered: () => boolean): void {
  sources.set(io, offered);
}

export function cliBotsOffered(io: Server): boolean {
  return sources.get(io)?.() ?? false;
}
