import { Server as HttpServer } from 'http';
import { Server as SocketServer, Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { verifyAccessToken, isTokenBlacklisted } from '../../core/utils/jwt';
import { getRedisClient } from '../../config/redis';
import { logger } from '../../core/utils/logger';
import { env } from '../../config/env.schema';

export class SocketService {
  private io: SocketServer | null = null;
  // userId → Set<socketId> — only valid on the current instance (Redis adapter
  // handles cross-instance emit; this map is for local isUserOnline checks)
  private userSockets: Map<string, Set<string>> = new Map();

  initialize(server: HttpServer): void {
    this.io = new SocketServer(server, {
      cors: {
        origin: env.CLIENT_URL,
        methods: ['GET', 'POST'],
        credentials: true,
      },
      transports: ['websocket', 'polling'],
      // Ping every 25s, disconnect after 60s of no response
      pingInterval: 25_000,
      pingTimeout: 60_000,
    });

    // ── Redis adapter: broadcast to all instances, not just this one ──────────
    // Uses two separate Redis connections — one pub, one sub.
    // The sub connection must be a duplicate so it can block on SUBSCRIBE.
    try {
      const pubClient = getRedisClient();
      const subClient = pubClient.duplicate();

      subClient.on('error', (err) =>
        logger.warn('[Socket] Redis sub client error:', err),
      );

      this.io.adapter(createAdapter(pubClient, subClient));
      logger.info('Socket.io Redis adapter attached (multi-instance ready)');
    } catch (err) {
      // Non-fatal: fall back to in-process adapter (single-instance mode)
      logger.warn('[Socket] Redis adapter failed — running in single-instance mode:', err);
    }

    // ── Auth middleware: verify JWT + check blacklist on every connection ──────
    this.io.use(async (socket: Socket, next) => {
      try {
        const rawToken =
          socket.handshake.auth?.token ??
          socket.handshake.headers.authorization?.replace('Bearer ', '');

        if (!rawToken) return next(new Error('Authentication token required'));

        // Strip "Bearer " prefix if present
        const token = rawToken.startsWith('Bearer ') ? rawToken.slice(7) : rawToken;

        const decoded = verifyAccessToken(token);

        // Reject if the token has been blacklisted (e.g. logoutAll was called)
        if (decoded.jti) {
          const revoked = await isTokenBlacklisted(decoded.jti);
          if (revoked) return next(new Error('Token has been revoked'));
        }

        socket.data.userId = decoded.userId;
        socket.data.user = decoded;
        next();
      } catch {
        next(new Error('Invalid authentication token'));
      }
    });

    // ── Connection handler ───────────────────────────────────────────────────
    this.io.on('connection', (socket: Socket) => {
      const userId = socket.data.userId as string;
      logger.info(`[Socket] Connected: ${socket.id} (user: ${userId})`);

      // Track locally for isUserOnline()
      if (!this.userSockets.has(userId)) {
        this.userSockets.set(userId, new Set());
      }
      this.userSockets.get(userId)!.add(socket.id);

      // User-scoped room — Redis adapter broadcasts to all instances
      socket.join(`user:${userId}`);

      socket.on('disconnect', (reason) => {
        const set = this.userSockets.get(userId);
        if (set) {
          set.delete(socket.id);
          if (set.size === 0) this.userSockets.delete(userId);
        }
        logger.debug(`[Socket] Disconnected: ${socket.id} (${reason})`);
      });

      // Health ping — useful for mobile clients behind aggressive NAT
      socket.on('ping', () => socket.emit('pong'));
    });

    logger.info('Socket.io initialized');
  }

  /** Emit to all sockets of a given user (across all server instances) */
  emitToUser(userId: string, event: string, data: unknown): void {
    if (!this.io) {
      logger.warn('[Socket] Not initialized — cannot emit');
      return;
    }
    this.io.to(`user:${userId}`).emit(event, data);
  }

  /** Broadcast to every connected client */
  emitToAll(event: string, data: unknown): void {
    this.io?.emit(event, data);
  }

  /**
   * True if the user has at least one socket connected to THIS instance.
   * For cross-instance presence, query the Redis adapter's rooms.
   */
  isUserOnline(userId: string): boolean {
    const sockets = this.userSockets.get(userId);
    return !!sockets && sockets.size > 0;
  }

  getOnlineUserCount(): number {
    return this.userSockets.size;
  }

  getIO(): SocketServer | null {
    return this.io;
  }
}

// Singleton — one instance per Node process
export const socketService = new SocketService();
