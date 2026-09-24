import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormProvider, useController, useFieldArray, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  apiApplicationName,
  apiApplicationSchema,
  apiRegistryId,
  apiRegistryFormSchema,
  fromApiRegistry,
  newApiRegistryForm,
  stringifyYaml,
  toApiRegistry,
} from '@dtr/shared';
import type { ApiRegistry, ApiRegistryForm, ApiRegistryRecord } from '@dtr/shared';
import { ArrowLeft, Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import { api } from '../api/client';
import { ErrorMessage, Loading, Modal } from '../components/Feedback';
import { SchemaFields } from '../components/SchemaFields';
import { SectionTabs } from '../components/SectionTabs';
import { WorkspaceCard } from '../components/WorkspaceCard';
import { YamlPreview } from '../features/registries/YamlPreview';
import { useConfiguration } from '../features/configuration/queries';

interface ApiPreview {
  id: string;
  document: ApiRegistry;
  yaml: string;
}

const sections = [
  {
    title: 'Applications',
    hint: 'Déclarez les collections, endpoints et tools de chaque application.',
  },
  {
    title: 'Aperçu YAML',
    hint: 'Vérifiez le contrat exact qui sera enregistré dans registry/api.',
  },
] as const;

export function ApiRegistryEditorPage({ readOnly = false }: { readOnly?: boolean }) {
  const { id } = useParams();
  const query = useQuery({
    queryKey: ['api-registry', id],
    queryFn: () => api<ApiRegistryRecord>(`/api-registries/${id}`),
    enabled: !!id,
  });
  if (id && query.isPending) return <Loading />;
  if (query.error) return <ErrorMessage error={query.error} />;
  return (
    <ApiRegistryEditor
      key={`${id ?? 'new'}-${readOnly}`}
      initial={query.data}
      readOnly={readOnly}
    />
  );
}

function ApiRegistryEditor({
  initial,
  readOnly,
}: {
  initial?: ApiRegistryRecord;
  readOnly: boolean;
}) {
  const navigate = useNavigate();
  const client = useQueryClient();
  const [step, setStep] = useState(0);
  const [deleting, setDeleting] = useState(false);
  const form = useForm<ApiRegistryForm>({
    defaultValues: initial ? fromApiRegistry(initial.document) : newApiRegistryForm(),
    resolver: zodResolver(apiRegistryFormSchema),
    mode: 'onBlur',
  });
  const applications = useFieldArray({ control: form.control, name: 'applications' });
  const values = useWatch({ control: form.control });
  const parsed = apiRegistryFormSchema.safeParse(values);
  const prepared = parsed.success ? toApiRegistry(parsed.data) : undefined;
  const serialized = prepared ? JSON.stringify(prepared) : '';
  const preview = useQuery({
    queryKey: ['api-registry-preview', serialized],
    queryFn: () =>
      api<ApiPreview>('/api-registries/preview', {
        method: 'POST',
        body: { document: prepared },
      }),
    enabled: step === 1 && !!prepared && !readOnly,
    retry: false,
  });
  const save = useMutation({
    mutationFn: async (value: ApiRegistryForm) => {
      const document = toApiRegistry(value);
      const checked = await api<ApiPreview>('/api-registries/preview', {
        method: 'POST',
        body: { document },
      });
      return initial
        ? api<ApiRegistryRecord>(`/api-registries/${initial.id}`, {
            method: 'PUT',
            body: checked.document,
            etag: initial.etag,
          })
        : api<ApiRegistryRecord>('/api-registries', {
            method: 'POST',
            body: { document: checked.document },
          });
    },
    onSuccess: async (record) => {
      client.setQueryData(['api-registry', record.id], record);
      await client.invalidateQueries({ queryKey: ['api-registries'] });
      navigate('/apis');
    },
  });
  const remove = useMutation({
    mutationFn: () =>
      api<void>(`/api-registries/${initial!.id}`, {
        method: 'DELETE',
        etag: initial!.etag,
      }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['api-registries'] });
      navigate('/apis');
    },
  });

  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (form.formState.isDirty) event.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [form.formState.isDirty]);

  const section = sections[step]!;
  const yaml =
    readOnly && initial
      ? initial.yaml
      : (preview.data?.yaml ?? (prepared ? stringifyYaml(prepared, { lineWidth: 100 }) : ''));
  const generatedId =
    preview.data?.id ?? initial?.id ?? (prepared ? apiRegistryId(prepared) : 'api');
  return (
    <div className="workspace-page registry-workspace">
      <Link className="back-link" to="/apis">
        <ArrowLeft size={16} /> Registres API
      </Link>
      <header className="page-header">
        <div>
          <span className="eyebrow">
            API / {readOnly ? 'CONSULTATION' : initial ? 'ÉDITION' : 'CRÉATION'}
          </span>
          <h1>{initial?.id ?? 'Nouveau registre API'}</h1>
          <p>{initial ? `registry/api/${initial.path}` : 'Applications et capacités exposées.'}</p>
        </div>
        {readOnly && initial && (
          <div className="toolbar">
            <button
              className="icon-button danger-text"
              aria-label="Supprimer"
              onClick={() => setDeleting(true)}
            >
              <Trash2 size={18} />
            </button>
            <Link className="button primary" to={`/apis/${initial.id}/edit`}>
              <Pencil size={16} /> Modifier
            </Link>
          </div>
        )}
      </header>
      <FormProvider {...form}>
        <form
          className="workspace-form"
          onSubmit={form.handleSubmit((value) => save.mutate(value))}
        >
          <SectionTabs
            id="api-registry"
            label="Sections du registre API"
            items={sections.map((item, index) => ({
              id: String(index),
              label: item.title,
              number: index + 1,
            }))}
            activeId={String(step)}
            onChange={(id) => setStep(Number(id))}
          />
          <WorkspaceCard
            id="api-registry"
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
                    Précédent
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
                    Suivant
                  </button>
                </div>
                <div className="action-status" role="status">
                  {save.isSuccess ? 'Registre API enregistré' : ''}
                </div>
                {!readOnly && (
                  <div className="footer-buttons">
                    <button
                      type="button"
                      className="button"
                      disabled={save.isPending}
                      onClick={() =>
                        form.reset(
                          initial ? fromApiRegistry(initial.document) : newApiRegistryForm(),
                        )
                      }
                    >
                      Annuler
                    </button>
                    <button className="button primary" disabled={save.isPending}>
                      <Save size={16} /> {save.isPending ? 'Enregistrement…' : 'Enregistrer'}
                    </button>
                  </div>
                )}
              </>
            }
          >
            <div className="section-heading">
              <span className="eyebrow">SECTION {String(step + 1).padStart(2, '0')}</span>
              <h2>{section.title}</h2>
              <p>{section.hint}</p>
            </div>
            <ErrorMessage error={save.error ?? preview.error} />
            {step === 1 ? (
              yaml ? (
                <YamlPreview yaml={yaml} id={generatedId} />
              ) : (
                <p className="notice error">Corrigez le formulaire pour générer l’aperçu YAML.</p>
              )
            ) : (
              <div className="section-fields">
                <p className="muted">
                  Identifiant {initial ? 'du registre' : 'généré à l’enregistrement'} :{' '}
                  <code>{generatedId}</code>. Il est calculé depuis le nom de la première
                  application.
                </p>
                {applications.fields.map((field, index) => (
                  <fieldset className="field-group api-application" key={field.id}>
                    <legend>Application {index + 1}</legend>
                    {!readOnly && applications.fields.length > 1 && (
                      <button
                        type="button"
                        className="icon-button danger-text application-remove"
                        aria-label={`Retirer l'application ${index + 1}`}
                        onClick={() => applications.remove(index)}
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                    <div className="fields-grid">
                      <SchemaFields
                        schema={apiApplicationName}
                        path={`applications.${index}.name`}
                        disabled={readOnly}
                      />
                      <SchemaFields
                        schema={apiApplicationSchema.shape.collections}
                        path={`applications.${index}.collections`}
                        disabled={readOnly}
                      />
                      <SchemaFields
                        schema={apiApplicationSchema.shape.endpoint_acces}
                        path={`applications.${index}.endpoint_acces`}
                        disabled={readOnly}
                      />
                      <ToolsSelect index={index} disabled={readOnly} />
                    </div>
                  </fieldset>
                ))}
                {!readOnly && (
                  <button
                    type="button"
                    className="button subtle small"
                    onClick={() =>
                      applications.append({
                        name: `APPLICATION-${applications.fields.length + 1}`,
                        collections: [],
                        endpoint_acces: [],
                        tools: [],
                      })
                    }
                  >
                    <Plus size={15} /> Ajouter une application
                  </button>
                )}
              </div>
            )}
          </WorkspaceCard>
        </form>
      </FormProvider>
      {deleting && initial && (
        <Modal title={`Supprimer · ${initial.id}`} close={() => setDeleting(false)}>
          <p>
            Le fichier <code>registry/api/{initial.path}</code> sera supprimé.
          </p>
          <ErrorMessage error={remove.error} />
          <div className="modal-footer">
            <button className="button" onClick={() => setDeleting(false)}>
              Annuler
            </button>
            <button
              className="button danger"
              disabled={remove.isPending}
              onClick={() => remove.mutate()}
            >
              Supprimer définitivement
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function ToolsSelect({ index, disabled }: { index: number; disabled: boolean }) {
  const config = useConfiguration();
  const name = `applications.${index}.tools` as const;
  const { field, fieldState } = useController<ApiRegistryForm>({ name });
  const selected = (field.value ?? []) as string[];
  const configured = config.data?.config.options.tools ?? [];
  const choices = useMemo(() => [...new Set([...configured, ...selected])], [configured, selected]);
  return (
    <fieldset className="field-group tool-selector">
      <legend>
        Tools <span className="count">{selected.length}</span>
      </legend>
      {!disabled && (
        <select
          aria-label={`Ajouter un tool à l'application ${index + 1}`}
          value=""
          onChange={(event) => {
            if (event.target.value && !selected.includes(event.target.value))
              field.onChange([...selected, event.target.value]);
          }}
        >
          <option value="">Sélectionner un tool…</option>
          {choices
            .filter((tool) => !selected.includes(tool))
            .map((tool) => (
              <option key={tool} value={tool}>
                {tool}
              </option>
            ))}
        </select>
      )}
      <div className="selected-tools">
        {selected.map((tool) => (
          <span className="selected-tool" key={tool}>
            {tool}
            {!disabled && (
              <button
                type="button"
                aria-label={`Retirer ${tool}`}
                onClick={() => field.onChange(selected.filter((value) => value !== tool))}
              >
                <X size={13} />
              </button>
            )}
          </span>
        ))}
        {!selected.length && <small className="muted">Aucun tool sélectionné.</small>}
      </div>
      {!config.isPending && !configured.length && !disabled && (
        <small className="muted">Ajoutez des tools dans Configuration › Options.</small>
      )}
      {fieldState.error && <small className="field-error">{fieldState.error.message}</small>}
    </fieldset>
  );
}
