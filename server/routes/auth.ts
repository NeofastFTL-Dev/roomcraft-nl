import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../db';
import { env } from '../env';
import { localUser } from '../desktop';
import { loginSchema, registerSchema } from '../../shared/validation';
import {
  clearSessionCookie,
  rateLimit,
  setSessionCookie,
  signSession,
  SESSION_COOKIE,
  verifySession,
} from '../auth';

export const authRouter = Router();

interface PublicUser {
  id: string;
  name: string;
  email: string;
  createdAt: string;
}

function publicUser(user: { id: string; name: string; email: string; createdAt: Date }): PublicUser {
  return { id: user.id, name: user.name, email: user.email, createdAt: user.createdAt.toISOString() };
}

authRouter.post('/register', rateLimit({ name: 'register', windowMs: 10 * 60_000, max: 20 }), async (req, res) => {
  if (env.desktopMode) {
    res.status(403).json({ error: 'Accounts zijn uitgeschakeld in de desktop-app.' });
    return;
  }
  const input = registerSchema.parse(req.body);
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    res.status(409).json({ error: 'Er bestaat al een account met dit e-mailadres.' });
    return;
  }
  const passwordHash = await bcrypt.hash(input.password, 10);
  const user = await prisma.user.create({
    data: { email: input.email, name: input.name, passwordHash },
  });
  setSessionCookie(res, signSession({ sub: user.id, email: user.email }));
  res.status(201).json({ user: publicUser(user) });
});

authRouter.post('/login', rateLimit({ name: 'login', windowMs: 10 * 60_000, max: 30 }), async (req, res) => {
  if (env.desktopMode) {
    res.status(403).json({ error: 'Accounts zijn uitgeschakeld in de desktop-app.' });
    return;
  }
  const input = loginSchema.parse(req.body);
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  const valid = user ? await bcrypt.compare(input.password, user.passwordHash) : false;
  if (!user || !valid) {
    res.status(401).json({ error: 'E-mailadres of wachtwoord is onjuist.' });
    return;
  }
  setSessionCookie(res, signSession({ sub: user.id, email: user.email }));
  res.json({ user: publicUser(user) });
});

authRouter.post('/logout', (_req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

authRouter.get('/me', async (req, res) => {
  if (env.desktopMode) {
    res.json({ user: publicUser(await localUser()), desktop: true });
    return;
  }
  const token = req.cookies?.[SESSION_COOKIE] as string | undefined;
  if (!token) {
    res.json({ user: null, desktop: false });
    return;
  }
  const payload = verifySession(token);
  if (!payload) {
    clearSessionCookie(res);
    res.json({ user: null, desktop: false });
    return;
  }
  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user) {
    clearSessionCookie(res);
    res.json({ user: null, desktop: false });
    return;
  }
  res.json({ user: publicUser(user), desktop: false });
});
