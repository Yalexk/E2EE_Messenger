import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import User from '../models/user.model.js';

const MAX_SOCKETS_PER_USER = 5; // a few tabs is plenty
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

  io.use(async (socket, next) => {
    let userId;
    try {
      const token = readCookie(socket.handshake.headers.cookie, 'jwt');
      userId = String(jwt.verify(token, process.env.JWT_SECRET).userId);
    } catch {
      return next(new Error('unauthorised'));
    }
    try {
      if ((connections.get(userId) ?? 0) >= MAX_SOCKETS_PER_USER) return next(new Error('too many connections'));
      const user = await User.exists({ _id: userId, isBot: { $ne: true } });
      if (!user) return next(new Error('unauthorised'));
      socket.data.userId = userId;
      next();
    } catch {
      next(new Error('server error'));
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
