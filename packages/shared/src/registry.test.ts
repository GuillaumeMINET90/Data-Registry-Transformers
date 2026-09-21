import { describe, expect, it } from 'vitest';
import { newRegistry, normalizeId, registrySchema, validateRegistry } from './registry.js';
describe('contrat Registry v1', () => {
  it('normalise les identifiants', () => {
    expect(normalizeId('Équipements Maintenance')).toBe('equipements_maintenance');
  });
  it('refuse la traversée de chemin, les versions et scores invalides', () => {
    const doc = newRegistry();
    doc.registry.id = '../../etc/passwd';
    doc.registry.version = 'oops';
    doc.recognition.minimum_score = 2;
    expect(registrySchema.safeParse(doc).success).toBe(false);
  });
  it('refuse les regex invalides sans les exécuter', () => {
    const doc = newRegistry();
    doc.recognition.filename.regex = ['['];
    expect(registrySchema.safeParse(doc).success).toBe(false);
  });
  it('vérifie les références de champs', () => {
    const doc = newRegistry();
    doc.rag.exact_fields = ['absent'];
    expect(registrySchema.safeParse(doc).success).toBe(false);
  });
  it('vérifie la cohérence des relations et des champs', () => {
    const doc = newRegistry();
    doc.relations = [
      { source: 'missing', type: 'A_SUBI', target: 'entity', target_kind: 'entity' },
    ];
    expect(registrySchema.safeParse(doc).success).toBe(false);
  });
  it('exige plusieurs signaux en mode strict actif', () => {
    const doc = newRegistry();
    doc.registry.status = 'active';
    expect(() => validateRegistry(doc, 'strict')).toThrow();
    doc.recognition.keywords = ['test'];
    doc.recognition.source_paths = ['test'];
    expect(validateRegistry(doc, 'strict').registry.status).toBe('active');
  });
  it('rejette une version de schéma inconnue', () => {
    expect(registrySchema.safeParse({ ...newRegistry(), schema_version: '2.0' }).success).toBe(
      false,
    );
  });
});
