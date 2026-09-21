import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { newRegistry } from '@dtr/shared';

// Isolated project and volumes: never use the operator's production Compose project.
const temp = await mkdtemp(join(tmpdir(), 'dtr-docker-smoke-'));
const hostData = join(temp, 'data');
await mkdir(hostData);
const password = `${randomBytes(24).toString('hex')}$direct-password`;
const secret = randomBytes(48).toString('hex');
const project = `dtr-smoke-${Date.now()}`;
const composePath = join(temp, 'compose.yml');
const baseCompose = fileURLToPath(new URL('../../../../docker-compose.yml', import.meta.url));
const service = 'data-transformers-registry';
const imageName = (await docker(['compose', '-f', baseCompose, 'config', '--images'])).trim();
const content = `services:\n  ${service}:\n    image: ${imageName}:latest\n    pull_policy: never\n    environment:\n      DTR_ADMIN_USERNAME: admin\n      DTR_ADMIN_PASSWORD: '${password.replaceAll('$', () => '$$')}'\n      DTR_ADMIN_PASSWORD_HASH: ''\n      DTR_SESSION_SECRET: '${secret}'\n      DTR_COOKIE_SECURE: 'false'\n    ports: !override\n      - '127.0.0.1:8098:8080'\n`;
const bindOverride = `    volumes: !override\n      - type: bind\n        source: '${hostData.replaceAll('\\', '/').replaceAll("'", "''")}'\n        target: /data/registry\n      - registry-runtime:/app/runtime\n`;
const mappedContent = content.replace(
  '      DTR_ADMIN_USERNAME: admin',
  `      DTR_HOST_DATA_ROOT: '${hostData.replaceAll("'", "''")}'\n      DTR_ADMIN_USERNAME: admin`,
);
await writeFile(composePath, mappedContent + bindOverride, { mode: 0o600 });
async function docker(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const process = spawn('docker', args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let result = '';
    let error = '';
    process.stdout.on('data', (chunk) => {
      result += String(chunk);
    });
    process.stderr.on('data', (chunk) => {
      error += String(chunk);
    });
    process.on('error', reject);
    process.on('exit', (code) =>
      code === 0 ? resolve(result) : reject(new Error(`Docker failed: ${error}`)),
    );
  });
}
const compose = (...args: string[]) =>
  docker(['compose', '-p', project, '-f', baseCompose, '-f', composePath, ...args]);
async function waitHealthy() {
  for (let count = 0; count < 45; count++) {
    try {
      const response = await fetch('http://127.0.0.1:8098/health');
      if (response.ok) return;
    } catch {
      /* startup */
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error('Health timeout');
}
let cookie = '';
let csrf = '';
async function login() {
  const response = await fetch('http://127.0.0.1:8098/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-DTR-Client': 'web' },
    body: JSON.stringify({ username: 'admin', password }),
  });
  if (!response.ok) throw new Error('Docker login failed');
  cookie = response.headers.get('set-cookie')!.split(';')[0]!;
  csrf = ((await response.json()) as { csrf: string }).csrf;
}
try {
  await compose('up', '-d');
  await waitHealthy();
  await login();
  const tested = await fetch('http://127.0.0.1:8098/api/config/data-root/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie, 'X-CSRF-Token': csrf },
    body: JSON.stringify({ path: hostData }),
  });
  if (!tested.ok || !((await tested.json()) as { available: boolean }).available)
    throw new Error('Host path mapping failed');
  const response = await fetch('http://127.0.0.1:8098/api/registries', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie, 'X-CSRF-Token': csrf },
    body: JSON.stringify(newRegistry()),
  });
  if (response.status !== 201)
    throw new Error(`Registry creation failed: ${await response.text()}`);
  const persisted = await compose(
    'exec',
    '-T',
    service,
    'node',
    '-e',
    "process.stdout.write(require('node:fs').readFileSync('/data/registry/registry/general/nouveau-registry.yml','utf8'))",
  );
  if (!persisted.includes('nouveau_registry')) throw new Error('Physical YAML missing');
  if (
    !(await readFile(join(hostData, 'registry/general/nouveau-registry.yml'), 'utf8')).includes(
      'nouveau_registry',
    )
  )
    throw new Error('Registry missing from host bind mount');
  await readFile(join(hostData, 'config/application.yml'), 'utf8');
  await compose('restart');
  await waitHealthy();
  await login();
  const list = await fetch('http://127.0.0.1:8098/api/registries', { headers: { Cookie: cookie } });
  if (((await list.json()) as { total: number }).total !== 1) throw new Error('Persistence failed');
  const user = await compose('exec', '-T', service, 'id', '-u');
  if (user.trim() !== '1000') throw new Error('Unexpected container UID');
  const spa = await fetch('http://127.0.0.1:8098/registries/nouveau_registry');
  if (!spa.ok || !(await spa.text()).includes('<div id="root">'))
    throw new Error('SPA fallback failed');
  await compose('up', '-d', '--wait', '--wait-timeout', '60');
  process.stdout.write(
    'Docker smoke OK: health, login, CRUD file, restart persistence, SPA, UID 1000.\n',
  );
} finally {
  await compose('down', '-v');
  await rm(temp, { recursive: true, force: true });
}
