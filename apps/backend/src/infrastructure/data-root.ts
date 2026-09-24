import { mkdir, readdir } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import { z } from 'zod';
import { configSchema } from '@dtr/shared';
import type { AppConfig, StorageStatus } from '@dtr/shared';
import type { ConfigurationRepository } from '../domain/ports.js';
import { AppError, conflict } from '../domain/errors.js';
import {
  accessible,
  atomicWrite,
  constants,
  decodeYaml,
  digest,
  encodeYaml,
  isInside,
  isMissing,
  readText,
  rejectSymlinks,
  safePath,
} from './filesystem.js';

import {
  detectLayout,
  standardLayout,
  StoragePathMapping,
  type StorageLayout,
} from './storage-paths.js';

export class DataRoot implements ConfigurationRepository {
  private current = '';
  private layout: StorageLayout = standardLayout;
  private readonly mapping: StoragePathMapping;
  constructor(
    private readonly runtime: string,
    private readonly initial: string,
    private readonly allowed: string,
    hostRoot?: string,
  ) {
    this.mapping = new StoragePathMapping(initial, hostRoot);
  }
  get registryDirectory(): string {
    return this.layout.registry;
  }
  get configDirectory(): string {
    return this.layout.config;
  }
  get apiRegistryDirectory(): string {
    return this.layout.api;
  }
  get path(): string {
    return this.current;
  }
  async initialize(): Promise<void> {
    const pointer = await safePath(this.runtime, 'data-root.yml');
    let root = this.initial;
    try {
      root = z
        .object({ data_root: z.string().min(1) })
        .strict()
        .parse(decodeYaml(await readText(pointer))).data_root;
    } catch (error) {
      if (!isMissing(error)) throw error;
    }
    await this.validatePath(root);
    this.layout = await this.prepare(root);
    this.current = resolve(root);
  }
  private async validatePath(path: string): Promise<void> {
    if (!isAbsolute(path) || !isInside(resolve(this.allowed), resolve(path)))
      throw new AppError(
        400,
        'UNSAFE_ROOT',
        `Le dossier doit être absolu et situé sous ${this.mapping.toDisplay(resolve(this.allowed))}. Avec Docker, ce dossier doit être monté dans le conteneur.`,
      );
    if (
      isInside(resolve(path), resolve(this.runtime)) ||
      isInside(resolve(this.runtime), resolve(path))
    )
      throw new AppError(
        400,
        'UNSAFE_ROOT',
        'Les dossiers de données et de bootstrap doivent être séparés',
      );
    await rejectSymlinks(path);
  }
  private async prepare(path: string): Promise<StorageLayout> {
    const layout = await detectLayout(path);
    for (const folder of [layout.config, `${layout.config}/backups`, layout.registry, layout.api])
      await mkdir(await safePath(path, folder), { recursive: true });
    for (const [file, content] of [
      ['application.yml', configSchema.parse({})],
      ['audit.yml', []],
    ] as const) {
      const destination = await safePath(path, layout.config, file);
      try {
        await readText(destination);
      } catch (error) {
        if (!isMissing(error)) throw error;
        await atomicWrite(destination, encodeYaml(content), true);
      }
    }
    configSchema.parse(
      decodeYaml(await readText(await safePath(path, layout.config, 'application.yml'))),
    );
    return layout;
  }
  async read(): Promise<{ config: AppConfig; etag: string }> {
    const raw = await readText(await safePath(this.current, this.layout.config, 'application.yml'));
    return { config: configSchema.parse(decodeYaml(raw)), etag: digest(raw) };
  }
  async write(config: AppConfig, etag: string): Promise<void> {
    if ((await this.read()).etag !== etag) throw conflict();
    await atomicWrite(
      await safePath(this.current, this.layout.config, 'application.yml'),
      encodeYaml(config),
    );
  }
  async status(path = this.current): Promise<StorageStatus> {
    path = this.mapping.toServer(path);
    await this.validatePath(path);
    const available = await accessible(path, constants.F_OK);
    const readable = await accessible(path, constants.R_OK);
    const writable = await accessible(path, constants.W_OK);
    let registryCount = 0;
    let apiRegistryCount = 0;
    if (readable) {
      const layout = await detectLayout(path);
      const walk = async (folder: string, api = false): Promise<void> => {
        for (const entry of await readdir(await safePath(path, folder), { withFileTypes: true })) {
          if (entry.isSymbolicLink()) continue;
          const child = `${folder}/${entry.name}`;
          if (entry.isDirectory()) {
            if (!api && child === layout.api) continue;
            await walk(child, api);
          } else if (entry.isFile() && /\.ya?ml$/i.test(entry.name)) {
            if (api) apiRegistryCount++;
            else registryCount++;
          }
        }
      };
      try {
        await walk(layout.registry);
        await walk(layout.api, true);
      } catch (error) {
        if (!isMissing(error)) throw error;
      }
    }
    const layout = await detectLayout(path);
    return {
      path: this.mapping.toDisplay(resolve(path)),
      serverPath: resolve(path),
      directories: layout,
      available,
      readable,
      writable,
      registryCount,
      apiRegistryCount,
    };
  }
  async changeRoot(path: string, mode: 'existing' | 'new'): Promise<void> {
    path = this.mapping.toServer(path);
    await this.validatePath(path);
    const destination = resolve(path);
    if (destination === this.current) return;
    if (isInside(this.current, destination) || isInside(destination, this.current))
      throw new AppError(
        400,
        'NESTED_ROOT',
        'Les dossiers de données ne doivent pas être imbriqués',
      );
    const exists = await accessible(destination, constants.F_OK);
    if (mode === 'new' && exists && (await readdir(destination)).length > 0)
      throw new AppError(
        409,
        'ROOT_EXISTS',
        'Le dossier doit être vide pour initialiser un nouveau stockage',
      );
    const layout = await detectLayout(destination);
    if (mode === 'existing') {
      if (!exists) throw new AppError(404, 'ROOT_MISSING', 'Dossier inexistant');
      configSchema.parse(
        decodeYaml(await readText(await safePath(destination, layout.config, 'application.yml'))),
      );
      await readdir(await safePath(destination, layout.registry));
    }
    await this.prepare(destination);
    if (!(await accessible(destination, constants.W_OK)))
      throw new AppError(400, 'ROOT_NOT_WRITABLE', 'Dossier non accessible en écriture');
    await atomicWrite(
      await safePath(this.runtime, 'data-root.yml'),
      encodeYaml({ data_root: destination }),
    );
    this.current = destination;
    this.layout = layout;
  }
}
