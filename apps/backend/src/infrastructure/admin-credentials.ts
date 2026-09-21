import argon2 from 'argon2';
import type { Environment } from '../config/environment.js';

export async function resolveAdminPasswordHash(
  credentials: Pick<Environment, 'DTR_ADMIN_PASSWORD' | 'DTR_ADMIN_PASSWORD_HASH'>,
): Promise<string> {
  if (credentials.DTR_ADMIN_PASSWORD) {
    return argon2.hash(credentials.DTR_ADMIN_PASSWORD, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 1,
    });
  }
  if (credentials.DTR_ADMIN_PASSWORD_HASH) return credentials.DTR_ADMIN_PASSWORD_HASH;
  throw new Error('Identifiants administrateur manquants');
}
