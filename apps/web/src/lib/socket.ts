import { io, Socket } from 'socket.io-client';

/**
 * Socket.io 单例客户端
 *
 * MVP：手动连接，不自动连接（在游戏页面初始化时调用 connect()）。
 * 认证通过 httpOnly cookie 传递，不在 JS 层持有 token。
 */

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    const serverUrl = process.env.NEXT_PUBLIC_SERVER_URL ?? 'http://localhost:3001';

    socket = io(serverUrl, {
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
