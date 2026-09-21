import { randomBytes, timingSafeEqual } from 'node:crypto';
import argon2 from 'argon2';
import { AppError } from '../domain/errors.js';
export interface Session {
  username: string;
  csrf: string;
  expires: number;
}
export class AuthService {
  private readonly sessions = new Map<string, Session>();
  constructor(
    private readonly username: string,
    private readonly passwordHash: string,
    private readonly ttl: number,
  ) {}
  async login(username: string, password: string): Promise<{ token: string; session: Session }> {
    const correct = await argon2.verify(this.passwordHash, password);
    if (!correct || username !== this.username)
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Identifiants incorrects');
    this.prune();
    if (this.sessions.size >= 100) this.sessions.delete(this.sessions.keys().next().value!);
    const token = randomBytes(32).toString('hex');
    const session = {
      username,
      csrf: randomBytes(32).toString('hex'),
      expires: Date.now() + this.ttl * 1000,
    };
    this.sessions.set(token, session);
    return { token, session };
  }
  private prune() {
    for (const [token, session] of this.sessions)
      if (session.expires <= Date.now()) this.sessions.delete(token);
  }
  get(token: string | undefined): Session {
    this.prune();
    const session = token ? this.sessions.get(token) : undefined;
    if (!session) throw new AppError(401, 'UNAUTHENTICATED', 'Veuillez vous connecter');
    return session;
  }
  logout(token: string): void {
    this.sessions.delete(token);
  }
  verifyCsrf(session: Session, csrf: unknown): void {
    if (
      typeof csrf !== 'string' ||
      !/^[a-f0-9]{64}$/.test(csrf) ||
      !timingSafeEqual(Buffer.from(csrf), Buffer.from(session.csrf))
    )
      throw new AppError(403, 'CSRF', 'Jeton de sécurité invalide. Rechargez la page.');
  }
}
