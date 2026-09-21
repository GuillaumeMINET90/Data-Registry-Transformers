import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { newRegistry, registrySchema, stringifyYaml } from '@dtr/shared';
const folder = fileURLToPath(new URL('../../../../examples/', import.meta.url));
await mkdir(folder, { recursive: true });
const scenarios = [
  {
    id: 'maintenance_interventions',
    name: 'Interventions de maintenance',
    department: 'maintenance',
    family: 'intervention_equipement',
    purpose: 'Suivre les interventions réalisées sur les équipements industriels.',
    format: 'xlsx',
    source: 'Équipement',
    canonical: 'equipment_id',
    type: 'reference',
    keywords: ['maintenance', 'intervention', 'panne'],
    strategy: 'structured_table',
    unit: 'row',
  },
  {
    id: 'achats_commandes_fournisseurs',
    name: 'Commandes fournisseurs',
    department: 'achats',
    family: 'commande_fournisseur',
    purpose: 'Décrire les commandes passées auprès des fournisseurs.',
    format: 'csv',
    source: 'Numéro commande',
    canonical: 'order_id',
    type: 'string',
    keywords: ['commande', 'fournisseur', 'montant'],
    strategy: 'structured_table',
    unit: 'row',
  },
  {
    id: 'hse_rapport_accident',
    name: 'Rapport d’accident',
    department: 'hse',
    family: 'rapport_accident',
    purpose: 'Documenter les circonstances et actions correctives après un accident.',
    format: 'pdf',
    source: 'Description',
    canonical: 'accident_description',
    type: 'text',
    keywords: ['accident', 'circonstances', 'prévention'],
    strategy: 'text_document',
    unit: 'section',
  },
] as const;
for (const scenario of scenarios) {
  const draft = newRegistry();
  const doc = registrySchema.parse({
    ...draft,
    registry: {
      ...draft.registry,
      id: scenario.id,
      name: scenario.name,
      department: scenario.department,
      family: scenario.family,
      description: scenario.purpose,
      status: 'active',
      tags: scenario.keywords,
    },
    business_context: { purpose: scenario.purpose, audience: [scenario.department] },
    formats: [scenario.format],
    recognition: {
      source_paths: [scenario.department],
      keywords: scenario.keywords,
      columns: {
        required: scenario.format === 'pdf' ? [] : [{ name: scenario.source, aliases: [] }],
      },
    },
    fields: [
      {
        source: scenario.source,
        canonical: scenario.canonical,
        type: scenario.type,
        required: true,
        preserve_exact: scenario.type !== 'text',
      },
    ],
    transformation: {
      strategy: scenario.strategy,
      record_unit: scenario.unit,
      identity_fields: [scenario.canonical],
    },
    rag: {
      record_unit: scenario.unit,
      ...(scenario.type === 'text'
        ? { semantic_fields: [scenario.canonical] }
        : { exact_fields: [scenario.canonical] }),
    },
    metadata: {
      created_at: '2026-09-09T08:00:00Z',
      updated_at: '2026-09-09T08:00:00Z',
      created_by: 'example',
      updated_by: 'example',
      cloned_from: null,
    },
  });
  await writeFile(
    `${folder}/${scenario.id.replaceAll('_', '-')}.yml`,
    stringifyYaml(doc, { lineWidth: 100 }),
    'utf8',
  );
}
