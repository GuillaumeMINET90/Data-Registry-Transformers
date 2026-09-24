import { z } from 'zod';
import { apiRegistryId, apiRegistrySchema, identifier } from '@dtr/shared';
import type { ApiRegistry, ApiRegistryList, ApiRegistryRecord } from '@dtr/shared';
import type {
  ApiRegistryRepository,
  AuditLog,
  Clock,
  ConfigurationRepository,
  UnitOfWork,
} from '../domain/ports.js';

export class ApiRegistryService {
  constructor(
    private readonly repository: ApiRegistryRepository,
    private readonly configuration: ConfigurationRepository,
    private readonly audit: AuditLog,
    private readonly transaction: UnitOfWork,
    private readonly clock: Clock,
  ) {}

  async list(search = ''): Promise<ApiRegistryList> {
    const catalog = await this.repository.scan();
    const needle = search.trim().toLocaleLowerCase();
    const items = catalog.items
      .filter((record) => {
        if (!needle) return true;
        return [
          record.id,
          ...Object.entries(record.document.applications).flatMap(([name, application]) => [
            name,
            ...application.collections,
            application.api.openapi,
            ...application.endpoint_acces.flatMap((endpoint) => [
              endpoint.id,
              endpoint.description,
              ...endpoint.usages,
            ]),
            ...application.tools,
          ]),
        ]
          .join(' ')
          .toLocaleLowerCase()
          .includes(needle);
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return { items, invalid: catalog.invalid, total: items.length };
  }

  get(id: string): Promise<ApiRegistryRecord> {
    return this.repository.find(id);
  }

  private async validate(value: unknown): Promise<ApiRegistry> {
    const document = apiRegistrySchema.parse(value);
    const { config } = await this.configuration.read();
    const allowed = new Set(config.options.tools);
    const issues: z.ZodIssue[] = [];
    Object.entries(document.applications).forEach(([name, application]) => {
      application.tools.forEach((tool, index) => {
        if (!allowed.has(tool))
          issues.push({
            code: 'custom',
            path: ['applications', name, 'tools', index],
            message: `Le tool « ${tool} » n'est pas défini dans Configuration > Options`,
          });
      });
    });
    if (issues.length) throw new z.ZodError(issues);
    return document;
  }

  async preview(value: unknown): Promise<{ id: string; document: ApiRegistry }> {
    const document = await this.validate(value);
    return { id: apiRegistryId(document), document };
  }

  create(value: unknown, user: string): Promise<ApiRegistryRecord> {
    return this.transaction.run(async () => {
      const document = await this.validate(value);
      const id = apiRegistryId(document);
      const { config } = await this.configuration.read();
      const result = await this.repository.create(id, document, config);
      await this.audit.append({
        timestamp: this.clock.now(),
        user,
        action: 'API_CREATE',
        registry: id,
        old_version: null,
        new_version: null,
      });
      return result;
    });
  }

  update(id: string, value: unknown, etag: string, user: string): Promise<ApiRegistryRecord> {
    return this.transaction.run(async () => {
      id = identifier.parse(id);
      const document = await this.validate(value);
      const { config } = await this.configuration.read();
      const result = await this.repository.update(id, document, etag, config);
      await this.audit.append({
        timestamp: this.clock.now(),
        user,
        action: 'API_UPDATE',
        registry: id,
        old_version: null,
        new_version: null,
      });
      return result;
    });
  }

  delete(id: string, etag: string, user: string): Promise<void> {
    return this.transaction.run(async () => {
      id = identifier.parse(id);
      const { config } = await this.configuration.read();
      await this.repository.delete(id, etag, config);
      await this.audit.append({
        timestamp: this.clock.now(),
        user,
        action: 'API_DELETE',
        registry: id,
        old_version: null,
        new_version: null,
      });
    });
  }
}
