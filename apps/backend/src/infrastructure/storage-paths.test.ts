import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { StoragePathMapping } from './storage-paths.js';
import { DataRoot } from './data-root.js';

describe('Dossier parent et montage hôte', () => {
  let directory: string;
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'dtr-layout-'));
  });
  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });
  const host = String.raw`C:\Users\guillaume.minet\Documents\dtr-test`;
  const root = () =>
    new DataRoot(
      join(directory, 'runtime'),
      join(directory, 'data', 'first'),
      join(directory, 'data'),
      host,
    );

  it('traduit le chemin Windows exact et ses descendants vers le montage', () => {
    const mapping = new StoragePathMapping(directory, host);
    expect(mapping.toServer(host)).toBe(resolve(directory));
    expect(mapping.toServer(`${host}\\child`)).toBe(join(directory, 'child'));
    expect(mapping.toDisplay(join(directory, 'child'))).toBe(`${host}\\child`);
    expect(mapping.toServer(host.toUpperCase())).toBe(resolve(directory));
    expect(mapping.toServer(host.replaceAll('\\', '/'))).toBe(resolve(directory));
  });
  it('ne traduit pas les voisins, traversées ou autres lecteurs vers le montage', () => {
    const mapping = new StoragePathMapping(directory, host);
    for (const path of [`${host}-other`, `${host}\\..\\outside`, 'D:\\other']) {
      try {
        expect(mapping.toServer(path).startsWith(directory)).toBe(false);
      } catch (error) {
        expect(error).toHaveProperty('code', 'UNMOUNTED_ROOT');
      }
    }
  });
  it('supporte également les montages hôtes POSIX', () => {
    const mapping = new StoragePathMapping(directory, '/home/user/dtr');
    expect(mapping.toServer('/home/user/dtr/child')).toBe(join(directory, 'child'));
    expect(mapping.toDisplay(join(directory, 'child'))).toBe('/home/user/dtr/child');
  });
  it('crée config et registry directement sous le parent et accepte son chemin Windows au test', async () => {
    const storage = root();
    await storage.initialize();
    expect(await readFile(join(storage.path, 'config/application.yml'), 'utf8')).toContain(
      'application_name',
    );
    expect(await storage.status(host)).toMatchObject({
      path: host,
      available: true,
      directories: { config: 'config', registry: 'registry' },
    });
    await storage.changeRoot(host, 'existing');
  });
  it('initialise un dossier déjà créé mais vide et retrouve le choix au redémarrage', async () => {
    const storage = root();
    await storage.initialize();
    const destination = join(directory, 'data', 'second');
    await mkdir(destination);
    await storage.changeRoot(destination, 'new');
    const restarted = root();
    await restarted.initialize();
    expect(restarted.path).toBe(destination);
    expect((await restarted.read()).config.application_name).toBeTruthy();
  });
  it('conserve les anciens stockages et détecte les organisations ambiguës', async () => {
    const storage = root();
    await storage.initialize();
    await rename(join(storage.path, 'config'), join(storage.path, 'appConfig'));
    await rename(join(storage.path, 'registry'), join(storage.path, 'registries'));
    await writeFile(join(storage.path, 'registries', 'existing.yml'), 'test: true');
    const restarted = root();
    await restarted.initialize();
    expect(restarted.configDirectory).toBe('appConfig');
    expect((await restarted.status()).registryCount).toBe(1);
    await mkdir(join(storage.path, 'config'));
    await expect(root().initialize()).rejects.toHaveProperty('code', 'AMBIGUOUS_STORAGE');
  });
  it('refuse de réinitialiser un dossier non vide', async () => {
    const storage = root();
    await storage.initialize();
    const destination = join(directory, 'data', 'second');
    await mkdir(destination);
    await writeFile(join(destination, 'keep.txt'), 'keep');
    await expect(storage.changeRoot(destination, 'new')).rejects.toHaveProperty(
      'code',
      'ROOT_EXISTS',
    );
    expect(await readFile(join(destination, 'keep.txt'), 'utf8')).toBe('keep');
  });
});
