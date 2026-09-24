import { describe, expect, it } from 'vitest';
import {
  apiRegistryFormSchema,
  apiRegistryId,
  apiRegistrySchema,
  fromApiRegistry,
  toApiRegistry,
} from './api-registry.js';

describe('contrat des registres API', () => {
  it('convertit le formulaire vers le YAML attendu sans identifiant technique', () => {
    const form = apiRegistryFormSchema.parse({
      applications: [
        {
          name: 'LEUL WMS',
          collections: ['LEUL-WMS', 'LEUL-COMMUN'],
          api: { openapi: 'http://leul-wms/api/openapi/v1.json' },
          endpoint_acces: [
            {
              id: 'wms_get_palette',
              description: 'Retrouver une palette.',
              usages: ["palettes d'une commande"],
            },
            {
              id: 'wms_get_stock',
              description: 'Consulter le stock.',
              usages: ['stock disponible'],
            },
          ],
          tools: ['sql_inspection', 'sql_executor'],
        },
      ],
    });
    const document = toApiRegistry(form);
    expect(document).toEqual({
      applications: {
        'LEUL WMS': {
          collections: ['LEUL-WMS', 'LEUL-COMMUN'],
          api: { openapi: 'http://leul-wms/api/openapi/v1.json' },
          endpoint_acces: [
            {
              id: 'wms_get_palette',
              description: 'Retrouver une palette.',
              usages: ["palettes d'une commande"],
            },
            {
              id: 'wms_get_stock',
              description: 'Consulter le stock.',
              usages: ['stock disponible'],
            },
          ],
          tools: ['sql_inspection', 'sql_executor'],
        },
      },
    });
    expect(apiRegistryId(document)).toBe('leul_wms');
    expect(fromApiRegistry(document)).toEqual(form);
  });

  it('convertit les anciens endpoints texte vers le nouveau contrat documenté', () => {
    const document = apiRegistrySchema.parse({
      applications: {
        'LEUL WMS': {
          collections: ['LEUL-WMS'],
          endpoint_acces: ['leulia-get-colis'],
          tools: [],
        },
      },
    });
    expect(document.applications['LEUL WMS']!.endpoint_acces).toEqual([
      { id: 'leulia-get-colis', description: '', usages: [] },
    ]);
    expect(document.applications['LEUL WMS']!.api).toEqual({ openapi: '' });
  });

  it('refuse deux endpoints portant le même identifiant', () => {
    expect(
      apiRegistrySchema.safeParse({
        applications: {
          APP: {
            collections: [],
            endpoint_acces: [
              { id: 'get-colis', description: 'Première description', usages: [] },
              { id: 'get-colis', description: 'Deuxième description', usages: [] },
            ],
            tools: [],
          },
        },
      }).success,
    ).toBe(false);
  });

  it('refuse les applications dupliquées et les clés YAML inconnues', () => {
    expect(
      apiRegistryFormSchema.safeParse({
        applications: [
          { name: 'APP', collections: [], endpoint_acces: [], tools: [] },
          { name: 'app', collections: [], endpoint_acces: [], tools: [] },
        ],
      }).success,
    ).toBe(false);
    expect(
      apiRegistrySchema.safeParse({
        applications: {
          APP: { collections: [], endpoint_acces: [], tools: [], extra: true },
        },
      }).success,
    ).toBe(false);
  });
});
