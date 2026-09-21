import { configSchema, mimeTypes, validateRegistry } from '@dtr/shared';
import type { Registry, RegistryList, RegistryRecord } from '@dtr/shared';
import type {
  AuditLog,
  Clock,
  ConfigurationRepository,
  RegistryRepository,
  UnitOfWork,
} from '../domain/ports.js';
import { AppError } from '../domain/errors.js';
export interface ListQuery {
  search?: string;
  department?: string;
  family?: string;
  status?: string;
  format?: string;
  tag?: string;
  sort?: string;
  direction?: string;
  page?: number;
  pageSize?: number;
}
export class RegistryService {
  private readonly previews = new Map<
    string,
    { document: Registry; user: string; id?: string; expires: number }
  >();
  private previewSequence = 0;
  constructor(
    private readonly repository: RegistryRepository,
    private readonly configuration: ConfigurationRepository,
    private readonly audit: AuditLog,
    private readonly transaction: UnitOfWork,
    private readonly clock: Clock,
  ) {}
  async list(query: ListQuery): Promise<RegistryList> {
    const catalog = await this.repository.scan();
    const unique = (values: string[]) => [...new Set(values)].filter(Boolean).sort();
    const search = (query.search ?? '').toLocaleLowerCase();
    const filtered = catalog.items.filter(({ document: doc }) => {
      const r = doc.registry;
      return (
        (!search ||
          [r.id, r.name, r.description, r.department, r.family, ...r.tags]
            .join(' ')
            .toLocaleLowerCase()
            .includes(search)) &&
        (!query.department || query.department === r.department) &&
        (!query.family || query.family === r.family) &&
        (!query.status || query.status === r.status) &&
        (!query.format || doc.formats.some((f) => f === query.format)) &&
        (!query.tag || r.tags.includes(query.tag))
      );
    });
    const value = (record: RegistryRecord) =>
      query.sort === 'name'
        ? record.document.registry.name
        : query.sort === 'department'
          ? record.document.registry.department
          : (record.document.metadata?.updated_at ?? '');
    filtered.sort(
      (a, b) => value(a).localeCompare(value(b)) * (query.direction === 'asc' ? 1 : -1),
    );
    const pageSize = query.pageSize ?? 20;
    const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
    const page = Math.min(query.page ?? 1, pages);
    return {
      items: filtered.slice((page - 1) * pageSize, page * pageSize),
      total: filtered.length,
      page,
      pages,
      invalid: catalog.invalid,
      departments: unique(catalog.items.map((r) => r.document.registry.department)),
      families: unique(catalog.items.map((r) => r.document.registry.family)),
      tags: unique(catalog.items.flatMap((r) => r.document.registry.tags)),
      stats: {
        active: catalog.items.filter((r) => r.document.registry.status === 'active').length,
        draft: catalog.items.filter((r) => r.document.registry.status === 'draft').length,
        total: catalog.items.length,
        lastUpdated:
          catalog.items
            .map((r) => r.document.metadata?.updated_at ?? '')
            .sort()
            .at(-1) || null,
      },
    };
  }
  get(id: string): Promise<RegistryRecord> {
    return this.repository.find(id);
  }
  async validate(value: unknown): Promise<Registry> {
    return validateRegistry(
      value,
      (await this.configuration.read()).config.registry.validation_mode,
    );
  }
  preview(
    value: unknown,
    user: string,
    id?: string,
  ): Promise<{ document: Registry; token: string }> {
    return this.transaction.run(async () => {
      const doc = await this.validate(value);
      const previous = id ? (await this.repository.find(id)).document : undefined;
      const document = this.prepare(doc, user, previous);
      const now = Date.parse(this.clock.now());
      for (const [key, entry] of this.previews) if (entry.expires <= now) this.previews.delete(key);
      if (this.previews.size >= 100) this.previews.delete(this.previews.keys().next().value!);
      const token = `${now}-${++this.previewSequence}`;
      this.previews.set(token, { document, user, id, expires: now + 10 * 60 * 1000 });
      return { document, token };
    });
  }
  private prepared(value: Registry, user: string, previous?: Registry, token?: string): Registry {
    if (!token) return this.prepare(value, user, previous);
    const entry = this.previews.get(token);
    if (
      !entry ||
      entry.user !== user ||
      entry.id !== previous?.registry.id ||
      entry.expires <= Date.parse(this.clock.now())
    )
      throw new AppError(409, 'PREVIEW_EXPIRED', 'L’aperçu a expiré. Générez-le de nouveau.');
    if (JSON.stringify(value) !== JSON.stringify(entry.document))
      throw new AppError(
        409,
        'PREVIEW_CHANGED',
        'Le formulaire a changé depuis l’aperçu. Générez-le de nouveau.',
      );
    return entry.document;
  }
  private prepare(
    document: Registry,
    user: string,
    previous?: Registry,
    clonedFrom?: string,
  ): Registry {
    if (document.simple_contract) return document;
    const now = this.clock.now();
    return {
      ...document,
      mime_types: [
        ...new Set([
          ...document.formats.map((format) => mimeTypes[format]),
          ...document.mime_types,
        ]),
      ],
      metadata: {
        created_at: previous?.metadata?.created_at ?? now,
        updated_at: now,
        created_by: previous?.metadata?.created_by ?? user,
        updated_by: user,
        cloned_from: clonedFrom ?? previous?.metadata?.cloned_from ?? null,
      },
    };
  }
  create(value: unknown, user: string, token?: string): Promise<RegistryRecord> {
    return this.transaction.run(async () => {
      const { config } = await this.configuration.read();
      const doc = this.prepared(
        validateRegistry(value, config.registry.validation_mode),
        user,
        undefined,
        token,
      );
      const result = await this.repository.create(doc, config);
      await this.audit.append({
        timestamp: this.clock.now(),
        user,
        action: 'CREATE',
        registry: doc.registry.id,
        old_version: null,
        new_version: doc.registry.version,
      });
      return result;
    });
  }
  update(
    id: string,
    value: unknown,
    etag: string,
    user: string,
    token?: string,
  ): Promise<RegistryRecord> {
    return this.transaction.run(async () => {
      const { config } = await this.configuration.read();
      const old = await this.repository.find(id);
      const doc = this.prepared(
        validateRegistry(value, config.registry.validation_mode),
        user,
        old.document,
        token,
      );
      const result = await this.repository.update(id, doc, etag, config);
      await this.audit.append({
        timestamp: this.clock.now(),
        user,
        action: 'UPDATE',
        registry: id,
        old_version: old.document.registry.version,
        new_version: doc.registry.version,
      });
      return result;
    });
  }
  clone(
    id: string,
    input: { id: string; name: string; department: string; version: string },
    user: string,
  ): Promise<RegistryRecord> {
    return this.transaction.run(async () => {
      const { config } = await this.configuration.read();
      const source = await this.repository.find(id);
      const copy = this.prepare(
        validateRegistry(
          {
            ...source.document,
            registry: { ...source.document.registry, ...input, status: 'draft' },
          },
          config.registry.validation_mode,
        ),
        user,
        undefined,
        id,
      );
      const result = await this.repository.create(copy, config);
      await this.audit.append({
        timestamp: this.clock.now(),
        user,
        action: 'CLONE',
        registry: copy.registry.id,
        old_version: source.document.registry.version,
        new_version: copy.registry.version,
      });
      return result;
    });
  }
  delete(id: string, etag: string, user: string): Promise<void> {
    return this.transaction.run(async () => {
      const { config } = await this.configuration.read();
      const old = await this.repository.find(id);
      await this.repository.delete(id, etag, config);
      await this.audit.append({
        timestamp: this.clock.now(),
        user,
        action: 'DELETE',
        registry: id,
        old_version: old.document.registry.version,
        new_version: null,
      });
    });
  }
}
export class ConfigurationService {
  constructor(
    private readonly repository: ConfigurationRepository,
    private readonly audit: AuditLog,
    private readonly transaction: UnitOfWork,
    private readonly clock: Clock,
  ) {}
  async get() {
    return { ...(await this.repository.read()), storage: await this.repository.status() };
  }
  async test(path: string) {
    return this.repository.status(path);
  }
  update(input: unknown, etag: string, user: string) {
    return this.transaction.run(async () => {
      const config = configSchema.parse(input);
      await this.repository.write(config, etag);
      await this.audit.append({
        timestamp: this.clock.now(),
        user,
        action: 'CONFIG_UPDATE',
        registry: null,
        old_version: null,
        new_version: null,
      });
      return this.get();
    });
  }
  changeRoot(path: string, mode: 'existing' | 'new', user: string) {
    return this.transaction.run(async () => {
      await this.repository.changeRoot(path, mode);
      await this.audit.append({
        timestamp: this.clock.now(),
        user,
        action: 'CONFIG_UPDATE',
        registry: null,
        old_version: null,
        new_version: null,
      });
      return this.get();
    });
  }
}
export function requireEtag(value: string | string[] | undefined): string {
  if (typeof value !== 'string' || !/^"?[a-f0-9]{64}"?$/.test(value))
    throw new AppError(
      428,
      'PRECONDITION_REQUIRED',
      'La version du fichier est obligatoire (If-Match)',
    );
  return value.replaceAll('"', '');
}
