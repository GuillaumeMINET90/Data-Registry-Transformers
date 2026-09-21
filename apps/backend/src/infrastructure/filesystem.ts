import { constants } from 'node:fs';
import { access, lstat, mkdir, open, readFile, realpath, rename, unlink } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { parseDocument, stringify } from 'yaml';
import { AppError } from '../domain/errors.js';
export const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export function isInside(root: string, path: string): boolean {
  const rel = relative(root, path);
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel));
}
export async function rejectSymlinks(path: string): Promise<void> {
  const full = resolve(path);
  const parent = dirname(full);
  if (parent !== full) await rejectSymlinks(parent);
  try {
    if ((await lstat(full)).isSymbolicLink())
      throw new AppError(
        400,
        'UNSAFE_PATH',
        'Les liens symboliques et jonctions ne sont pas autorisés',
      );
  } catch (error) {
    if (!isMissing(error)) throw error;
  }
}
export function isMissing(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}
export async function safePath(root: string, ...parts: string[]): Promise<string> {
  const path = resolve(root, ...parts);
  if (!isInside(resolve(root), path))
    throw new AppError(400, 'UNSAFE_PATH', 'Chemin hors du dossier autorisé');
  await rejectSymlinks(path);
  return path;
}
export async function readText(path: string): Promise<string> {
  await rejectSymlinks(path);
  const stat = await lstat(path);
  if (!stat.isFile() || stat.size > 2 * 1024 * 1024)
    throw new AppError(422, 'INVALID_FILE', 'Fichier non régulier ou supérieur à 2 Mo');
  return readFile(path, 'utf8');
}
export function decodeYaml(value: string): unknown {
  const parsed = parseDocument(value, { uniqueKeys: true, version: '1.2' });
  if (parsed.errors.length || parsed.warnings.length)
    throw new AppError(
      422,
      'INVALID_YAML',
      [...parsed.errors, ...parsed.warnings].map((e) => e.message).join('; '),
    );
  return parsed.toJS({ maxAliasCount: 0 }) as unknown;
}
export const encodeYaml = (value: unknown): string => stringify(value, { lineWidth: 100 });
export async function atomicWrite(path: string, content: string, exclusive = false): Promise<void> {
  await rejectSymlinks(path);
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  const handle = await open(temporary, 'wx', 0o600);
  try {
    await handle.writeFile(content, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await rejectSymlinks(path);
    if (exclusive) {
      // Hard-link publication is atomic and refuses to overwrite an existing file.
      const { link } = await import('node:fs/promises');
      await link(temporary, path);
      await unlink(temporary);
    } else await rename(temporary, path);
    if (process.platform !== 'win32') {
      const directory = await open(dirname(path), 'r');
      try {
        await directory.sync();
      } finally {
        await directory.close();
      }
    }
  } finally {
    await unlink(temporary).catch((error) => {
      if (!isMissing(error)) throw error;
    });
  }
}
export async function accessible(path: string, mode: number): Promise<boolean> {
  try {
    await rejectSymlinks(path);
    await access(path, mode);
    return true;
  } catch {
    return false;
  }
}
export { constants, realpath };
