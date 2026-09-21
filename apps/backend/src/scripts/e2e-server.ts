import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import argon2 from 'argon2';
import { buildApp } from '../app.js';
import { environmentSchema } from '../config/environment.js';
const root = await mkdtemp(join(tmpdir(), 'dtr-e2e-'));
const env = environmentSchema.parse({
  NODE_ENV: 'test',
  DTR_PORT: 8087,
  DTR_HOST: '127.0.0.1',
  DTR_ADMIN_PASSWORD_HASH: await argon2.hash('e2e-test-password', { type: argon2.argon2id }),
  DTR_SESSION_SECRET: 'temporary-test-session-secret-32-characters',
  DTR_DATA_ROOT: join(root, 'data', 'registry'),
  DTR_ALLOWED_DATA_PARENT: join(root, 'data'),
  DTR_RUNTIME_DIR: join(root, 'runtime'),
  DTR_LOG_LEVEL: 'silent',
});
const app = await buildApp(env);
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.once(signal, () => {
    void app.close().then(() => rm(root, { recursive: true, force: true }));
  });
await app.listen({ port: env.DTR_PORT, host: env.DTR_HOST });
