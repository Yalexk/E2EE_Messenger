import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';

let io = null;
const connections = new Map(); // userId -> number of open sockets (tabs)

function readCookie(header, name) {
  if (!header) return null;
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

export const userRoom = (userId) => `user:${userId}`;

export function getOnlineUserIds() {
  return [...connections.keys()];
}

/**
 * Sockets authenticate with the same httpOnly JWT cookie as the REST API, so
 * a client can't subscribe to someone else's messages by lying about its id.
 */
export function initSocket(server, { origins }) {
  io = new Server(server, origins.length ? { cors: { origin: origins, credentials: true } } : {});

  io.use((socket, next) => {
    try {
      const token = readCookie(socket.handshake.headers.cookie, 'jwt');
      const { userId } = jwt.verify(token, process.env.JWT_SECRET);
      socket.data.userId = String(userId);
      next();
    } catch {
      next(new Error('unauthorised'));
    }
  });

  io.on('connection', (socket) => {
    const { userId } = socket.data;
    socket.join(userRoom(userId));
    connections.set(userId, (connections.get(userId) ?? 0) + 1);
    io.emit('onlineUsers', getOnlineUserIds());

    socket.on('disconnect', () => {
      const n = (connections.get(userId) ?? 1) - 1;
      if (n <= 0) connections.delete(userId);
      else connections.set(userId, n);
      io.emit('onlineUsers', getOnlineUserIds());
    });
  });

  return io;
}

export function emitToUser(userId, event, payload) {
  io?.to(userRoom(String(userId))).emit(event, payload);
}
