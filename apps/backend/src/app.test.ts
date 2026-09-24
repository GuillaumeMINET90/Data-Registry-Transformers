import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, readdir, rm, writeFile, symlink, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import argon2 from 'argon2';
import type { FastifyInstance } from 'fastify';
import { newRegistry, simpleRegistrySchema } from '@dtr/shared';
import type {
  ApiRegistryList,
  ApiRegistryRecord,
  ConfigResponse,
  RegistryRecord,
  RegistryList,
} from '@dtr/shared';
import { buildApp } from './app.js';
import { environmentSchema, type Environment } from './config/environment.js';
import { decodeYaml } from './infrastructure/filesystem.js';

describe('API et persistance YAML', () => {
  let directory: string;
  let app: FastifyInstance;
  let env: Environment;
  let cookie: string;
  let csrf: string;
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'dtr-test-'));
    env = environmentSchema.parse({
      NODE_ENV: 'test',
      DTR_ADMIN_PASSWORD_HASH: await argon2.hash('test-password', {
        type: argon2.argon2id,
        memoryCost: 8192,
        timeCost: 1,
      }),
      DTR_SESSION_SECRET: 'test-only-secret-with-at-least-32-characters',
      DTR_DATA_ROOT: join(directory, 'data', 'first'),
      DTR_ALLOWED_DATA_PARENT: join(directory, 'data'),
      DTR_RUNTIME_DIR: join(directory, 'runtime'),
      DTR_PUBLIC_DIR: join(directory, 'public'),
      DTR_LOG_LEVEL: 'silent',
    });
    app = await buildApp(env);
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { 'x-dtr-client': 'web' },
      payload: { username: 'admin', password: 'test-password' },
    });
    expect(login.statusCode).toBe(200);
    cookie = login.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
    csrf = login.json<{ csrf: string }>().csrf;
  });
  afterEach(async () => {
    await app.close();
    await rm(directory, { recursive: true, force: true });
  });
  const auth = () => ({ cookie, 'x-csrf-token': csrf });
  it('enregistre le contrat simplifié sans ajouter de blocs, puis le relit, modifie et clone', async () => {
    const example = decodeYaml(
      await readFile('examples/synthese_indicateur_financier.yml', 'utf8'),
    ) as Record<string, unknown>;
    // Le YAML écrit est le contrat normalisé : statut et valeurs par défaut explicites.
    const expected = simpleRegistrySchema.parse(example);
    const preview = await app.inject({
      method: 'POST',
      url: '/api/registries/preview',
      headers: auth(),
      payload: { document: example },
    });
    expect(preview.statusCode, preview.body).toBe(200);
    const prepared = preview.json<RegistryRecord & { token: string }>();
    expect(decodeYaml(prepared.yaml)).toEqual(expected);
    const response = await app.inject({
      method: 'POST',
      url: '/api/registries',
      headers: { ...auth(), 'x-preview-token': prepared.token },
      payload: prepared.document,
    });
    expect(response.statusCode, response.body).toBe(201);
    const created = response.json<RegistryRecord>();
    expect(created.yaml).toBe(prepared.yaml);
    expect(
      decodeYaml(await readFile(join(env.DTR_DATA_ROOT, 'registry', created.path), 'utf8')),
    ).toEqual(expected);
    const loaded = await app.inject({ url: `/api/registries/${example.id}`, headers: auth() });
    expect(loaded.statusCode).toBe(200);
    expect(loaded.json<RegistryRecord>().document).toEqual(created.document);
    const updated = await app.inject({
      method: 'PUT',
      url: `/api/registries/${example.id}`,
      headers: { ...auth(), 'if-match': created.etag },
      payload: { ...example, context: 'Contexte modifié' },
    });
    expect(updated.statusCode, updated.body).toBe(200);
    expect(decodeYaml(updated.json<RegistryRecord>().yaml)).toEqual({
      ...expected,
      context: 'Contexte modifié',
    });
    const clone = await app.inject({
      method: 'POST',
      url: `/api/registries/${example.id}/clone`,
      headers: auth(),
      payload: { id: 'hse_copie', name: 'Copie', department: 'hse', version: '1.0.0' },
    });
    expect(clone.statusCode, clone.body).toBe(201);
    expect(decodeYaml(clone.json<RegistryRecord>().yaml)).toEqual({
      ...expected,
      status: 'draft',
      service: 'hse',
      id: 'hse_copie',
      name: 'Copie',
      context: 'Contexte modifié',
    });
    const invalid = await app.inject({
      method: 'POST',
      url: '/api/registries',
      headers: auth(),
      payload: { ...example, version: '1.0.0' },
    });
    expect(invalid.statusCode).toBe(422);
  });
  async function create() {
    const response = await app.inject({
      method: 'POST',
      url: '/api/registries',
      headers: auth(),
      payload: newRegistry(),
    });
    expect(response.statusCode, response.body).toBe(201);
    return response.json<RegistryRecord>();
  }
  it('gère les registres API dans registry/api sans polluer les registres documentaires', async () => {
    const document = {
      applications: {
        'LEUL WMS': {
          collections: ['LEUL-WMS', 'LEUL-COMMUN'],
          api: { openapi: 'http://leul-wms/api/openapi/v1.json' },
          endpoint_acces: [
            {
              id: 'wms_get_palette',
              description: 'Retrouver une palette.',
              usages: ["palettes d'une commande"],
            },
            {
              id: 'wms_get_stock',
              description: 'Consulter le stock.',
              usages: ['stock disponible'],
            },
          ],
          tools: ['sql_inspection', 'sql_executor'],
        },
      },
    };
    const preview = await app.inject({
      method: 'POST',
      url: '/api/api-registries/preview',
      headers: auth(),
      payload: { document },
    });
    expect(preview.statusCode, preview.body).toBe(200);
    expect(decodeYaml(preview.json<{ yaml: string }>().yaml)).toEqual(document);
    const response = await app.inject({
      method: 'POST',
      url: '/api/api-registries',
      headers: auth(),
      payload: { document },
    });
    expect(response.statusCode, response.body).toBe(201);
    const created = response.json<ApiRegistryRecord>();
    expect(created.id).toBe('leul_wms');
    expect(created.path).toBe('leul-wms.yml');
    expect(
      decodeYaml(await readFile(join(env.DTR_DATA_ROOT, 'registry', 'api', created.path), 'utf8')),
    ).toEqual(document);
    const apiList = await app.inject({ url: '/api/api-registries', headers: auth() });
    expect(apiList.json<ApiRegistryList>().items).toHaveLength(1);
    const endpointSearch = await app.inject({
      url: '/api/api-registries?search=stock%20disponible',
      headers: auth(),
    });
    expect(endpointSearch.json<ApiRegistryList>().items).toHaveLength(1);
    const registryList = await app.inject({ url: '/api/registries', headers: auth() });
    expect(registryList.json<RegistryList>().invalid).toHaveLength(0);
    expect(registryList.json<RegistryList>().total).toBe(0);

    const changed = structuredClone(document);
    changed.applications['LEUL WMS'].endpoint_acces.push({
      id: 'wms_get_colis',
      description: 'Retrouver un colis.',
      usages: ["colis d'une commande"],
    });
    const updated = await app.inject({
      method: 'PUT',
      url: '/api/api-registries/leul_wms',
      headers: { ...auth(), 'if-match': created.etag },
      payload: changed,
    });
    expect(updated.statusCode, updated.body).toBe(200);
    expect(updated.json<ApiRegistryRecord>().document).toEqual(changed);
    expect(
      await readdir(join(env.DTR_DATA_ROOT, 'config', 'backups', 'api', 'leul_wms')),
    ).toHaveLength(1);

    const deleted = await app.inject({
      method: 'DELETE',
      url: '/api/api-registries/leul_wms',
      headers: { ...auth(), 'if-match': updated.json<ApiRegistryRecord>().etag },
    });
    expect(deleted.statusCode).toBe(204);
  });

  it('refuse un tool API absent des options configurées', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/api-registries',
      headers: auth(),
      payload: {
        document: {
          applications: {
            APP: { collections: [], endpoint_acces: [], tools: ['shell_root'] },
          },
        },
      },
    });
    expect(response.statusCode).toBe(422);
    expect(response.body).toContain('Configuration');
  });
  it('accepte le mot de passe direct sans le persister ni l’exposer', async () => {
    const password = '  Long direct password $ with spaces  ';
    await app.close();
    app = await buildApp({
      ...env,
      DTR_ADMIN_PASSWORD_HASH: undefined,
      DTR_ADMIN_PASSWORD: password,
    });
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { 'x-dtr-client': 'web' },
      payload: { username: 'admin', password },
    });
    expect(response.statusCode).toBe(200);
    expect(response.body).not.toContain(password);
    cookie = response.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
    csrf = response.json<{ csrf: string }>().csrf;
    const created = await create();
    expect(created.yaml).not.toContain(password);
    const config = await app.inject({ url: '/api/config', headers: auth() });
    expect(config.body).not.toContain(password);
    expect(config.body).not.toContain('DTR_ADMIN_PASSWORD');
    for (const file of ['application.yml', 'audit.yml']) {
      expect(await readFile(join(env.DTR_DATA_ROOT, 'config', file), 'utf8')).not.toContain(
        password,
      );
    }
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/auth/login',
          headers: { 'x-dtr-client': 'web' },
          payload: { username: 'admin', password: 'wrong-password' },
        })
      ).statusCode,
    ).toBe(401);
  });
  it('crée, lit, modifie, sauvegarde, clone et supprime un fichier physique', async () => {
    const created = await create();
    const path = join(env.DTR_DATA_ROOT, 'registry', created.path);
    expect(await readFile(path, 'utf8')).toBe(created.yaml);
    expect(
      (
        await app.inject({
          url: `/api/registries/${created.document.registry.id}`,
          headers: auth(),
        })
      ).json<RegistryRecord>().etag,
    ).toBe(created.etag);
    created.document.registry.name = 'Modifié';
    const updated = await app.inject({
      method: 'PUT',
      url: '/api/registries/nouveau_registry',
      headers: { ...auth(), 'if-match': created.etag },
      payload: created.document,
    });
    expect(updated.statusCode, updated.body).toBe(200);
    expect((await readdir(join(env.DTR_DATA_ROOT, 'config/backups/nouveau_registry'))).length).toBe(
      1,
    );
    const cloned = await app.inject({
      method: 'POST',
      url: '/api/registries/nouveau_registry/clone',
      headers: auth(),
      payload: { id: 'clone_registry', name: 'Clone', department: 'autre', version: '2.0.0' },
    });
    expect(cloned.statusCode).toBe(201);
    expect(cloned.json<RegistryRecord>().document.metadata?.cloned_from).toBe('nouveau_registry');
    const deleted = await app.inject({
      method: 'DELETE',
      url: '/api/registries/nouveau_registry',
      headers: { ...auth(), 'if-match': updated.json<RegistryRecord>().etag },
    });
    expect(deleted.statusCode).toBe(204);
    await expect(readFile(path)).rejects.toThrow();
    expect(await readFile(join(env.DTR_DATA_ROOT, 'config/audit.yml'), 'utf8')).toContain('CLONE');
  });
  it('refuse les doublons et les accès sans session ou sans CSRF', async () => {
    await create();
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/registries',
          headers: auth(),
          payload: newRegistry(),
        })
      ).statusCode,
    ).toBe(409);
    expect((await app.inject({ url: '/api/registries' })).statusCode).toBe(401);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/registries',
          headers: { cookie },
          payload: newRegistry(),
        })
      ).statusCode,
    ).toBe(403);
  });
  it('enregistre exactement le YAML prévisualisé et refuse un aperçu altéré', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/registries/preview',
      headers: auth(),
      payload: { document: newRegistry() },
    });
    expect(response.statusCode, response.body).toBe(200);
    const preview = response.json<{
      document: RegistryRecord['document'];
      yaml: string;
      token: string;
    }>();
    const created = await app.inject({
      method: 'POST',
      url: '/api/registries',
      headers: { ...auth(), 'x-preview-token': preview.token },
      payload: preview.document,
    });
    expect(created.statusCode, created.body).toBe(201);
    expect(created.json<RegistryRecord>().yaml).toBe(preview.yaml);
    preview.document.registry.name = 'Altéré';
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/registries',
          headers: { ...auth(), 'x-preview-token': preview.token },
          payload: preview.document,
        })
      ).statusCode,
    ).toBe(409);
  });
  it('refuse les identifiants dangereux et les références invalides', async () => {
    const doc = newRegistry();
    doc.registry.id = '../../secret';
    expect(
      (await app.inject({ method: 'POST', url: '/api/registries', headers: auth(), payload: doc }))
        .statusCode,
    ).toBe(422);
    doc.registry.id = 'valid';
    doc.rag.exact_fields = ['missing'];
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/registries/validate',
          headers: auth(),
          payload: doc,
        })
      ).statusCode,
    ).toBe(422);
  });
  it('détecte les modifications manuelles, conflits et YAML invalides', async () => {
    const created = await create();
    const path = join(env.DTR_DATA_ROOT, 'registry', created.path);
    await writeFile(path, created.yaml.replace('Nouveau Registre', 'Édition externe'));
    const read = await app.inject({ url: '/api/registries/nouveau_registry', headers: auth() });
    expect(read.json<RegistryRecord>().document.registry.name).toBe('Édition externe');
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: '/api/registries/nouveau_registry',
          headers: { ...auth(), 'if-match': created.etag },
          payload: created.document,
        })
      ).statusCode,
    ).toBe(409);
    await writeFile(path, 'registry: [broken');
    await app.inject({ url: '/api/registries/nouveau_registry', headers: auth() });
    const list = await app.inject({ url: '/api/registries', headers: auth() });
    expect(list.json<RegistryList>().invalid).toHaveLength(1);
    expect((await app.inject('/health')).statusCode).toBe(200);
  });
  it('sérialise deux écritures concurrentes', async () => {
    const created = await create();
    const responses = await Promise.all(
      ['A', 'B'].map((name) =>
        app.inject({
          method: 'PUT',
          url: '/api/registries/nouveau_registry',
          headers: { ...auth(), 'if-match': created.etag },
          payload: { ...created.document, registry: { ...created.document.registry, name } },
        }),
      ),
    );
    expect(responses.map((r) => r.statusCode).sort()).toEqual([200, 409]);
  });
  it('persiste le bootstrap et conserve l’ancien dossier', async () => {
    const created = await create();
    const destination = join(directory, 'data', 'second');
    const response = await app.inject({
      method: 'POST',
      url: '/api/config/data-root/change',
      headers: auth(),
      payload: { path: destination, mode: 'new' },
    });
    expect(response.statusCode, response.body).toBe(200);
    expect(await readFile(join(env.DTR_DATA_ROOT, 'registry', created.path), 'utf8')).toBe(
      created.yaml,
    );
    await app.close();
    app = await buildApp(env);
    expect((await app.inject('/health')).json<{ registryCount: number }>().registryCount).toBe(0);
    expect(await readFile(join(directory, 'runtime/data-root.yml'), 'utf8')).toContain('second');
  });
  it('protège le changement de configuration avec ETag et ne divulgue aucun secret', async () => {
    const response = await app.inject({ url: '/api/config', headers: auth() });
    const data = response.json<ConfigResponse>();
    expect(response.body).not.toContain(env.DTR_SESSION_SECRET);
    expect(response.body).not.toContain('argon2');
    data.config.application_name = 'Test';
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: '/api/config',
          headers: { ...auth(), 'if-match': data.etag },
          payload: data.config,
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: '/api/config',
          headers: { ...auth(), 'if-match': data.etag },
          payload: data.config,
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/config/data-root/change',
          headers: auth(),
          payload: { path: join(directory, 'outside'), mode: 'new' },
        })
      ).statusCode,
    ).toBe(400);
  });
  it('refuse les jonctions sortant du stockage', async () => {
    const outside = join(directory, 'outside');
    await mkdir(outside);
    await symlink(
      outside,
      join(env.DTR_DATA_ROOT, 'registry', 'external'),
      process.platform === 'win32' ? 'junction' : 'dir',
    );
    const list = await app.inject({ url: '/api/registries', headers: auth() });
    expect(list.json<RegistryList>().invalid[0]?.error).toContain('symbolique');
  });
  it('révoque la session à la déconnexion et limite les tentatives', async () => {
    expect(
      (await app.inject({ method: 'POST', url: '/api/auth/logout', headers: auth(), payload: {} }))
        .statusCode,
    ).toBe(200);
    expect((await app.inject({ url: '/api/auth/me', headers: auth() })).statusCode).toBe(401);
    let status = 0;
    for (let i = 0; i < 6; i++)
      status = (
        await app.inject({
          method: 'POST',
          url: '/api/auth/login',
          headers: { 'x-dtr-client': 'web' },
          payload: { username: 'admin', password: 'wrong' },
        })
      ).statusCode;
    expect(status).toBe(429);
  });
});
