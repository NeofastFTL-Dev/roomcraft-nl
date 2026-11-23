import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from './env';
import { localUser } from './desktop';

export const SESSION_COOKIE = env.cookieName;

export interface SessionPayload {
  sub: string;
  email: string;
}

export function signSession(payload: SessionPayload): string {
  return jwt.sign(payload, env.jwtSecret, { expiresIn: `${env.sessionDays}d` });
}

export function verifySession(token: string): SessionPayload | null {
  try {
    const decoded = jwt.verify(token, env.jwtSecret);
    if (typeof decoded === 'string' || !decoded.sub) return null;
    return { sub: String(decoded.sub), email: String((decoded as { email?: string }).email ?? '') };
  } catch {
    return null;
  }
}

export function setSessionCookie(res: Response, token: string): void {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.cookieSecure,
    maxAge: env.sessionDays * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE, { path: '/' });
}

export interface AuthedRequest extends Request {
  userId?: string;
  userEmail?: string;
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  if (env.desktopMode) {
    // The desktop app is single-user: no session, every request is the local user.
    localUser().then((user) => {
      req.userId = user.id;
      req.userEmail = user.email;
      next();
    }, next);
    return;
  }
  const token = req.cookies?.[SESSION_COOKIE] as string | undefined;
  if (!token) {
    res.status(401).json({ error: 'Niet ingelogd.' });
    return;
  }
  const payload = verifySession(token);
  if (!payload) {
    clearSessionCookie(res);
    res.status(401).json({ error: 'Sessie verlopen. Log opnieuw in.' });
    return;
  }
  req.userId = payload.sub;
  req.userEmail = payload.email;
  next();
}

/**
 * Cookie-based sessions need CSRF protection for state-changing requests.
 * Same-site cookies block cross-site posts in modern browsers; this check
 * additionally rejects requests whose Origin is not the known client.
 */
export function requireSameOrigin(req: Request, res: Response, next: NextFunction): void {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    next();
    return;
  }
  const origin = req.get('origin');
  if (!origin) {
    // Non-browser clients (curl, tests) do not send Origin; they still need the
    // session cookie, which a cross-site page cannot read.
    next();
    return;
  }
  const allowed = new Set([env.clientOrigin, `http://localhost:${env.port}`, `http://127.0.0.1:${env.port}`]);
  if (!allowed.has(origin)) {
    res.status(403).json({ error: 'Verzoek van een onbekende origin geweigerd.' });
    return;
  }
  next();
}

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export function rateLimit(options: { windowMs: number; max: number; name: string }) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const key = `${options.name}:${req.ip ?? 'unknown'}`;
    const now = Date.now();
    const bucket = buckets.get(key);
    if (!bucket || bucket.resetAt < now) {
      buckets.set(key, { count: 1, resetAt: now + options.windowMs });
      next();
      return;
    }
    bucket.count += 1;
    if (bucket.count > options.max) {
      res.status(429).json({
        error: 'Te veel pogingen. Probeer het over enkele minuten opnieuw.',
        retryAfterMs: bucket.resetAt - now,
      });
      return;
    }
    next();
  };
}

export function resetRateLimits(): void {
  buckets.clear();
}
