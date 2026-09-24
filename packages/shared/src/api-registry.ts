import { z } from 'zod';
import { identifier, normalizeId } from './registry.js';

const uniqueList = z
  .array(z.string().trim().min(1).max(200))
  .max(500)
  .refine((values) => new Set(values).size === values.length, 'Les valeurs doivent être uniques')
  .default([]);

export const apiEndpointAccessSchema = z
  .object({
    id: z.string().trim().min(1).max(200),
    description: z.string().trim().max(10000).default(''),
    usages: uniqueList,
  })
  .strict();

export const apiDefinitionSchema = z
  .object({
    openapi: z
      .string()
      .trim()
      .max(2048)
      .refine(
        (value) => value === '' || /^https?:\/\/[^\s]+$/i.test(value),
        'Saisissez une URL OpenAPI HTTP ou HTTPS valide',
      )
      .default(''),
  })
  .strict()
  .default({});

const endpointAccessList = z
  .preprocess(
    (value) =>
      Array.isArray(value)
        ? value.map((endpoint) =>
            typeof endpoint === 'string'
              ? { id: endpoint, description: '', usages: [] }
              : endpoint,
          )
        : value,
    z
      .array(apiEndpointAccessSchema)
      .max(500)
      .superRefine((endpoints, context) => {
        const ids = new Set<string>();
        endpoints.forEach((endpoint, index) => {
          if (ids.has(endpoint.id))
            context.addIssue({
              code: 'custom',
              path: [index, 'id'],
              message: 'Cet endpoint est déjà déclaré',
            });
          ids.add(endpoint.id);
        });
      }),
  )
  .default([]);

export const apiApplicationName = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(
    /^[\p{L}][\p{L}\p{N} ._-]*$/u,
    'Commencez par une lettre et utilisez des lettres, chiffres, espaces, points, tirets ou underscores.',
  );

export const apiApplicationSchema = z
  .object({
    collections: uniqueList,
    api: apiDefinitionSchema,
    endpoint_acces: endpointAccessList,
    tools: uniqueList,
  })
  .strict();

export const apiRegistrySchema = z
  .object({
    applications: z.record(apiApplicationSchema),
  })
  .strict()
  .superRefine((document, context) => {
    const entries = Object.entries(document.applications);
    if (!entries.length)
      context.addIssue({
        code: 'custom',
        path: ['applications'],
        message: 'Ajoutez au moins une application',
      });
    if (entries.length > 100)
      context.addIssue({
        code: 'custom',
        path: ['applications'],
        message: 'Un registre ne peut pas contenir plus de 100 applications',
      });
    entries.forEach(([name], index) => {
      const result = apiApplicationName.safeParse(name);
      if (!result.success)
        context.addIssue({
          code: 'custom',
          path: ['applications', index, 'name'],
          message: result.error.issues[0]?.message ?? "Nom d'application invalide",
        });
    });
  });

export const apiRegistryFormSchema = z
  .object({
    applications: z
      .array(
        apiApplicationSchema.extend({
          name: apiApplicationName,
        }),
      )
      .min(1, 'Ajoutez au moins une application')
      .max(100),
  })
  .strict()
  .superRefine((value, context) => {
    const names = new Set<string>();
    value.applications.forEach((application, index) => {
      const key = application.name.toLocaleLowerCase();
      if (names.has(key))
        context.addIssue({
          code: 'custom',
          path: ['applications', index, 'name'],
          message: "Ce nom d'application est déjà utilisé",
        });
      names.add(key);
    });
  });

export type ApiApplication = z.infer<typeof apiApplicationSchema>;
export type ApiRegistry = z.infer<typeof apiRegistrySchema>;
export type ApiRegistryForm = z.infer<typeof apiRegistryFormSchema>;

export function newApiRegistryForm(): ApiRegistryForm {
  return apiRegistryFormSchema.parse({
    applications: [{ name: 'Nouvelle API' }],
  });
}

export function toApiRegistry(value: ApiRegistryForm): ApiRegistry {
  const form = apiRegistryFormSchema.parse(value);
  return apiRegistrySchema.parse({
    applications: Object.fromEntries(
      form.applications.map(({ name, collections, api, endpoint_acces, tools }) => [
        name,
        { collections, api, endpoint_acces, tools },
      ]),
    ),
  });
}

export function fromApiRegistry(value: ApiRegistry): ApiRegistryForm {
  const document = apiRegistrySchema.parse(value);
  return apiRegistryFormSchema.parse({
    applications: Object.entries(document.applications).map(([name, application]) => ({
      name,
      ...application,
    })),
  });
}

export function apiRegistryId(value: ApiRegistry): string {
  const document = apiRegistrySchema.parse(value);
  return identifier.parse(normalizeId(Object.keys(document.applications)[0] ?? ''));
}
