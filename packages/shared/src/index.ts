export * from './registry.js';
export * from './config.js';
export { stringify as stringifyYaml } from 'yaml';
import type { Registry } from './registry.js';
import type { AppConfig } from './config.js';
export interface RegistryRecord {
  document: Registry;
  etag: string;
  path: string;
  yaml: string;
}
export interface InvalidFile {
  path: string;
  error: string;
}
export interface RegistryList {
  items: RegistryRecord[];
  invalid: InvalidFile[];
  total: number;
  page: number;
  pages: number;
  departments: string[];
  families: string[];
  tags: string[];
  stats: { active: number; draft: number; total: number; lastUpdated: string | null };
}
export interface StorageStatus {
  path: string;
  serverPath: string;
  directories: { config: string; registry: string };
  available: boolean;
  readable: boolean;
  writable: boolean;
  registryCount: number;
}
export interface ConfigResponse {
  config: AppConfig;
  etag: string;
  storage: StorageStatus;
  security: { session_ttl_seconds: number; cookie_secure: boolean };
}
export interface ApiErrorBody {
  message: string;
  code: string;
  issues?: { path: (string | number)[]; message: string }[];
}
