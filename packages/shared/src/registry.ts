import { z } from 'zod';

const text = z.string().max(10000).default('');
const list = z.array(z.string().trim().min(1).max(500)).max(500).default([]);
const score = z.number().min(0).max(1);
export const identifier = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/, 'Utilisez des minuscules, chiffres et underscores.');
export const version = z
  .string()
  .regex(/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/, 'Version attendue : 1.0.0');
export const formats = [
  'xlsx',
  'xls',
  'csv',
  'pdf',
  'docx',
  'pptx',
  'txt',
  'md',
  'json',
  'xml',
  'png',
  'jpg',
  'other',
] as const;
export const simpleTransformation = z
  .object({
    type: z.string().trim().min(1).max(100).default('text'),
    split_by: z.string().trim().min(1).max(100).default('section'),
    sections: list,
  })
  .strict();
export const simpleRegistrySchema = z
  .object({
    version: z.literal(1).default(1),
    id: identifier,
    name: z.string().trim().min(1).max(200),
    service: z.string().trim().min(1).max(100),
    family: text,
    format: z.enum(formats),
    description: text,
    recognition: z.object({ filenames: list, keywords: list }).strict().default({}),
    transformation: simpleTransformation.default({}),
    context: text,
  })
  .strict();
export type SimpleRegistry = z.infer<typeof simpleRegistrySchema>;
export function newSimpleRegistry(): SimpleRegistry {
  return simpleRegistrySchema.parse({
    id: 'nouveau_registry',
    name: 'Nouveau Registry',
    service: 'general',
    format: 'pdf',
  });
}

export const units = [
  'row',
  'record',
  'section',
  'page',
  'table',
  'sheet',
  'visual_asset',
  'document',
] as const;
export const normalizations = [
  'trim',
  'lowercase',
  'uppercase',
  'normalize_whitespace',
  'iso_date',
  'decimal_comma',
] as const;
const column = z.object({ name: z.string().trim().min(1).max(200), aliases: list }).strict();
export const fieldSchema = z
  .object({
    source: z.string().trim().min(1).max(200),
    canonical: identifier,
    aliases: list,
    type: z
      .enum([
        'string',
        'integer',
        'decimal',
        'boolean',
        'date',
        'datetime',
        'enum',
        'reference',
        'text',
      ])
      .default('string'),
    description: text,
    required: z.boolean().default(false),
    preserve_exact: z.boolean().default(false),
    normalization: z.array(z.enum(normalizations)).default([]),
    allow_empty: z.boolean().default(true),
    business_role: text,
    enum_values: list,
  })
  .strict();
export const registryObject = z
  .object({
    schema_version: z.literal('1.0').default('1.0'),
    simple_contract: simpleTransformation.optional(),
    registry: z
      .object({
        id: identifier,
        name: z.string().trim().min(1).max(200),
        description: text,
        department: z.string().trim().min(1).max(100),
        domain: text,
        subdomain: text,
        family: text,
        version: version.default('1.0.0'),
        status: z.enum(['draft', 'active', 'deprecated']).default('draft'),
        priority: z.number().int().min(0).max(10000).default(100),
        tags: list,
        keywords: list,
      })
      .strict(),
    business_context: z
      .object({
        document_type: text,
        description: text,
        purpose: text,
        audience: list,
        context: text,
        scope: text,
        exclusions: list,
      })
      .strict()
      .default({}),
    formats: z.array(z.enum(formats)).min(1).max(13),
    custom_formats: list,
    mime_types: list,
    recognition: z
      .object({
        minimum_score: score.default(0.8),
        source_paths: list,
        filename: z
          .object({
            contains: list,
            starts_with: list,
            ends_with: list,
            regex: z
              .array(
                z
                  .string()
                  .max(500)
                  .refine((v) => {
                    try {
                      new RegExp(v);
                      return true;
                    } catch {
                      return false;
                    }
                  }, 'Expression régulière invalide'),
              )
              .max(50)
              .default([]),
            aliases: list,
          })
          .strict()
          .default({}),
        sheets: z.object({ expected: list }).strict().default({}),
        columns: z
          .object({ required: z.array(column).default([]), expected: z.array(column).default([]) })
          .strict()
          .default({}),
        keywords: list,
        structure: z
          .object({
            min_columns: z.number().int().nonnegative().default(0),
            max_columns: z.number().int().nonnegative().default(10000),
            has_table: z.boolean().default(false),
            multiple_sheets: z.boolean().default(false),
            has_text: z.boolean().default(false),
            visual_dependency: z.boolean().default(false),
            paginated: z.boolean().default(false),
          })
          .strict()
          .default({}),
        weights: z
          .object({
            source_path: score.default(0.15),
            filename: score.default(0.1),
            required_columns: score.default(0.35),
            expected_columns: score.default(0.2),
            keywords: score.default(0.1),
            structure: score.default(0.1),
          })
          .strict()
          .default({}),
      })
      .strict()
      .default({}),
    fields: z.array(fieldSchema).max(500).default([]),
    transformation: z
      .object({
        strategy: z
          .enum([
            'structured_table',
            'text_document',
            'technical_document',
            'visual_document',
            'generic_document',
          ])
          .default('generic_document'),
        record_unit: z.enum(units).default('document'),
        identity_fields: list,
        preserve_fields: list,
        ignore_fields: list,
        normalize_fields: list,
        semantic_fields: list,
        common_context: text,
      })
      .strict()
      .default({}),
    relations: z
      .array(
        z
          .object({
            source: identifier,
            type: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
            target: identifier,
            target_kind: z.enum(['field', 'entity']).default('entity'),
          })
          .strict(),
      )
      .max(500)
      .default([]),
    rag: z
      .object({
        record_unit: z.enum(units).default('document'),
        repeat_context: text,
        search_fields: list,
        exact_fields: list,
        lexical_fields: list,
        semantic_fields: list,
        contextual_fields: list,
        generate_relations: z.boolean().default(true),
      })
      .strict()
      .default({}),
    quality: z
      .object({
        minimum_recognition_score: score.default(0.8),
        require_all_required_fields: z.boolean().default(true),
        allow_unknown_columns: z.boolean().default(true),
        human_review_below: score.default(0.9),
      })
      .strict()
      .default({}),
    metadata: z
      .object({
        created_at: z.string().datetime({ offset: true }),
        updated_at: z.string().datetime({ offset: true }),
        created_by: z.string().min(1),
        updated_by: z.string().min(1),
        cloned_from: identifier.nullable().default(null),
      })
      .strict()
      .optional(),
  })
  .strict();

export const registrySchema = registryObject.superRefine((doc, ctx) => {
  const issue = (path: (string | number)[], message: string) =>
    ctx.addIssue({ code: 'custom', path, message });
  const names = new Set<string>();
  doc.fields.forEach((field, index) => {
    if (names.has(field.canonical)) issue(['fields', index, 'canonical'], 'Nom canonique dupliqué');
    names.add(field.canonical);
    if (field.preserve_exact && field.normalization.length)
      issue(
        ['fields', index, 'normalization'],
        'Une valeur préservée exactement ne peut pas être normalisée',
      );
    if (field.type === 'enum' && !field.enum_values.length)
      issue(['fields', index, 'enum_values'], 'Ajoutez les valeurs autorisées');
  });
  for (const section of ['transformation', 'rag'] as const) {
    for (const [key, value] of Object.entries(doc[section])) {
      if (Array.isArray(value))
        value.forEach((ref, index) => {
          if (!names.has(ref))
            issue([section, key, index], `Le champ « ${ref} » n'existe pas dans Structure`);
        });
    }
  }
  doc.relations.forEach((relation, i) => {
    if (!names.has(relation.source))
      issue(['relations', i, 'source'], `Le champ « ${relation.source} » n'existe pas`);
    if (relation.target_kind === 'field' && !names.has(relation.target))
      issue(['relations', i, 'target'], `Le champ « ${relation.target} » n'existe pas`);
  });
  if (doc.recognition.structure.min_columns > doc.recognition.structure.max_columns)
    issue(['recognition', 'structure', 'max_columns'], 'Le maximum doit être supérieur au minimum');
  if (Object.values(doc.recognition.weights).reduce((a, b) => a + b, 0) <= 0)
    issue(['recognition', 'weights'], 'Au moins un poids doit être positif');
  if (doc.quality.human_review_below < doc.quality.minimum_recognition_score)
    issue(
      ['quality', 'human_review_below'],
      'Le seuil de revue doit être supérieur au seuil minimal',
    );
  for (const kind of ['required', 'expected'] as const) {
    const seen = new Set<string>();
    doc.recognition.columns[kind].forEach((col, i) => {
      const key = col.name.toLowerCase();
      if (seen.has(key)) issue(['recognition', 'columns', kind, i, 'name'], 'Colonne dupliquée');
      seen.add(key);
    });
  }
});
export type Registry = z.infer<typeof registrySchema>;
export function newRegistry(): Registry {
  return registrySchema.parse({
    registry: { id: 'nouveau_registry', name: 'Nouveau Registry', department: 'general' },
    formats: ['pdf'],
  });
}
export function normalizeId(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/^[^a-z]+/, '');
}
export const mimeTypes: Record<(typeof formats)[number], string> = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
  csv: 'text/csv',
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  txt: 'text/plain',
  md: 'text/markdown',
  json: 'application/json',
  xml: 'application/xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  other: 'application/octet-stream',
};
export function validateRegistry(
  value: unknown,
  mode: 'standard' | 'strict' = 'standard',
): Registry {
  if (value && typeof value === 'object' && 'version' in value)
    return fromSimpleRegistry(simpleRegistrySchema.parse(value));
  const result = registrySchema.parse(value);
  if (result.simple_contract) return fromSimpleRegistry(toSimpleRegistry(result));
  if (mode === 'strict' && result.registry.status === 'active') {
    const signals = [
      result.recognition.source_paths.length,
      Object.values(result.recognition.filename).flat().length,
      result.recognition.columns.required.length + result.recognition.columns.expected.length,
      result.recognition.keywords.length,
      result.recognition.sheets.expected.length,
      Object.values(result.recognition.structure).filter((v) => v === true).length,
    ].filter(Boolean).length;
    if (signals < 2)
      throw new z.ZodError([
        {
          code: 'custom',
          path: ['recognition'],
          message:
            'Un Registry actif nécessite au moins deux catégories de signaux en validation stricte',
        },
      ]);
  }
  return result;
}

/** Adapt the compact YAML contract to the existing catalog model. */
export function fromSimpleRegistry(value: SimpleRegistry): Registry {
  const doc = simpleRegistrySchema.parse(value);
  return registrySchema.parse({
    simple_contract: doc.transformation,
    registry: {
      id: doc.id,
      name: doc.name,
      department: doc.service,
      family: doc.family,
      description: doc.description,
    },
    formats: [doc.format],
    recognition: {
      filename: { contains: doc.recognition.filenames },
      keywords: doc.recognition.keywords,
    },
    business_context: { context: doc.context },
  });
}
export function toSimpleRegistry(doc: Registry): SimpleRegistry {
  return simpleRegistrySchema.parse({
    version: 1,
    id: doc.registry.id,
    name: doc.registry.name,
    service: doc.registry.department,
    family: doc.registry.family,
    format: doc.formats[0],
    description: doc.registry.description,
    recognition: {
      filenames: doc.recognition.filename.contains,
      keywords: doc.recognition.keywords,
    },
    transformation: doc.simple_contract,
    context: doc.business_context.context,
  });
}
export function registryYamlDocument(doc: Registry): Registry | SimpleRegistry {
  return doc.simple_contract ? toSimpleRegistry(doc) : doc;
}
