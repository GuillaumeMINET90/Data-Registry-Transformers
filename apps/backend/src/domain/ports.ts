import type { AppConfig, Registry, RegistryRecord, InvalidFile, StorageStatus } from '@dtr/shared';
export interface Catalog {
  items: RegistryRecord[];
  invalid: InvalidFile[];
}
export interface RegistryRepository {
  scan(force?: boolean): Promise<Catalog>;
  find(id: string): Promise<RegistryRecord>;
  create(document: Registry, config: AppConfig): Promise<RegistryRecord>;
  update(id: string, document: Registry, etag: string, config: AppConfig): Promise<RegistryRecord>;
  delete(id: string, etag: string, config: AppConfig): Promise<void>;
}
export interface ConfigurationRepository {
  read(): Promise<{ config: AppConfig; etag: string }>;
  write(config: AppConfig, etag: string): Promise<void>;
  status(path?: string): Promise<StorageStatus>;
  changeRoot(path: string, mode: 'existing' | 'new'): Promise<void>;
}
export interface AuditEvent {
  timestamp: string;
  user: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'CLONE' | 'CONFIG_UPDATE';
  registry: string | null;
  old_version: string | null;
  new_version: string | null;
}
export interface AuditLog {
  append(event: AuditEvent): Promise<void>;
}
export interface UnitOfWork {
  run<T>(operation: () => Promise<T>): Promise<T>;
}
export interface Clock {
  now(): string;
}
