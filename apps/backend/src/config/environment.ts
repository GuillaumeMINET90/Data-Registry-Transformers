import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
const project = fileURLToPath(new URL('../../../../', import.meta.url));
const optionalSecret = (schema: z.ZodString) =>
  z.preprocess((value) => (value === '' ? undefined : value), schema.optional());
export const environmentSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    DTR_PORT: z.coerce.number().int().min(1).max(65535).default(8080),
    DTR_HOST: z.string().default('0.0.0.0'),
    DTR_ADMIN_USERNAME: z.string().min(1).default('admin'),
    DTR_ADMIN_PASSWORD: optionalSecret(
      z.string().min(16, 'Le mot de passe doit contenir au moins 16 caractères').max(1024),
    ),
    DTR_ADMIN_PASSWORD_HASH: optionalSecret(
      z.string().regex(/^\$argon2id\$/, 'Le hash doit être au format Argon2id'),
    ),
    DTR_SESSION_SECRET: z.string().min(32),
    DTR_SESSION_TTL_SECONDS: z.coerce.number().int().min(60).max(86400).default(28800),
    DTR_COOKIE_SECURE: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),
    DTR_DATA_ROOT: z.string().default(resolve(project, 'data/registry')),
    DTR_HOST_DATA_ROOT: z.string().min(1).optional(),
    DTR_ALLOWED_DATA_PARENT: z.string().default(resolve(project, 'data')),
    DTR_RUNTIME_DIR: z.string().default(resolve(project, 'runtime')),
    DTR_PUBLIC_DIR: z.string().default(resolve(project, 'apps/frontend/dist')),
    DTR_LOG_LEVEL: z.enum(['silent', 'error', 'warn', 'info', 'debug']).default('info'),
  })
  .superRefine((env, context) => {
    if (Boolean(env.DTR_ADMIN_PASSWORD) === Boolean(env.DTR_ADMIN_PASSWORD_HASH)) {
      context.addIssue({
        code: 'custom',
        path: ['DTR_ADMIN_PASSWORD'],
        message:
          'Renseignez soit DTR_ADMIN_PASSWORD, soit DTR_ADMIN_PASSWORD_HASH, mais pas les deux.',
      });
    }
  });
export type Environment = z.infer<typeof environmentSchema>;
export function readEnvironment(): Environment {
  return environmentSchema.parse(process.env);
}
