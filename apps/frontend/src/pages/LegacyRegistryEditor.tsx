import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FormProvider, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { newRegistry, registryObject, registrySchema, stringifyYaml } from '@dtr/shared';
import type { Registry, RegistryRecord } from '@dtr/shared';
import { ArrowLeft, Save, Pencil, Copy, Trash2 } from 'lucide-react';
import { ApiError, api } from '../api/client';
import { ErrorMessage } from '../components/Feedback';
import { SchemaFields } from '../components/SchemaFields';
import { YamlPreview } from '../features/registries/YamlPreview';
import { RegistryActions } from '../features/registries/RegistryActions';
import { usePreview, type PreparedPreview } from '../features/registries/usePreview';
import { useT } from '../i18n/index';
import { SectionTabs } from '../components/SectionTabs';
import { WorkspaceCard } from '../components/WorkspaceCard';
const sections = [
  {
    title: 'Identité',
    keys: ['registry', 'formats', 'custom_formats', 'mime_types'],
    hint: 'Définissez la famille documentaire et ses formats. L’identifiant est stable et unique.',
  },
  {
    title: 'Contexte métier',
    keys: ['business_context'],
    hint: 'Expliquez à quoi sert ce document et à qui il est destiné.',
  },
  {
    title: 'Reconnaissance',
    keys: ['recognition'],
    hint: 'Combinez plusieurs signaux. Les poids sont normalisés par leur somme ; le score final reste entre 0 et 1.',
  },
  {
    title: 'Structure',
    keys: ['fields'],
    hint: 'Associez les colonnes source à des noms canoniques stables, réutilisés dans les sections suivantes.',
  },
  {
    title: 'Transformation',
    keys: ['transformation'],
    hint: 'Décrivez la stratégie du futur moteur. Les listes de champs utilisent les noms canoniques de la section Structure.',
  },
  {
    title: 'Relations',
    keys: ['relations'],
    hint: 'La source est un champ existant. La cible peut être un champ ou une entité métier nommée.',
  },
  {
    title: 'RAG',
    keys: ['rag'],
    hint: 'Configurez les futures unités de connaissance, sans exécuter de transformation ni générer d’embeddings.',
  },
  {
    title: 'Qualité',
    keys: ['quality'],
    hint: 'Définissez les seuils de reconnaissance et de revue humaine.',
  },
  {
    title: 'Aperçu YAML',
    keys: [],
    hint: 'Le contrat YAML est généré à partir de votre formulaire.',
  },
] as const;
export function LegacyEditor({
  initial,
  readOnly,
}: {
  initial?: RegistryRecord;
  readOnly: boolean;
}) {
  const t = useT();
  const navigate = useNavigate();
  const client = useQueryClient();
  const [step, setStep] = useState(0);
  const [saved, setSaved] = useState(initial);
  const [action, setAction] = useState<'clone' | 'delete'>();
  const [errors, setErrors] = useState<{ path: string; message: string }[]>([]);
  const form = useForm<Registry>({
    defaultValues: initial?.document ?? newRegistry(),
    resolver: zodResolver(registrySchema),
    mode: 'onBlur',
  });
  const values = useWatch({ control: form.control });
  const section = sections[step]!;
  const preview = usePreview(values, saved?.document.registry.id, !readOnly && step === 8);
  const mutation = useMutation({
    mutationFn: async (body: Registry) => {
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
      form.reset(record.document);
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
          <h1>{saved?.document.registry.name ?? t('Nouveau Registre')}</h1>
          <p>{saved?.path ?? 'Un contrat documentaire, de l’identité aux règles de qualité.'}</p>
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
              const parsed = registrySchema.safeParse(form.getValues());
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
                        form.reset(saved?.document ?? newRegistry());
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
            {step === 8 ? (
              <>
                <ErrorMessage error={preview.error} />
                <YamlPreview yaml={yaml} id={values.registry?.id ?? 'registry'} />
                {!readOnly && (
                  <p className="muted">
                    {preview.current && preview.data
                      ? 'Aperçu validé : ce contenu exact sera enregistré. Valable 10 minutes.'
                      : 'Aperçu du formulaire. Complétez les champs valides pour obtenir le YAML définitif.'}
                  </p>
                )}
              </>
            ) : (
              <div className="section-fields">
                {section.keys.map((key) => (
                  <SchemaFields
                    key={key}
                    schema={registryObject.shape[key]}
                    path={key}
                    disabled={readOnly}
                  />
                ))}
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
