import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  identifier,
  rootChangeSchema,
  version,
  stringifyYaml,
  registryYamlDocument,
} from '@dtr/shared';
import type { RegistryService, ConfigurationService } from '../application/registry-service.js';
import type { ApiRegistryService } from '../application/api-registry-service.js';
import { requireEtag } from '../application/registry-service.js';
import type { AuthService, Session } from '../infrastructure/auth.js';
import type { Environment } from '../config/environment.js';
import { AppError } from '../domain/errors.js';
declare module 'fastify' {
  interface FastifyRequest {
    admin: Session | null;
    sessionToken: string | null;
  }
}
interface Dependencies {
  registries: RegistryService;
  apiRegistries: ApiRegistryService;
  configuration: ConfigurationService;
  auth: AuthService;
  env: Environment;
}
export async function registerRoutes(
  app: FastifyInstance,
  { registries, apiRegistries, configuration, auth, env }: Dependencies,
): Promise<void> {
  app.decorateRequest('admin', null);
  app.decorateRequest('sessionToken', null);
  app.addHook('onRequest', async (request, reply) => {
    if (!request.url.startsWith('/api/')) return;
    reply.header('Cache-Control', 'no-store');
    if (request.url.split('?')[0] === '/api/auth/login' && request.method === 'POST') {
      if (request.headers['x-dtr-client'] !== 'web')
        throw new AppError(403, 'CSRF', 'En-tête de sécurité obligatoire');
      return;
    }
    const cookie = request.cookies.dtr_session;
    const unsigned = cookie ? request.unsignCookie(cookie) : undefined;
    const token = unsigned?.valid ? (unsigned.value ?? undefined) : undefined;
    request.admin = auth.get(token);
    request.sessionToken = token!;
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method))
      auth.verifyCsrf(request.admin, request.headers['x-csrf-token']);
  });
  const cookieOptions = {
    path: '/',
    httpOnly: true,
    sameSite: 'strict' as const,
    secure: env.DTR_COOKIE_SECURE,
    signed: true,
    maxAge: env.DTR_SESSION_TTL_SECONDS,
  };
  const user = (request: FastifyRequest) => request.admin!.username;
  const id = (request: FastifyRequest) => z.object({ id: identifier }).parse(request.params).id;
  app.post(
    '/api/auth/login',
    { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const input = z
        .object({ username: z.string().min(1).max(100), password: z.string().min(1).max(1024) })
        .strict()
        .parse(request.body);
      const { token, session } = await auth.login(input.username, input.password);
      const oldCookie = request.cookies.dtr_session;
      if (oldCookie) {
        const old = request.unsignCookie(oldCookie);
        if (old.valid && old.value) auth.logout(old.value);
      }
      reply.setCookie('dtr_session', token, cookieOptions);
      request.log.info({ event: 'LOGIN' }, 'Administrator login');
      return { username: session.username, csrf: session.csrf };
    },
  );
  app.get('/api/auth/me', async (request) => ({
    username: user(request),
    csrf: request.admin!.csrf,
  }));
  app.post('/api/auth/logout', async (request, reply) => {
    auth.logout(request.sessionToken!);
    reply.clearCookie('dtr_session', { path: '/' });
    return { ok: true };
  });
  app.get('/api/config', async () => ({
    ...(await configuration.get()),
    security: {
      session_ttl_seconds: env.DTR_SESSION_TTL_SECONDS,
      cookie_secure: env.DTR_COOKIE_SECURE,
    },
  }));
  app.put('/api/config', async (request) =>
    configuration.update(request.body, requireEtag(request.headers['if-match']), user(request)),
  );
  app.post('/api/config/data-root/test', async (request) =>
    configuration.test(
      z
        .object({ path: z.string().min(1).max(1000) })
        .strict()
        .parse(request.body).path,
    ),
  );
  app.post('/api/config/data-root/change', async (request) => {
    const input = rootChangeSchema.parse(request.body);
    return configuration.changeRoot(input.path, input.mode, user(request));
  });
  app.get('/api/api-registries', async (request) => {
    const query = z.object({ search: z.string().max(200).default('') }).parse(request.query);
    return apiRegistries.list(query.search);
  });
  app.post('/api/api-registries/preview', async (request) => {
    const input = z.object({ document: z.unknown() }).strict().parse(request.body);
    const result = await apiRegistries.preview(input.document);
    return { ...result, yaml: stringifyYaml(result.document, { lineWidth: 100 }) };
  });
  app.post('/api/api-registries', async (request, reply) => {
    const input = z.object({ document: z.unknown() }).strict().parse(request.body);
    const result = await apiRegistries.create(input.document, user(request));
    request.log.info({ event: 'API_CREATE', registry: result.id });
    return reply.code(201).send(result);
  });
  app.get('/api/api-registries/:id', async (request, reply) => {
    const result = await apiRegistries.get(id(request));
    reply.header('ETag', `"${result.etag}"`);
    return result;
  });
  app.put('/api/api-registries/:id', async (request) =>
    apiRegistries.update(
      id(request),
      request.body,
      requireEtag(request.headers['if-match']),
      user(request),
    ),
  );
  app.delete('/api/api-registries/:id', async (request, reply) => {
    await apiRegistries.delete(
      id(request),
      requireEtag(request.headers['if-match']),
      user(request),
    );
    return reply.code(204).send();
  });
  for (const endpoint of ['yaml', 'download'])
    app.get(`/api/api-registries/:id/${endpoint}`, async (request, reply) => {
      const result = await apiRegistries.get(id(request));
      reply.type('application/yaml; charset=utf-8');
      if (endpoint === 'download')
        reply.header(
          'Content-Disposition',
          `attachment; filename="${result.id.replaceAll('_', '-')}.yml"`,
        );
      return result.yaml;
    });
  app.get('/api/registries', async (request) =>
    registries.list(
      z
        .object({
          search: z.string().max(200).optional(),
          department: z.string().optional(),
          family: z.string().optional(),
          status: z.enum(['draft', 'active', 'deprecated']).optional(),
          format: z.string().optional(),
          tag: z.string().optional(),
          sort: z.enum(['name', 'department', 'updated_at']).optional(),
          direction: z.enum(['asc', 'desc']).optional(),
          page: z.coerce.number().int().min(1).default(1),
          pageSize: z.coerce.number().int().min(1).max(100).default(20),
        })
        .parse(request.query),
    ),
  );
  app.post('/api/registries/validate', async (request) => ({
    document: await registries.validate(request.body),
  }));
  app.post('/api/registries/preview', async (request) => {
    const input = z
      .object({ document: z.unknown(), id: identifier.optional() })
      .strict()
      .parse(request.body);
    const result = await registries.preview(input.document, user(request), input.id);
    return {
      ...result,
      yaml: stringifyYaml(registryYamlDocument(result.document), { lineWidth: 100 }),
    };
  });
  const previewToken = (request: FastifyRequest) =>
    z.string().max(100).optional().parse(request.headers['x-preview-token']);
  app.post('/api/registries', async (request, reply) => {
    const result = await registries.create(request.body, user(request), previewToken(request));
    request.log.info({ event: 'CREATE', registry: result.document.registry.id });
    return reply.code(201).send(result);
  });
  app.get('/api/registries/:id', async (request, reply) => {
    const result = await registries.get(id(request));
    reply.header('ETag', `"${result.etag}"`);
    return result;
  });
  app.put('/api/registries/:id', async (request) =>
    registries.update(
      id(request),
      request.body,
      requireEtag(request.headers['if-match']),
      user(request),
      previewToken(request),
    ),
  );
  app.delete('/api/registries/:id', async (request, reply) => {
    await registries.delete(id(request), requireEtag(request.headers['if-match']), user(request));
    return reply.code(204).send();
  });
  app.post('/api/registries/:id/clone', async (request, reply) => {
    const input = z
      .object({
        id: identifier,
        name: z.string().trim().min(1).max(200),
        department: z.string().trim().min(1).max(100),
        version,
      })
      .strict()
      .parse(request.body);
    return reply.code(201).send(await registries.clone(id(request), input, user(request)));
  });
  for (const endpoint of ['yaml', 'download'])
    app.get(`/api/registries/:id/${endpoint}`, async (request, reply) => {
      const result = await registries.get(id(request));
      reply.type('application/yaml; charset=utf-8');
      if (endpoint === 'download')
        reply.header(
          'Content-Disposition',
          `attachment; filename="${result.document.registry.id.replaceAll('_', '-')}.yml"`,
        );
      return result.yaml;
    });
  app.get('/health', async (_request, reply) => {
    try {
      const { storage } = await configuration.get();
      const list = await registries.list({ pageSize: 1 });
      const apiList = await apiRegistries.list();
      const ok = storage.readable && storage.writable;
      return reply.code(ok ? 200 : 503).send({
        status: ok ? 'ok' : 'error',
        dataRootAccessible: ok,
        registryCount: list.stats.total,
        invalidCount: list.invalid.length,
        apiRegistryCount: apiList.total,
        apiInvalidCount: apiList.invalid.length,
      });
    } catch {
      return reply.code(503).send({
        status: 'error',
        dataRootAccessible: false,
        registryCount: 0,
        apiRegistryCount: 0,
      });
    }
  });
}
