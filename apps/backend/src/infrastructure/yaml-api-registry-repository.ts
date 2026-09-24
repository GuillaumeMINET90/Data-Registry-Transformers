import { readdir, stat, unlink } from 'node:fs/promises';
import { basename, relative } from 'node:path';
import { apiRegistrySchema, identifier, normalizeId } from '@dtr/shared';
import type { ApiRegistry, ApiRegistryRecord, AppConfig, InvalidFile } from '@dtr/shared';
import type { ApiRegistryRepository } from '../domain/ports.js';
import { AppError, conflict } from '../domain/errors.js';
import {
  atomicWrite,
  decodeYaml,
  digest,
  encodeYaml,
  isMissing,
  readText,
  safePath,
} from './filesystem.js';
import type { DataRoot } from './data-root.js';

interface ApiCatalog {
  items: ApiRegistryRecord[];
  invalid: InvalidFile[];
}

export class YamlApiRegistryRepository implements ApiRegistryRepository {
  private cache?: { root: string; expires: number; catalog: ApiCatalog };

  constructor(
    private readonly root: DataRoot,
    private readonly cacheMs = 3000,
  ) {}

  async scan(force = false): Promise<ApiCatalog> {
    if (!force && this.cache?.root === this.root.path && this.cache.expires > Date.now())
      return structuredClone(this.cache.catalog);
    const catalog: ApiCatalog = { items: [], invalid: [] };
    const walk = async (folder: string): Promise<void> => {
      for (const entry of await readdir(await safePath(this.root.path, folder), {
        withFileTypes: true,
      })) {
        const path = `${folder}/${entry.name}`;
        const relativePath = path.slice(this.root.apiRegistryDirectory.length + 1);
        if (entry.isSymbolicLink()) {
          catalog.invalid.push({ path: relativePath, error: 'Lien symbolique interdit' });
          continue;
        }
        if (entry.isDirectory()) {
          await walk(path);
          continue;
        }
        if (!entry.isFile() || !/\.ya?ml$/i.test(entry.name)) continue;
        try {
          const raw = await readText(await safePath(this.root.path, path));
          const id = identifier.parse(normalizeId(basename(entry.name).replace(/\.ya?ml$/i, '')));
          catalog.items.push({
            id,
            document: apiRegistrySchema.parse(decodeYaml(raw)),
            etag: digest(raw),
            yaml: raw,
            path: relativePath,
            updatedAt: (await stat(await safePath(this.root.path, path))).mtime.toISOString(),
          });
        } catch (error) {
          catalog.invalid.push({
            path: relativePath,
            error: error instanceof Error ? error.message : 'YAML invalide',
          });
        }
      }
    };
    await walk(this.root.apiRegistryDirectory);
    const counts = new Map<string, number>();
    for (const record of catalog.items) counts.set(record.id, (counts.get(record.id) ?? 0) + 1);
    catalog.items = catalog.items.filter((record) => {
      if (counts.get(record.id)! > 1) {
        catalog.invalid.push({ path: record.path, error: `Identifiant dupliqué : ${record.id}` });
        return false;
      }
      return true;
    });
    this.cache = { root: this.root.path, expires: Date.now() + this.cacheMs, catalog };
    return structuredClone(catalog);
  }

  async find(id: string): Promise<ApiRegistryRecord> {
    identifier.parse(id);
    const found = (await this.scan(true)).items.find((item) => item.id === id);
    if (!found) throw new AppError(404, 'NOT_FOUND', 'Registre API introuvable ou invalide');
    return found;
  }

  async create(id: string, document: ApiRegistry, _config: AppConfig): Promise<ApiRegistryRecord> {
    identifier.parse(id);
    const catalog = await this.scan(true);
    if (catalog.items.some((item) => item.id === id))
      throw new AppError(409, 'DUPLICATE_ID', 'Cet identifiant existe déjà');
    const filename = `${id.replaceAll('_', '-')}.yml`;
    const path = await safePath(this.root.path, this.root.apiRegistryDirectory, filename);
    const yaml = encodeYaml(document);
    try {
      await atomicWrite(path, yaml, true);
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'EEXIST')
        throw new AppError(409, 'FILE_EXISTS', 'Un fichier existe déjà à cet emplacement');
      throw error;
    }
    this.cache = undefined;
    return {
      id,
      document,
      yaml,
      etag: digest(yaml),
      path: relative(`${this.root.path}/${this.root.apiRegistryDirectory}`, path).replaceAll(
        '\\',
        '/',
      ),
      updatedAt: new Date().toISOString(),
    };
  }

  private async backup(record: ApiRegistryRecord, maximum: number): Promise<void> {
    const folder = await safePath(
      this.root.path,
      `${this.root.configDirectory}/backups/api`,
      record.id,
    );
    await atomicWrite(
      await safePath(
        folder,
        `${new Date().toISOString().replaceAll(':', '-')}-${record.etag.slice(0, 12)}.yml`,
      ),
      record.yaml,
    );
    const files = (await readdir(folder))
      .filter((file) => file.endsWith('.yml'))
      .sort()
      .reverse();
    for (const file of files.slice(maximum)) await unlink(await safePath(folder, file));
  }

  async update(
    id: string,
    document: ApiRegistry,
    etag: string,
    config: AppConfig,
  ): Promise<ApiRegistryRecord> {
    const previous = await this.find(id);
    if (previous.etag !== etag) throw conflict();
    if (config.registry.backup_before_update)
      await this.backup(previous, config.registry.max_backups);
    const path = await safePath(this.root.path, this.root.apiRegistryDirectory, previous.path);
    if (digest(await readText(path)) !== etag) throw conflict();
    const yaml = encodeYaml(document);
    await atomicWrite(path, yaml);
    this.cache = undefined;
    return {
      id,
      document,
      yaml,
      etag: digest(yaml),
      path: previous.path,
      updatedAt: new Date().toISOString(),
    };
  }

  async delete(id: string, etag: string, config: AppConfig): Promise<void> {
    const previous = await this.find(id);
    if (previous.etag !== etag) throw conflict();
    if (config.registry.backup_before_delete)
      await this.backup(previous, config.registry.max_backups);
    const path = await safePath(this.root.path, this.root.apiRegistryDirectory, previous.path);
    try {
      if (digest(await readText(path)) !== etag) throw conflict();
      await unlink(path);
    } catch (error) {
      if (isMissing(error)) throw conflict();
      throw error;
    }
    this.cache = undefined;
  }
}
