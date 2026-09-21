import { isAbsolute, posix, relative, resolve, win32 } from 'node:path';
import { AppError } from '../domain/errors.js';
import { accessible, constants, isInside, safePath } from './filesystem.js';

export const standardLayout = { config: 'config', registry: 'registry' } as const;
const legacyLayout = { config: 'appConfig', registry: 'registries' } as const;
export type StorageLayout = { config: string; registry: string };

// Keep existing stores readable without silently moving or hiding their files.
export async function detectLayout(root: string): Promise<StorageLayout> {
  const exists = async (folder: string) => accessible(await safePath(root, folder), constants.F_OK);
  const legacy = (await exists('appConfig')) || (await exists('registries'));
  const modern = (await exists('config')) || (await exists('registry'));
  if (legacy && modern)
    throw new AppError(
      409,
      'AMBIGUOUS_STORAGE',
      'Ce dossier mélange les anciennes et nouvelles organisations de stockage (appConfig/registries et config/registry).',
    );
  return legacy ? legacyLayout : standardLayout;
}

/** Translate only the explicitly declared host bind mount, never arbitrary host paths. */
export class StoragePathMapping {
  private readonly hostPaths: typeof posix;
  constructor(
    private readonly serverRoot: string,
    private readonly hostRoot?: string,
  ) {
    this.hostPaths = hostRoot && /^(?:[a-z]:[\\/]|\\\\)/i.test(hostRoot) ? win32 : posix;
    if (hostRoot && !this.hostPaths.isAbsolute(hostRoot))
      throw new Error('DTR_HOST_DATA_ROOT doit être un chemin absolu');
  }
  toServer(input: string): string {
    if (this.hostRoot && this.hostPaths.isAbsolute(input)) {
      const suffix = this.hostPaths.relative(this.hostRoot, input);
      if (
        suffix === '' ||
        (!suffix.startsWith(`..${this.hostPaths.sep}`) &&
          suffix !== '..' &&
          !this.hostPaths.isAbsolute(suffix))
      )
        return resolve(this.serverRoot, ...suffix.split(this.hostPaths.sep));
    }
    if (!isAbsolute(input))
      throw new AppError(
        400,
        'UNMOUNTED_ROOT',
        this.hostRoot
          ? `Ce chemin doit se trouver dans le dossier monté : ${this.hostRoot}. Pour utiliser un autre dossier Windows, modifiez le montage Docker Compose.`
          : 'Ce chemin n’est pas accessible au serveur. Avec Docker, montez le dossier Windows et renseignez DTR_HOST_DATA_ROOT.',
      );
    return resolve(input);
  }
  toDisplay(serverPath: string): string {
    return this.hostRoot && isInside(resolve(this.serverRoot), resolve(serverPath))
      ? this.hostPaths.resolve(
          this.hostRoot,
          ...relative(this.serverRoot, serverPath).split(/[\\/]/),
        )
      : serverPath;
  }
}
