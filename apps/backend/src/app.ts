import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { access } from 'node:fs/promises';
import { z } from 'zod';
import { AppError } from './domain/errors.js';
import type { Environment } from './config/environment.js';
import { DataRoot } from './infrastructure/data-root.js';
import { YamlRegistryRepository } from './infrastructure/yaml-registry-repository.js';
import { YamlApiRegistryRepository } from './infrastructure/yaml-api-registry-repository.js';
import { YamlAuditLog } from './infrastructure/yaml-audit.js';
import { SerialUnitOfWork } from './infrastructure/mutex.js';
import { AuthService } from './infrastructure/auth.js';
import { resolveAdminPasswordHash } from './infrastructure/admin-credentials.js';
import { ConfigurationService, RegistryService } from './application/registry-service.js';
import { ApiRegistryService } from './application/api-registry-service.js';
import { registerRoutes } from './http/routes.js';
export async function buildApp(env: Environment) {
  const passwordHash = await resolveAdminPasswordHash(env);
  const app = Fastify({
    logger:
      env.DTR_LOG_LEVEL === 'silent'
        ? false
        : {
            level: env.DTR_LOG_LEVEL,
            redact: [
              'req.headers.cookie',
              'req.headers.authorization',
              'req.headers["x-csrf-token"]',
              'res.headers["set-cookie"]',
            ],
          },
    bodyLimit: 2 * 1024 * 1024,
    trustProxy: false,
  });
  const root = new DataRoot(
    env.DTR_RUNTIME_DIR,
    env.DTR_DATA_ROOT,
    env.DTR_ALLOWED_DATA_PARENT,
    env.DTR_HOST_DATA_ROOT,
  );
  await root.initialize();
  const transaction = new SerialUnitOfWork();
  const repository = new YamlRegistryRepository(root);
  const apiRepository = new YamlApiRegistryRepository(root);
  const audit = new YamlAuditLog(root);
  const clock = { now: () => new Date().toISOString() };
  const registries = new RegistryService(repository, root, audit, transaction, clock);
  const apiRegistries = new ApiRegistryService(apiRepository, root, audit, transaction, clock);
  const configuration = new ConfigurationService(root, audit, transaction, clock);
  await app.register(cookie, { secret: env.DTR_SESSION_SECRET });
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: env.DTR_COOKIE_SECURE ? [] : null,
      },
    },
  });
  await app.register(rateLimit, { max: 300, timeWindow: '1 minute' });
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof z.ZodError)
      return reply.code(422).send({
        code: 'VALIDATION',
        message: 'Certains champs sont invalides',
        issues: error.issues.map((issue) => ({ path: issue.path, message: issue.message })),
      });
    if (error instanceof AppError)
      return reply.code(error.status).send({ code: error.code, message: error.message });
    if (
      error instanceof Error &&
      'statusCode' in error &&
      typeof error.statusCode === 'number' &&
      error.statusCode < 500
    )
      return reply.code(error.statusCode).send({
        code: 'REQUEST_ERROR',
        message:
          error.statusCode === 429
            ? 'Trop de tentatives. Réessayez dans une minute.'
            : error.message,
      });
    request.log.error({ err: error }, 'Request failed');
    return reply
      .code(500)
      .send({ code: 'INTERNAL', message: 'Opération impossible. Consultez les journaux serveur.' });
  });
  await registerRoutes(app, {
    registries,
    apiRegistries,
    configuration,
    auth: new AuthService(env.DTR_ADMIN_USERNAME, passwordHash, env.DTR_SESSION_TTL_SECONDS),
    env,
  });
  let serveStatic = false;
  try {
    await access(`${env.DTR_PUBLIC_DIR}/index.html`);
    serveStatic = true;
  } catch {
    if (env.NODE_ENV === 'production') throw new Error('Frontend compilé introuvable');
  }
  if (serveStatic) await app.register(fastifyStatic, { root: env.DTR_PUBLIC_DIR, prefix: '/' });
  app.setNotFoundHandler((request, reply) => {
    if (
      serveStatic &&
      request.method === 'GET' &&
      !request.url.startsWith('/api') &&
      !request.url.split('?')[0]!.includes('.')
    )
      return reply.type('text/html').sendFile('index.html');
    return reply.code(404).send({ code: 'NOT_FOUND', message: 'Route introuvable' });
  });
  app.addHook('onClose', async () => {
    await transaction.run(async () => undefined);
  });
  return app;
}
