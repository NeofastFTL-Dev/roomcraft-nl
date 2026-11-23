// Desktop mode: the app that ships as RoomCraft.exe is single-user and has no
// accounts. Every request belongs to one local user, created on first use.
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { prisma } from './db';

const LOCAL_EMAIL = 'lokaal@roomcraft.local';
const LOCAL_NAME = 'Lokale gebruiker';

export interface LocalUser {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
}

let cached: LocalUser | null = null;
let pending: Promise<LocalUser> | null = null;

/** The local desktop user, created on first use. */
export function localUser(): Promise<LocalUser> {
  if (cached) return Promise.resolve(cached);
  if (!pending) {
    pending = (async () => {
      let user = await prisma.user.findUnique({ where: { email: LOCAL_EMAIL } });
      if (!user) {
        user = await prisma.user.create({
          data: {
            email: LOCAL_EMAIL,
            name: LOCAL_NAME,
            // Nobody signs in: the hash only satisfies the schema.
            passwordHash: await bcrypt.hash(randomBytes(24).toString('hex'), 10),
          },
        });
      }
      cached = user;
      return user as LocalUser;
    })().catch((error: unknown) => {
      pending = null;
      throw error;
    });
  }
  return pending;
}
