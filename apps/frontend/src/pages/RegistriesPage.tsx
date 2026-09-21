import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  ArrowUpRight,
  Plus,
  Search,
  LayoutGrid,
  List,
  FileCode2,
  Copy,
  Trash2,
  Download,
  Pencil,
  FolderOpen,
  RefreshCw,
} from 'lucide-react';
import type { RegistryList, RegistryRecord } from '@dtr/shared';
import { formats } from '@dtr/shared';
import { api } from '../api/client';
import { ErrorMessage, Loading } from '../components/Feedback';
import { RegistryActions } from '../features/registries/RegistryActions';
import { useConfiguration } from '../features/configuration/queries';
import { useT } from '../i18n/index';
export function RegistriesPage() {
  const t = useT();
  const config = useConfiguration();
  const [filters, setFilters] = useState<Record<string, string>>({
    sort: 'updated_at',
    direction: 'desc',
  });
  const [page, setPage] = useState(1);
  const [view, setView] = useState<'list' | 'cards'>();
  const [action, setAction] = useState<{ record: RegistryRecord; action: 'clone' | 'delete' }>();
  const params = new URLSearchParams({
    ...Object.fromEntries(Object.entries(filters).filter(([, value]) => value)),
    page: String(page),
    pageSize: String(config.data?.config.interface.page_size ?? 20),
  });
  const query = useQuery({
    queryKey: ['registries', params.toString()],
    queryFn: ({ signal }) => api<RegistryList>(`/registries?${params}`, { signal }),
    refetchInterval: 5000,
  });
  const filter = (key: string, value: string) => {
    setFilters((old) => ({ ...old, [key]: value }));
    setPage(1);
  };
  const data = query.data;
  const currentView = view ?? config.data?.config.interface.default_view ?? 'list';
  const date = (value?: string) =>
    value
      ? new Intl.DateTimeFormat(config.data?.config.language ?? 'fr', {
          dateStyle: 'medium',
          timeZone: config.data?.config.timezone ?? 'Europe/Paris',
        }).format(new Date(value))
      : '—';
  return (
    <>
      <header className="page-header">
        <div>
          <span className="eyebrow">WORKSPACE / REGISTRIES</span>
          <h1>{t('Référentiel documentaire')}</h1>
          <p>{t('Décrivez vos documents. Structurez leur transformation.')}</p>
        </div>
        <Link className="button primary" to="/registries/new">
          <Plus size={18} />
          {t('Nouveau Registry')}
        </Link>
      </header>
      {config.data && !config.data.config.setup_completed && (
        <div className="notice setup">
          <div>
            <strong>{t('Bienvenue dans votre référentiel')}</strong>
            <p>
              {t(
                'Vérifiez le dossier de données et les réglages avant de créer votre premier Registry.',
              )}
            </p>
          </div>
          <Link className="button small" to="/configuration">
            {t('Configuration')}
            <ArrowUpRight size={16} />
          </Link>
        </div>
      )}
      <div className="stats">
        <div>
          <span>{t('Tous les Registries')}</span>
          <strong>{data?.stats.total ?? '—'}</strong>
          <small>Contrats documentaires</small>
        </div>
        <div>
          <span>
            <i className="dot green" />
            {t('Actifs')}
          </span>
          <strong>{data?.stats.active ?? '—'}</strong>
          <small>Prêts pour la transformation</small>
        </div>
        <div>
          <span>
            <i className="dot amber" />
            {t('Brouillons')}
          </span>
          <strong>{data?.stats.draft ?? '—'}</strong>
          <small>En cours de définition</small>
        </div>
        <div>
          <span>{t('Services')}</span>
          <strong>{data?.departments.length ?? '—'}</strong>
          <small>Domaines représentés</small>
        </div>
      </div>
      <section className="catalog panel">
        <div className="section-title">
          <h2>
            {t('Tous les Registries')} <span className="count">{data?.total ?? 0}</span>
          </h2>
          <div className="toolbar">
            <button
              aria-label="Actualiser"
              className="icon-button"
              onClick={() => {
                void query.refetch();
              }}
            >
              <RefreshCw size={16} />
            </button>
            <button
              aria-label={t('Liste')}
              className={`icon-button ${currentView === 'list' ? 'chosen' : ''}`}
              onClick={() => setView('list')}
            >
              <List size={18} />
            </button>
            <button
              aria-label={t('Cartes')}
              className={`icon-button ${currentView === 'cards' ? 'chosen' : ''}`}
              onClick={() => setView('cards')}
            >
              <LayoutGrid size={17} />
            </button>
          </div>
        </div>
        <div className="filter-bar">
          <div className="search">
            <Search size={18} />
            <input
              aria-label="Recherche"
              placeholder={t('Rechercher un nom, un identifiant, un mot-clé…')}
              value={filters.search ?? ''}
              onChange={(e) => filter('search', e.target.value)}
            />
          </div>
          <select
            aria-label={t('Service')}
            value={filters.department ?? ''}
            onChange={(e) => filter('department', e.target.value)}
          >
            <option value="">{t('Tous les services')}</option>
            {data?.departments.map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
          <select
            aria-label={t('Statut')}
            value={filters.status ?? ''}
            onChange={(e) => filter('status', e.target.value)}
          >
            <option value="">{t('Tous les statuts')}</option>
            <option value="active">{t('actif')}</option>
            <option value="draft">{t('brouillon')}</option>
            <option value="deprecated">{t('déprécié')}</option>
          </select>
        </div>
        <div className="secondary-filters">
          <select
            aria-label="Famille"
            value={filters.family ?? ''}
            onChange={(e) => filter('family', e.target.value)}
          >
            <option value="">{t('Toutes les familles')}</option>
            {data?.families.map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
          <select
            aria-label="Format"
            value={filters.format ?? ''}
            onChange={(e) => filter('format', e.target.value)}
          >
            <option value="">{t('Tous les formats')}</option>
            {formats.map((v) => (
              <option key={v} value={v}>
                {v.toUpperCase()}
              </option>
            ))}
          </select>
          <select
            aria-label="Tag"
            value={filters.tag ?? ''}
            onChange={(e) => filter('tag', e.target.value)}
          >
            <option value="">{t('Tous les tags')}</option>
            {data?.tags.map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
          <select
            aria-label="Tri"
            value={filters.sort}
            onChange={(e) => filter('sort', e.target.value)}
          >
            <option value="updated_at">{t('Dernière modification')}</option>
            <option value="name">{t('Nom')}</option>
            <option value="department">{t('Service')}</option>
          </select>
          <select
            aria-label="Ordre"
            value={filters.direction}
            onChange={(e) => filter('direction', e.target.value)}
          >
            <option value="desc">↓ Descendant</option>
            <option value="asc">↑ Ascendant</option>
          </select>
        </div>
        <ErrorMessage error={query.error} />
        {query.isPending ? (
          <Loading />
        ) : data && data.items.length === 0 ? (
          <div className="empty">
            <FolderOpen size={38} />
            <h2>{t(data.stats.total ? 'Aucun résultat' : 'Aucun Registry pour le moment')}</h2>
            <p>
              {t(
                data.stats.total
                  ? 'Essayez de modifier vos filtres.'
                  : 'Créez votre premier contrat documentaire pour commencer votre catalogue.',
              )}
            </p>
            <Link className="button primary" to="/registries/new">
              <Plus size={17} />
              {t('Nouveau Registry')}
            </Link>
          </div>
        ) : (
          <div className={currentView === 'cards' ? 'registry-cards' : 'table-scroll'}>
            <table className={currentView === 'cards' ? 'cards-table' : ''}>
              <thead>
                <tr>
                  <th>{t('Nom')}</th>
                  <th>{t('Service')}</th>
                  <th>{t('Statut')}</th>
                  <th>Formats</th>
                  <th>{t('Dernière modification')}</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data?.items.map((record) => {
                  const r = record.document.registry;
                  return (
                    <tr key={r.id}>
                      <td>
                        <Link className="registry-name" to={`/registries/${r.id}`}>
                          <span className="document-icon">
                            <FileCode2 size={20} />
                          </span>
                          <span>
                            <strong>{r.name}</strong>
                            <code>{r.id}</code>
                          </span>
                        </Link>
                        <small className="family">
                          {r.family || '—'} · v{r.version}
                        </small>
                      </td>
                      <td>
                        <span className="department">{r.department}</span>
                      </td>
                      <td>
                        <span className={`badge ${r.status}`}>
                          <i className="dot" />
                          {t(
                            r.status === 'active'
                              ? 'actif'
                              : r.status === 'draft'
                                ? 'brouillon'
                                : 'déprécié',
                          )}
                        </span>
                      </td>
                      <td>
                        <div className="format-list">
                          {record.document.formats.map((format) => (
                            <span className="format" key={format}>
                              {format.toUpperCase()}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="muted">{date(record.document.metadata?.updated_at)}</td>
                      <td>
                        <div className="row-actions">
                          <Link
                            aria-label={`${t('Modifier')} ${r.name}`}
                            title={t('Modifier')}
                            to={`/registries/${r.id}/edit`}
                          >
                            <Pencil size={16} />
                          </Link>
                          <button
                            aria-label={`${t('Cloner')} ${r.name}`}
                            title={t('Cloner')}
                            onClick={() => setAction({ record, action: 'clone' })}
                          >
                            <Copy size={16} />
                          </button>
                          <a
                            aria-label={`${t('Télécharger YAML')} ${r.name}`}
                            title={t('Télécharger YAML')}
                            href={`/api/registries/${r.id}/download`}
                          >
                            <Download size={16} />
                          </a>
                          <button
                            aria-label={`${t('Supprimer')} ${r.name}`}
                            title={t('Supprimer')}
                            onClick={() => setAction({ record, action: 'delete' })}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <footer className="pagination">
          <span>
            {data?.total ?? 0} Registry · {data?.page ?? page} / {data?.pages ?? 1}
          </span>
          <div>
            <button className="button small" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              {t('Précédent')}
            </button>
            <button
              className="button small"
              disabled={page >= (data?.pages ?? 1)}
              onClick={() => setPage(page + 1)}
            >
              {t('Suivant')}
            </button>
          </div>
        </footer>
      </section>
      {!!data?.invalid.length && (
        <section className="invalid-files panel">
          <h2>
            Fichiers à vérifier <span className="count">{data.invalid.length}</span>
          </h2>
          <p className="muted">
            Ces fichiers restent sur disque. Corrigez-les sur le serveur pour les rendre
            disponibles.
          </p>
          {data.invalid.map((file) => (
            <details key={file.path}>
              <summary>{file.path}</summary>
              <pre>{file.error}</pre>
            </details>
          ))}
        </section>
      )}
      {action && <RegistryActions {...action} close={() => setAction(undefined)} />}
    </>
  );
}
