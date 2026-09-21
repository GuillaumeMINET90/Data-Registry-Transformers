import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormProvider, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  newSimpleRegistry,
  simpleRegistrySchema,
  toSimpleRegistry,
  stringifyYaml,
} from '@dtr/shared';
import type { SimpleRegistry, RegistryRecord } from '@dtr/shared';
import { ArrowLeft, Save, Pencil, Copy, Trash2 } from 'lucide-react';
import { ApiError, api } from '../api/client';
import { ErrorMessage, Loading } from '../components/Feedback';
import { SchemaFields } from '../components/SchemaFields';
import { YamlPreview } from '../features/registries/YamlPreview';
import { RegistryActions } from '../features/registries/RegistryActions';
import { usePreview, type PreparedPreview } from '../features/registries/usePreview';
import { useT } from '../i18n/index';
import { SectionTabs } from '../components/SectionTabs';
import { WorkspaceCard } from '../components/WorkspaceCard';
import { LegacyEditor } from './LegacyRegistryEditor';
const sections = [
  {
    title: 'Document',
    keys: [
      'version',
      'id',
      'name',
      'service',
      'family',
      'format',
      'description',
      'recognition',
      'transformation',
      'context',
    ],
    hint: 'Renseignez les informations du document, ses critères de reconnaissance et son découpage.',
  },
  {
    title: 'Aperçu YAML',
    keys: [],
    hint: 'Le fichier YAML contient uniquement les champs du contrat simplifié.',
  },
] as const;
export function RegistryEditorPage({ readOnly = false }: { readOnly?: boolean }) {
  const { id } = useParams();
  const query = useQuery({
    queryKey: ['registry', id],
    queryFn: () => api<RegistryRecord>(`/registries/${id}`),
    enabled: !!id,
  });
  if (id && query.isPending) return <Loading />;
  if (query.error) return <ErrorMessage error={query.error} />;
  if (query.data && !query.data.document.simple_contract)
    return <LegacyEditor key={`${id}-${readOnly}`} initial={query.data} readOnly={readOnly} />;
  return <Editor key={`${id ?? 'new'}-${readOnly}`} initial={query.data} readOnly={readOnly} />;
}
function Editor({ initial, readOnly }: { initial?: RegistryRecord; readOnly: boolean }) {
  const t = useT();
  const navigate = useNavigate();
  const client = useQueryClient();
  const [step, setStep] = useState(0);
  const [saved, setSaved] = useState(initial);
  const [action, setAction] = useState<'clone' | 'delete'>();
  const [errors, setErrors] = useState<{ path: string; message: string }[]>([]);
  const form = useForm<SimpleRegistry>({
    defaultValues: initial ? toSimpleRegistry(initial.document) : newSimpleRegistry(),
    resolver: zodResolver(simpleRegistrySchema),
    mode: 'onBlur',
  });
  const values = useWatch({ control: form.control });
  const section = sections[step]!;
  const preview = usePreview(values, saved?.document.registry.id, !readOnly && step === 1);
  const mutation = useMutation({
    mutationFn: async (body: SimpleRegistry) => {
      const prepared =
        preview.current && preview.data
          ? preview.data
          : await api<PreparedPreview>('/registries/preview', {
              method: 'POST',
              body: { document: body, id: saved?.document.registry.id },
            });
      return api<RegistryRecord>(
        saved ? `/registries/${saved.document.registry.id}` : '/registries',
        {
          method: saved ? 'PUT' : 'POST',
          body: prepared.document,
          etag: saved?.etag,
          previewToken: prepared.token,
        },
      );
    },
    onSuccess: async (record) => {
      setSaved(record);
      form.reset(toSimpleRegistry(record.document));
      setErrors([]);
      client.setQueryData(['registry', record.document.registry.id], record);
      await client.invalidateQueries({ queryKey: ['registries'] });
      if (!initial) navigate(`/registries/${record.document.registry.id}/edit`, { replace: true });
    },
    onError: (error) => {
      if (error instanceof ApiError)
        setErrors(
          error.body.issues?.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })) ?? [],
        );
    },
  });
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (form.formState.isDirty) {
        event.preventDefault();
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [form.formState.isDirty]);
  const yaml =
    preview.current && preview.data && !readOnly
      ? preview.data.yaml
      : readOnly && initial
        ? initial.yaml
        : !form.formState.isDirty && saved
          ? saved.yaml
          : stringifyYaml(values, { lineWidth: 100 });
  return (
    <div className="workspace-page registry-workspace">
      <Link
        className="back-link"
        to="/registries"
        onClick={(e) => {
          if (
            form.formState.isDirty &&
            !window.confirm('Quitter sans enregistrer les modifications ?')
          )
            e.preventDefault();
        }}
      >
        <ArrowLeft size={16} />
        {t('Registries')}
      </Link>
      <header className="page-header">
        <div>
          <span className="eyebrow">
            REGISTRY / {readOnly ? 'CONSULTATION' : saved ? 'ÉDITION' : 'CRÉATION'}
          </span>
          <h1>{saved?.document.registry.name ?? t('Nouveau Registry')}</h1>
          <p>{saved?.path ?? 'Reconnaissance, transformation et contexte du document.'}</p>
        </div>
        {readOnly && saved && (
          <div className="toolbar">
            <button className="button" onClick={() => setAction('clone')}>
              <Copy size={16} />
              {t('Cloner')}
            </button>
            <button
              className="icon-button danger-text"
              aria-label="Supprimer"
              onClick={() => setAction('delete')}
            >
              <Trash2 size={18} />
            </button>
            <Link className="button primary" to={`/registries/${saved.document.registry.id}/edit`}>
              <Pencil size={16} />
              {t('Modifier')}
            </Link>
          </div>
        )}
      </header>
      <FormProvider {...form}>
        <form
          className="workspace-form"
          onSubmit={form.handleSubmit(
            (data) => mutation.mutate(data),
            () => {
              const parsed = simpleRegistrySchema.safeParse(form.getValues());
              if (!parsed.success)
                setErrors(
                  parsed.error.issues.map((issue) => ({
                    path: issue.path.join('.'),
                    message: issue.message,
                  })),
                );
            },
          )}
        >
          <SectionTabs
            id="registry"
            label="Sections du Registry"
            items={sections.map((item, index) => ({
              id: String(index),
              label: t(item.title),
              number: index + 1,
            }))}
            activeId={String(step)}
            onChange={(id) => setStep(Number(id))}
          />
          <WorkspaceCard
            id="registry"
            section={String(step)}
            footer={
              <>
                <div className="section-navigation">
                  <button
                    type="button"
                    className="button small"
                    disabled={step === 0}
                    onClick={() => setStep(step - 1)}
                  >
                    {t('Précédent')}
                  </button>
                  <span className="section-counter">
                    {step + 1} / {sections.length}
                  </span>
                  <button
                    type="button"
                    className="button small"
                    disabled={step === sections.length - 1}
                    onClick={() => setStep(step + 1)}
                  >
                    {t('Suivant')}
                  </button>
                </div>
                <div className="action-status" role="status">
                  {mutation.isSuccess ? t('Registry enregistré') : ''}
                </div>
                {!readOnly && (
                  <div className="footer-buttons">
                    <button
                      type="button"
                      className="button"
                      disabled={mutation.isPending}
                      onClick={() => {
                        form.reset(saved ? toSimpleRegistry(saved.document) : newSimpleRegistry());
                        setErrors([]);
                        mutation.reset();
                      }}
                    >
                      {t('Annuler')}
                    </button>
                    <button className="button primary" disabled={mutation.isPending}>
                      <Save size={16} />
                      {mutation.isPending ? 'Enregistrement…' : t('Enregistrer')}
                    </button>
                  </div>
                )}
              </>
            }
          >
            <div className="section-heading">
              <span className="eyebrow">SECTION {String(step + 1).padStart(2, '0')}</span>
              <h2>{t(section.title)}</h2>
              <p>{section.hint}</p>
            </div>
            <ErrorMessage error={mutation.error} />
            {!!errors.length && (
              <div className="notice error validation-errors" role="alert">
                <strong>Vérifiez les champs suivants :</strong>
                {errors.map((error, index) => (
                  <button
                    type="button"
                    key={index}
                    onClick={() => {
                      const index = sections.findIndex((s) =>
                        (s.keys as readonly string[]).includes(error.path.split('.')[0]!),
                      );
                      if (index >= 0) setStep(index);
                    }}
                  >
                    <code>{error.path}</code> — {error.message}
                  </button>
                ))}
              </div>
            )}
            {step === 1 ? (
              <>
                <ErrorMessage error={preview.error} />
                <YamlPreview yaml={yaml} id={values.id ?? 'registry'} />
                {!readOnly && (
                  <p className="muted">
                    {preview.current && preview.data
                      ? 'Aperçu validé : ce contenu exact sera enregistré. Valable 10 minutes.'
                      : 'Aperçu du formulaire. Complétez les champs valides pour obtenir le YAML définitif.'}
                  </p>
                )}
              </>
            ) : (
              <div className="section-fields fields-grid">
                {section.keys.map((key) =>
                  key === 'recognition' || key === 'transformation' ? (
                    <fieldset className="field-group" key={key}>
                      <legend>
                        {t(key === 'recognition' ? 'Reconnaissance' : 'Transformation')}
                      </legend>
                      <SchemaFields
                        schema={simpleRegistrySchema.shape[key]}
                        path={key}
                        disabled={readOnly}
                      />
                    </fieldset>
                  ) : (
                    <SchemaFields
                      key={key}
                      schema={simpleRegistrySchema.shape[key]}
                      path={key}
                      disabled={readOnly || (key === 'id' && !!saved)}
                    />
                  ),
                )}
              </div>
            )}
            {saved?.document.metadata && readOnly && (
              <details className="metadata">
                <summary>Métadonnées</summary>
                <dl>
                  {Object.entries(saved.document.metadata).map(([key, value]) => (
                    <div key={key}>
                      <dt>{key}</dt>
                      <dd>{value ?? '—'}</dd>
                    </div>
                  ))}
                </dl>
              </details>
            )}
          </WorkspaceCard>
        </form>
      </FormProvider>
      {action && saved && (
        <RegistryActions record={saved} action={action} close={() => setAction(undefined)} />
      )}
    </div>
  );
}
