import { buildApp } from './app.js';
import { readEnvironment } from './config/environment.js';
const env = readEnvironment();
const app = await buildApp(env);
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.once(signal, () => {
    app
      .close()
      .then(() => {
        process.exitCode = 0;
      })
      .catch((error) => {
        app.log.error(error);
        process.exitCode = 1;
      });
  });
await app.listen({ port: env.DTR_PORT, host: env.DTR_HOST });
