import { Server } from 'socket.io';
import { readSessionCookie } from '../auth/cookies.js';
import { resolveSession } from '../auth/session.js';
import { bus } from '../events/bus.js';

export const orgRoom = (orgId) => `org:${orgId}`;
const userRoom = (userId) => `user:${userId}`;

/**
 * Socket.IO with cookie-authenticated handshakes. Rooms are chosen
 * server-side from the DB-verified user; there are no client->server events,
 * so a client can never join another room.
 */
export function attachRealtime(httpServer, { config, logger }) {
  const io = new Server(httpServer, {
    serveClient: false,
    cors: { origin: config.corsOrigins, credentials: true },
    // CORS does not cover WebSocket upgrades, so check Origin explicitly.
    allowRequest: (req, cb) => {
      const origin = req.headers.origin;
      cb(null, !origin || config.corsOrigins.includes(origin));
    },
  });

  io.use(async (socket, next) => {
    try {
      const session = await resolveSession(
        readSessionCookie(socket.handshake.headers.cookie),
        config,
      );
      if (!session) return next(new Error('UNAUTHENTICATED'));
      socket.data.userId = String(session.ctx.userId);
      socket.data.orgId = String(session.ctx.orgId);
      next();
    } catch (err) {
      logger?.error({ err }, 'Socket authentication failed');
      next(new Error('UNAUTHENTICATED'));
    }
  });

  io.on('connection', (socket) => {
    socket.join(orgRoom(socket.data.orgId));
    socket.join(userRoom(socket.data.userId));
  });

  const unsubscribe = [
    bus.onOrgEvent(({ orgId, type, payload }) => io.to(orgRoom(orgId)).emit(type, payload)),
    // Removal or role change: drop the user's sockets; the client re-authenticates.
    bus.onDisconnectUser((userId) => io.in(userRoom(userId)).disconnectSockets(true)),
  ];

  return {
    io,
    close: async () => {
      unsubscribe.forEach((off) => off());
      await io.close();
    },
  };
}
