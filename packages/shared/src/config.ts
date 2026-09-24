import { z } from 'zod';
export const configSchema = z
  .object({
    application_name: z.string().trim().min(1).max(100).default('Data Transformers Registry'),
    language: z.enum(['fr', 'en']).default('fr'),
    timezone: z
      .string()
      .refine((v) => {
        try {
          new Intl.DateTimeFormat('fr', { timeZone: v });
          return true;
        } catch {
          return false;
        }
      }, 'Fuseau horaire invalide')
      .default('Europe/Paris'),
    registry: z
      .object({
        extension: z.literal('.yml').default('.yml'),
        schema_version: z.literal('1.0').default('1.0'),
        group_by_department: z.boolean().default(true),
        backup_before_update: z.boolean().default(true),
        backup_before_delete: z.boolean().default(true),
        max_backups: z.number().int().min(1).max(100).default(20),
        validation_mode: z.enum(['standard', 'strict']).default('standard'),
        unknown_yaml: z.enum(['show_error', 'ignore']).default('show_error'),
      })
      .strict()
      .default({}),
    interface: z
      .object({
        theme: z.enum(['light', 'dark', 'system']).default('system'),
        page_size: z.number().int().min(5).max(100).default(20),
        default_view: z.enum(['list', 'cards']).default('list'),
      })
      .strict()
      .default({}),
    options: z
      .object({
        services: z
          .array(z.string().trim().min(1).max(100))
          .max(200)
          .refine((values) => new Set(values).size === values.length, 'Services en double')
          .default(['general']),
      })
      .strict()
      .default({}),
    setup_completed: z.boolean().default(false),
  })
  .strict();
export type AppConfig = z.infer<typeof configSchema>;
export const rootChangeSchema = z
  .object({ path: z.string().min(1).max(1000), mode: z.enum(['existing', 'new']) })
  .strict();
