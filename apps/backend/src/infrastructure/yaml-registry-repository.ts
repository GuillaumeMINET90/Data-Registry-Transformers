import { readdir, unlink } from 'node:fs/promises';
import { relative } from 'node:path';
import { identifier, normalizeId, validateRegistry, registryYamlDocument } from '@dtr/shared';
import type { AppConfig, Registry, RegistryRecord } from '@dtr/shared';
import type { Catalog, RegistryRepository } from '../domain/ports.js';
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

export class YamlRegistryRepository implements RegistryRepository {
  private cache?: { root: string; expires: number; catalog: Catalog };
  constructor(
    private readonly root: DataRoot,
    private readonly cacheMs = 3000,
  ) {}
  async scan(force = false): Promise<Catalog> {
    if (!force && this.cache?.root === this.root.path && this.cache.expires > Date.now())
      return structuredClone(this.cache.catalog);
    const catalog: Catalog = { items: [], invalid: [] };
    const { config } = await this.root.read();
    const walk = async (folder: string): Promise<void> => {
      for (const entry of await readdir(await safePath(this.root.path, folder), {
        withFileTypes: true,
      })) {
        const path = `${folder}/${entry.name}`;
        if (entry.isSymbolicLink()) {
          catalog.invalid.push({ path, error: 'Lien symbolique interdit' });
          continue;
        }
        if (entry.isDirectory()) {
          await walk(path);
          continue;
        }
        if (!entry.isFile() || !/\.ya?ml$/i.test(entry.name)) continue;
        try {
          const raw = await readText(await safePath(this.root.path, path));
          const value = decodeYaml(raw);
          if (
            config.registry.unknown_yaml === 'ignore' &&
            (!value ||
              typeof value !== 'object' ||
              (!('schema_version' in value) && !('version' in value)))
          )
            continue;
          const document = validateRegistry(value, config.registry.validation_mode);
          catalog.items.push({
            document,
            etag: digest(raw),
            yaml: raw,
            path: path.slice(this.root.registryDirectory.length + 1),
          });
        } catch (error) {
          catalog.invalid.push({
            path: path.slice(this.root.registryDirectory.length + 1),
            error: error instanceof Error ? error.message : 'YAML invalide',
          });
        }
      }
    };
    await walk(this.root.registryDirectory);
    const counts = new Map<string, number>();
    for (const record of catalog.items)
      counts.set(record.document.registry.id, (counts.get(record.document.registry.id) ?? 0) + 1);
    catalog.items = catalog.items.filter((record) => {
      if (counts.get(record.document.registry.id)! > 1) {
        catalog.invalid.push({
          path: record.path,
          error: `Identifiant dupliqué : ${record.document.registry.id}`,
        });
        return false;
      }
      return true;
    });
    this.cache = { root: this.root.path, expires: Date.now() + this.cacheMs, catalog };
    return structuredClone(catalog);
  }
  async find(id: string): Promise<RegistryRecord> {
    identifier.parse(id);
    const found = (await this.scan(true)).items.find((item) => item.document.registry.id === id);
    if (!found) throw new AppError(404, 'NOT_FOUND', 'Registry introuvable ou invalide');
    return found;
  }
  async create(document: Registry, config: AppConfig): Promise<RegistryRecord> {
    const catalog = await this.scan(true);
    if (
      catalog.items.some((item) => item.document.registry.id === document.registry.id) ||
      catalog.invalid.some(
        (item) => item.error === `Identifiant dupliqué : ${document.registry.id}`,
      )
    )
      throw new AppError(409, 'DUPLICATE_ID', 'Cet identifiant existe déjà');
    const department = normalizeId(document.registry.department).replaceAll('_', '-') || 'general';
    const filename = `${document.registry.id.replaceAll('_', '-')}.yml`;
    const path = await safePath(
      this.root.path,
      this.root.registryDirectory,
      ...(config.registry.group_by_department ? [department] : []),
      filename,
    );
    const yaml = encodeYaml(registryYamlDocument(document));
    try {
      await atomicWrite(path, yaml, true);
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'EEXIST')
        throw new AppError(409, 'FILE_EXISTS', 'Un fichier existe déjà à cet emplacement');
      throw error;
    }
    this.cache = undefined;
    return {
      document,
      yaml,
      etag: digest(yaml),
      path: relative(`${this.root.path}/${this.root.registryDirectory}`, path).replaceAll(
        '\\',
        '/',
      ),
    };
  }
  private async backup(record: RegistryRecord, maximum: number): Promise<void> {
    const folder = await safePath(
      this.root.path,
      `${this.root.configDirectory}/backups`,
      record.document.registry.id,
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
    document: Registry,
    etag: string,
    config: AppConfig,
  ): Promise<RegistryRecord> {
    const previous = await this.find(id);
    if (previous.etag !== etag) throw conflict();
    if (document.registry.id !== id)
      throw new AppError(400, 'IMMUTABLE_ID', 'Pour changer l’identifiant, clonez le Registry');
    if (config.registry.backup_before_update)
      await this.backup(previous, config.registry.max_backups);
    const path = await safePath(this.root.path, this.root.registryDirectory, previous.path);
    if (digest(await readText(path)) !== etag) throw conflict();
    const yaml = encodeYaml(registryYamlDocument(document));
    await atomicWrite(path, yaml);
    this.cache = undefined;
    return { document, yaml, etag: digest(yaml), path: previous.path };
  }
  async delete(id: string, etag: string, config: AppConfig): Promise<void> {
    const previous = await this.find(id);
    if (previous.etag !== etag) throw conflict();
    if (config.registry.backup_before_delete)
      await this.backup(previous, config.registry.max_backups);
    const path = await safePath(this.root.path, this.root.registryDirectory, previous.path);
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
