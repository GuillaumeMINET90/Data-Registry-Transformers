import { readdir, unlink } from 'node:fs/promises';
import type { AuditEvent, AuditLog } from '../domain/ports.js';
import type { DataRoot } from './data-root.js';
import { atomicWrite, decodeYaml, encodeYaml, readText, safePath } from './filesystem.js';
import { AppError } from '../domain/errors.js';
export class YamlAuditLog implements AuditLog {
  constructor(private readonly root: DataRoot) {}
  async append(event: AuditEvent): Promise<void> {
    const path = await safePath(this.root.path, this.root.configDirectory, 'audit.yml');
    const data = decodeYaml(await readText(path));
    if (!Array.isArray(data))
      throw new AppError(422, 'INVALID_AUDIT', 'Le journal d’audit est invalide');
    let entries: unknown[] = data;
    if (entries.length >= 1000) {
      await atomicWrite(
        await safePath(this.root.path, this.root.configDirectory, `audit-${Date.now()}.yml`),
        encodeYaml(entries),
      );
      const archives = (await readdir(await safePath(this.root.path, this.root.configDirectory)))
        .filter((file) => /^audit-\d+\.yml$/.test(file))
        .sort()
        .reverse();
      for (const file of archives.slice(10))
        await unlink(await safePath(this.root.path, this.root.configDirectory, file));
      entries = [];
    }
    await atomicWrite(path, encodeYaml([...entries, event]));
  }
}
