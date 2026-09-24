import { z } from 'zod';
import { useController, useFormContext } from 'react-hook-form';
import { Plus, Trash2 } from 'lucide-react';
import { useT } from '../i18n/index';
import { normalizeId } from '@dtr/shared';
const labels: Record<string, string> = {
  service: 'Service',
  services: 'Services',
  format: 'Format',
  filenames: 'Noms de fichiers',
  split_by: 'Découpage',
  recognition: 'Reconnaissance',
  transformation: 'Transformation',
  sections: 'Sections',
  id: 'Identifiant',
  name: 'Nom',
  description: 'Description',
  department: 'Service',
  domain: 'Domaine métier',
  subdomain: 'Sous-domaine',
  family: 'Famille documentaire',
  version: 'Version',
  status: 'Statut',
  priority: 'Priorité',
  tags: 'Tags',
  document_type: 'Type de document',
  purpose: 'Objectif du document',
  audience: 'Utilisateurs concernés',
  context: 'Contexte métier',
  scope: 'Périmètre',
  exclusions: 'Exclusions',
  formats: 'Formats acceptés',
  custom_formats: 'Autres formats',
  mime_types: 'Types MIME supplémentaires',
  minimum_score: 'Score minimal',
  source_paths: 'Chemins / origines',
  filename: 'Nom de fichier',
  contains: 'Contient',
  starts_with: 'Commence par',
  ends_with: 'Termine par',
  regex: 'Expressions régulières',
  aliases: 'Alias',
  sheets: 'Feuilles Excel',
  expected: 'Attendus',
  columns: 'Colonnes',
  required: 'Obligatoire',
  keywords: 'Mots-clés',
  structure: 'Signaux structurels',
  min_columns: 'Nombre minimal de colonnes',
  max_columns: 'Nombre maximal de colonnes',
  has_table: 'Présence de tableau',
  multiple_sheets: 'Plusieurs feuilles',
  has_text: 'Présence de texte',
  visual_dependency: 'Dépendance visuelle',
  paginated: 'Document paginé',
  weights: 'Poids des signaux',
  source_path: 'Chemin source',
  required_columns: 'Colonnes obligatoires',
  expected_columns: 'Colonnes attendues',
  fields: 'Champs métier',
  source: 'Champ source',
  canonical: 'Nom canonique',
  type: 'Type',
  preserve_exact: 'Préserver la valeur exacte',
  normalization: 'Normalisations déclaratives',
  allow_empty: 'Valeur vide autorisée',
  business_role: 'Rôle métier',
  enum_values: 'Valeurs autorisées',
  strategy: 'Stratégie',
  record_unit: 'Unité de connaissance',
  identity_fields: 'Champs d’identification',
  preserve_fields: 'Champs à préserver',
  ignore_fields: 'Champs à ignorer',
  normalize_fields: 'Champs à normaliser',
  semantic_fields: 'Champs sémantiques',
  common_context: 'Contexte commun à chaque unité',
  relations: 'Relations métier',
  target: 'Cible',
  target_kind: 'Nature de la cible',
  repeat_context: 'Contexte à répéter',
  search_fields: 'Champs importants pour la recherche',
  exact_fields: 'Champs à conserver exactement',
  lexical_fields: 'Champs de recherche lexicale',
  contextual_fields: 'Champs de contexte',
  generate_relations: 'Générer des relations',
  minimum_recognition_score: 'Score minimal de reconnaissance',
  require_all_required_fields: 'Exiger tous les champs obligatoires',
  allow_unknown_columns: 'Accepter les colonnes inconnues',
  human_review_below: 'Revue humaine sous ce score',
  application_name: 'Nom de l’application',
  language: 'Langue',
  timezone: 'Fuseau horaire',
  extension: 'Extension des fichiers',
  schema_version: 'Version du schéma',
  group_by_department: 'Sous-dossier par service',
  backup_before_update: 'Sauvegarder avant modification',
  backup_before_delete: 'Sauvegarder avant suppression',
  max_backups: 'Nombre maximal de sauvegardes par Registry',
  validation_mode: 'Mode de validation',
  unknown_yaml: 'Fichiers YAML inconnus',
  theme: 'Thème',
  page_size: 'Nombre par page',
  default_view: 'Vue par défaut',
};
const options: Record<string, string> = {
  draft: 'brouillon',
  active: 'actif',
  deprecated: 'déprécié',
  fr: 'Français',
  en: 'English',
  light: 'Clair',
  dark: 'Sombre',
  system: 'Système',
  list: 'Liste',
  cards: 'Cartes',
  standard: 'Standard',
  strict: 'Strict',
  show_error: 'Afficher une erreur',
  ignore: 'Ignorer',
  field: 'Champ existant',
  entity: 'Entité métier',
  structured_table: 'Tableau structuré',
  text_document: 'Document texte',
  technical_document: 'Document technique',
  visual_document: 'Document visuel',
  generic_document: 'Document générique',
  row: 'Ligne',
  record: 'Enregistrement',
  section: 'Section',
  page: 'Page',
  table: 'Tableau',
  sheet: 'Feuille',
  visual_asset: 'Élément visuel',
  document: 'Document',
};
type Schema = z.ZodTypeAny;
export function unwrap(schema: Schema): Schema {
  if (
    schema instanceof z.ZodDefault ||
    schema instanceof z.ZodOptional ||
    schema instanceof z.ZodNullable
  )
    return unwrap(schema._def.innerType);
  if (schema instanceof z.ZodEffects) return unwrap(schema._def.schema);
  return schema;
}
function blank(schema: Schema): unknown {
  if (schema instanceof z.ZodDefault) return schema._def.defaultValue();
  const type = unwrap(schema);
  if (type instanceof z.ZodObject)
    return Object.fromEntries(
      Object.entries(type.shape as Record<string, Schema>).map(([key, value]) => [
        key,
        blank(value),
      ]),
    );
  if (type instanceof z.ZodArray) return [];
  if (type instanceof z.ZodBoolean) return false;
  if (type instanceof z.ZodNumber) return 0;
  if (type instanceof z.ZodEnum) return type.options[0];
  return '';
}
export function SchemaFields({
  schema,
  path = '',
  disabled = false,
}: {
  schema: Schema;
  path?: string;
  disabled?: boolean;
}) {
  const type = unwrap(schema);
  if (type instanceof z.ZodObject)
    return (
      <div className="fields-grid">
        {Object.entries(type.shape as Record<string, Schema>).map(([key, child]) => (
          <SchemaField
            key={key}
            schema={child}
            path={path ? `${path}.${key}` : key}
            disabled={disabled}
          />
        ))}
      </div>
    );
  return <SchemaField schema={schema} path={path} disabled={disabled} />;
}
function SchemaField({
  schema,
  path,
  disabled,
}: {
  schema: Schema;
  path: string;
  disabled: boolean;
}) {
  const t = useT();
  const type = unwrap(schema);
  const key = path.split('.').at(-1)!;
  const label = t(labels[key] ?? key);
  if (type instanceof z.ZodObject)
    return (
      <fieldset className="field-group">
        <legend>{label}</legend>
        <SchemaFields schema={type} path={path} disabled={disabled} />
      </fieldset>
    );
  if (type instanceof z.ZodArray)
    return <ArrayField schema={type} path={path} label={label} disabled={disabled} />;
  return <ScalarField schema={type} path={path} label={label} disabled={disabled} />;
}
function ScalarField({
  schema,
  path,
  label,
  disabled,
}: {
  schema: Schema;
  path: string;
  label: string;
  disabled: boolean;
}) {
  const t = useT();
  const { control, getValues } = useFormContext();
  const { field, fieldState } = useController({ control, name: path });
  const id = `field-${path}`;
  const errorId = `${id}-error`;
  const common = {
    id,
    disabled: disabled || (path === 'registry.id' && !!getValues('metadata')),
    'aria-invalid': !!fieldState.error,
    'aria-describedby': fieldState.error ? errorId : undefined,
  };
  const boolean = schema instanceof z.ZodBoolean;
  const number = schema instanceof z.ZodNumber;
  const multiline = /description|purpose|context|scope|exclusions/.test(path);
  let input;
  if (boolean)
    input = (
      <input
        {...common}
        ref={field.ref}
        name={field.name}
        type="checkbox"
        checked={Boolean(field.value)}
        onChange={(e) => field.onChange(e.target.checked)}
      />
    );
  else if (schema instanceof z.ZodEnum)
    input = (
      <select {...common} {...field} value={String(field.value ?? '')}>
        {(schema.options as string[]).map((option) => (
          <option key={option} value={option}>
            {t(options[option] ?? option)}
          </option>
        ))}
      </select>
    );
  else if (schema instanceof z.ZodLiteral)
    input = <input {...common} value={String(schema.value)} readOnly />;
  else if (multiline)
    input = <textarea {...common} {...field} value={String(field.value ?? '')} rows={3} />;
  else
    input = (
      <input
        {...common}
        {...field}
        value={field.value === undefined ? '' : String(field.value)}
        type={number ? 'number' : 'text'}
        step={number ? 'any' : undefined}
        onBlur={() => {
          if (path === 'id' || path === 'registry.id' || path.endsWith('.canonical')) {
            field.onChange(normalizeId(String(field.value ?? '')));
          }
          field.onBlur();
        }}
        onChange={(e) =>
          field.onChange(
            number ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value,
          )
        }
      />
    );
  return (
    <div className={`form-field ${boolean ? 'checkbox-field' : ''} ${multiline ? 'wide' : ''}`}>
      <label htmlFor={id}>
        {boolean && input}
        {label}
      </label>
      {!boolean && input}
      {fieldState.error && (
        <small id={errorId} className="field-error">
          {fieldState.error.message}
        </small>
      )}
    </div>
  );
}
function ArrayField({
  schema,
  path,
  label,
  disabled,
}: {
  schema: z.ZodArray<Schema>;
  path: string;
  label: string;
  disabled: boolean;
}) {
  const t = useT();
  const { control, unregister, getValues } = useFormContext();
  const { field, fieldState } = useController({ control, name: path });
  // Le contrôleur du tableau ne voit pas les saisies faites dans ses éléments :
  // on relit la valeur courante du formulaire avant toute modification structurelle.
  const current = () => (getValues(path) ?? []) as unknown[];
  const values = (field.value ?? []) as unknown[];
  const item = unwrap(schema.element);
  if (item instanceof z.ZodEnum)
    return (
      <fieldset className="field-group">
        <legend>{label}</legend>
        <div className="choices">
          {(item.options as string[]).map((option) => (
            <label key={option} className={`choice ${values.includes(option) ? 'selected' : ''}`}>
              <input
                disabled={disabled}
                type="checkbox"
                checked={values.includes(option)}
                onChange={(e) =>
                  field.onChange(
                    e.target.checked ? [...values, option] : values.filter((v) => v !== option),
                  )
                }
              />
              {option.toUpperCase()}
            </label>
          ))}
        </div>
        {fieldState.error && <small className="field-error">{fieldState.error.message}</small>}
      </fieldset>
    );
  const remove = (index: number) => {
    const next = current().filter((_, i) => i !== index);
    unregister(path);
    field.onChange(next);
  };
  return (
    <fieldset className="field-group">
      <legend>
        {label} <span className="count">{values.length}</span>
      </legend>
      {values.map((_, index) => (
        <div
          className={item instanceof z.ZodObject ? 'array-card' : 'array-row'}
          key={`${path}-${index}`}
        >
          <SchemaFields schema={schema.element} path={`${path}.${index}`} disabled={disabled} />
          {!disabled && (
            <button
              type="button"
              className="icon-button danger-text"
              aria-label={`${t('Retirer')} ${label} ${index + 1}`}
              onClick={() => remove(index)}
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>
      ))}
      {!disabled && (
        <button
          type="button"
          className="button subtle small"
          onClick={() => field.onChange([...current(), blank(schema.element)])}
        >
          <Plus size={15} />
          {t('Ajouter')} · {label}
        </button>
      )}
      {fieldState.error && <small className="field-error">{fieldState.error.message}</small>}
    </fieldset>
  );
}
