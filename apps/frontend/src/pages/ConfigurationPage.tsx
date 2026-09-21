import { useState } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { configSchema } from '@dtr/shared';
import type { AppConfig, ConfigResponse, StorageStatus } from '@dtr/shared';
import { Save, FolderOpen, CheckCircle2 } from 'lucide-react';
import { useConfiguration } from '../features/configuration/queries';
import { api } from '../api/client';
import { ErrorMessage, Loading, Modal } from '../components/Feedback';
import { SchemaFields } from '../components/SchemaFields';
import { useT } from '../i18n/index';
import { SectionTabs } from '../components/SectionTabs';
import { WorkspaceCard } from '../components/WorkspaceCard';
const configurationSections = [
  'Général',
  'Stockage',
  'Registries',
  'Interface',
  'Sécurité',
] as const;
export function ConfigurationPage() {
  const query = useConfiguration();
  if (query.isPending) return <Loading />;
  if (query.error || !query.data) return <ErrorMessage error={query.error} />;
  return <ConfigurationForm key={query.data.storage.path} data={query.data} />;
}
function ConfigurationForm({ data: initial }: { data: ConfigResponse }) {
  const [data, setData] = useState(initial);
  const t = useT();
  const client = useQueryClient();
  const [rootModal, setRootModal] = useState(false);
  const [notice, setNotice] = useState('');
  const [section, setSection] = useState('0');
  const form = useForm<AppConfig>({
    defaultValues: data.config,
    resolver: zodResolver(configSchema),
  });
  const save = form.handleSubmit(
    (values) => mutation.mutate(values),
    (errors) => {
      setSection(errors.registry ? '2' : errors.interface ? '3' : '0');
    },
  );
  const mutation = useMutation({
    mutationFn: (body: AppConfig) =>
      api<Omit<ConfigResponse, 'security'>>('/config', { method: 'PUT', body, etag: data.etag }),
    onSuccess: async (result) => {
      setData({ ...data, ...result });
      form.reset(result.config);
      setNotice(t('Configuration enregistrée'));
      await client.invalidateQueries({ queryKey: ['config'] });
    },
  });
  return (
    <div className="workspace-page">
      <header className="page-header">
        <div>
          <span className="eyebrow">WORKSPACE / CONFIGURATION</span>
          <h1>{t('Configuration')}</h1>
          <p>Les réglages de votre application et de votre stockage documentaire.</p>
        </div>
      </header>
      <FormProvider {...form}>
        <form className="workspace-form configuration" onSubmit={save}>
          <SectionTabs
            id="configuration"
            label="Sections de configuration"
            items={configurationSections.map((title, index) => ({
              id: String(index),
              label: t(title),
            }))}
            activeId={section}
            onChange={setSection}
          />
          <WorkspaceCard
            id="configuration"
            section={section}
            footer={
              <>
                <div className="action-status" role="status">
                  {notice}
                </div>
                <div className="footer-buttons">
                  {!data.config.setup_completed && (
                    <button
                      type="button"
                      className="button setup-complete"
                      disabled={mutation.isPending}
                      onClick={() => {
                        form.setValue('setup_completed', true);
                        void save();
                      }}
                    >
                      {t('Terminer la configuration')}
                    </button>
                  )}
                  <button
                    type="button"
                    className="button"
                    disabled={mutation.isPending}
                    onClick={() => {
                      form.reset(data.config);
                      mutation.reset();
                      setNotice(t('Modifications annulées'));
                    }}
                  >
                    {t('Annuler')}
                  </button>
                  <button className="button primary" disabled={mutation.isPending}>
                    <Save size={17} />
                    {t('Enregistrer')}
                  </button>
                </div>
              </>
            }
          >
            <ErrorMessage error={mutation.error} />
            {Object.keys(form.formState.errors).length > 0 && (
              <div className="notice error" role="alert">
                Vérifiez les champs signalés dans le formulaire.
              </div>
            )}
            {section === '0' && (
              <section className="settings-section">
                <h2>{t('Général')}</h2>
                <div className="fields-grid">
                  {(['application_name', 'language', 'timezone'] as const).map((key) => (
                    <SchemaFields key={key} schema={configSchema.shape[key]} path={key} />
                  ))}
                </div>
              </section>
            )}
            {section === '1' && (
              <section className="settings-section">
                <h2>{t('Stockage')}</h2>
                <div className="storage-path">
                  <FolderOpen size={22} />
                  <code>{data.storage.path}</code>
                  <span className="badge active">
                    <CheckCircle2 size={14} />
                    {data.storage.available ? 'Disponible' : 'Indisponible'}
                  </span>
                </div>
                <div className="storage-details">
                  <span>Lecture : {data.storage.readable ? '✓' : '✗'}</span>
                  <span>Écriture : {data.storage.writable ? '✓' : '✗'}</span>
                  <span>{data.storage.registryCount} fichiers YAML</span>
                </div>
                <p>
                  <code>{data.storage.directories.registry}/</code> : registres ·{' '}
                  <code>{data.storage.directories.config}/</code> : configuration, sauvegardes et
                  audit
                </p>
                <button className="button" type="button" onClick={() => setRootModal(true)}>
                  {t('Changer le dossier de données')}
                </button>
              </section>
            )}
            {section === '2' && (
              <section className="settings-section">
                <h2>{t('Registries')}</h2>
                <SchemaFields schema={configSchema.shape.registry} path="registry" />
              </section>
            )}
            {section === '3' && (
              <section className="settings-section">
                <h2>{t('Interface')}</h2>
                <SchemaFields schema={configSchema.shape.interface} path="interface" />
              </section>
            )}
            {section === '4' && (
              <section className="settings-section">
                <h2>{t('Sécurité')}</h2>
                <p>Durée de session : {data.security.session_ttl_seconds / 3600} h</p>
                <p>Cookie Secure : {data.security.cookie_secure ? 'activé' : 'désactivé'}</p>
                <p className="muted">
                  Ces paramètres sont définis dans l’environnement du serveur.
                </p>
              </section>
            )}
          </WorkspaceCard>
        </form>
      </FormProvider>
      {rootModal && <RootModal storage={data.storage} close={() => setRootModal(false)} />}
    </div>
  );
}
function RootModal({ close, storage }: { close: () => void; storage: StorageStatus }) {
  const t = useT();
  const client = useQueryClient();
  const [path, setPath] = useState(storage.path);
  const [mode, setMode] = useState<'new' | 'existing'>('new');
  const [confirmed, setConfirmed] = useState(false);
  const test = useMutation({
    mutationFn: () =>
      api<StorageStatus>('/config/data-root/test', { method: 'POST', body: { path } }),
  });
  const change = useMutation({
    mutationFn: () => api('/config/data-root/change', { method: 'POST', body: { path, mode } }),
    onSuccess: async () => {
      await client.invalidateQueries();
      close();
    },
  });
  return (
    <Modal title={t('Changer le dossier de données')} close={close}>
      <p>
        {t(
          'Les données du dossier actuel restent à leur emplacement. Aucun déplacement automatique.',
        )}
      </p>
      <label className="form-field">
        Dossier parent du stockage
        <input
          value={path}
          onChange={(e) => {
            setPath(e.target.value);
            test.reset();
            setConfirmed(false);
          }}
          placeholder={storage.path}
        />
      </label>
      <p>
        Ce dossier contiendra <code>registry/</code> pour les registres et <code>config/</code>
        pour la configuration, les sauvegardes et l’audit.
      </p>
      {storage.path !== storage.serverPath && (
        <p>
          Docker : <code>{storage.path}</code> correspond à <code>{storage.serverPath}</code>
          dans le conteneur. Un autre dossier Windows nécessite un montage dans Docker Compose.
        </p>
      )}
      <label className="form-field">
        Opération
        <select value={mode} onChange={(e) => setMode(e.target.value as 'new' | 'existing')}>
          <option value="new">Créer un stockage (dossier absent ou vide)</option>
          <option value="existing">{t('Utiliser un dossier existant')}</option>
        </select>
      </label>
      <button className="button" onClick={() => test.mutate()} disabled={!path || test.isPending}>
        {t('Tester le dossier')}
      </button>
      {test.data && (
        <p role="status">
          {test.data.available
            ? `Dossier présent · Lecture ${test.data.readable ? '✓' : '✗'} · Écriture ${test.data.writable ? '✓' : '✗'} · ${test.data.registryCount} YAML`
            : 'Dossier absent : il sera créé en mode nouveau dossier.'}
        </p>
      )}
      <ErrorMessage error={test.error} />
      <label className="confirm-check">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
        />
        Je confirme le changement de dossier actif.
      </label>
      <ErrorMessage error={change.error} />
      <div className="modal-footer">
        <button className="button" onClick={close}>
          {t('Annuler')}
        </button>
        <button
          className="button primary"
          onClick={() => change.mutate()}
          disabled={!confirmed || !path || change.isPending}
        >
          Changer le dossier
        </button>
      </div>
    </Modal>
  );
}
