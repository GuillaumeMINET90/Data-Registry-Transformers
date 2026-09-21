import { describe, expect, it } from 'vitest';
import { environmentSchema } from './environment.js';

const base = { DTR_SESSION_SECRET: 'test-only-session-secret-at-least-32-characters' };
describe('identifiants de démarrage', () => {
  it('accepte un mot de passe long et un hash laissé vide', () => {
    const password = '  Long password $ with spaces  ';
    const env = environmentSchema.parse({
      ...base,
      DTR_ADMIN_PASSWORD: password,
      DTR_ADMIN_PASSWORD_HASH: '',
    });
    expect(env.DTR_ADMIN_PASSWORD).toBe(password);
    expect(env.DTR_ADMIN_PASSWORD_HASH).toBeUndefined();
  });
  it('conserve la compatibilité avec un hash seul', () => {
    expect(
      environmentSchema.safeParse({
        ...base,
        DTR_ADMIN_PASSWORD: '',
        DTR_ADMIN_PASSWORD_HASH: '$argon2id$v=19$example',
      }).success,
    ).toBe(true);
  });
  it('refuse un mot de passe court ou absent', () => {
    expect(environmentSchema.safeParse({ ...base, DTR_ADMIN_PASSWORD: 'short' }).success).toBe(
      false,
    );
    expect(environmentSchema.safeParse(base).success).toBe(false);
  });
  it('refuse une configuration ambiguë', () => {
    expect(
      environmentSchema.safeParse({
        ...base,
        DTR_ADMIN_PASSWORD: 'long-test-password',
        DTR_ADMIN_PASSWORD_HASH: '$argon2id$v=19$example',
      }).success,
    ).toBe(false);
  });
});
