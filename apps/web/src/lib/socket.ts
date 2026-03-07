import { io, Socket } from 'socket.io-client';

/**
 * Socket.io 单例客户端
 *
 * MVP：手动连接，不自动连接（在游戏页面初始化时调用 connect()）。
 * 认证通过 httpOnly cookie 传递，不在 JS 层持有 token。
 */

let socket: Socket | null = null;

export interface ServerLocationLike {
  protocol: string;
  hostname: string;
  origin: string;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function isLocalDevHost(hostname: string): boolean {
  return (
    hostname === 'localhost'
    || hostname === '0.0.0.0'
    || /^127(?:\.\d{1,3}){3}$/.test(hostname)
    || /^10(?:\.\d{1,3}){3}$/.test(hostname)
    || /^192\.168(?:\.\d{1,3}){2}$/.test(hostname)
    || /^172\.(1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2}$/.test(hostname)
  );
}

export function resolveServerUrl(
  configuredUrl = process.env.NEXT_PUBLIC_SERVER_URL,
  locationLike: ServerLocationLike | undefined = typeof window !== 'undefined' ? window.location : undefined,
): string {
  if (configuredUrl) {
    return trimTrailingSlash(configuredUrl);
  }

  if (locationLike) {
    if (locationLike.protocol === 'http:' && isLocalDevHost(locationLike.hostname)) {
      return `${locationLike.protocol}//${locationLike.hostname}:3001`;
    }

    return trimTrailingSlash(locationLike.origin);
  }

  return 'http://localhost:3001';
}

export function getServerUrl(): string {
  return resolveServerUrl();
}

export function getSocket(): Socket {
  if (!socket) {
    socket = io(getServerUrl(), {
      autoConnect: false,
      withCredentials: true,      // 传递 httpOnly cookie
      transports: ['websocket'],  // 跳过 polling，直接 WebSocket
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 10,
    });
  }
  return socket;
}

export function connectSocket() {
  getSocket().connect();
}

export function disconnectSocket() {
  socket?.disconnect();
}
