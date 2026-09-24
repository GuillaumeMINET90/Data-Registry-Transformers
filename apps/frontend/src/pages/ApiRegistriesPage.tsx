import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Braces, Download, Eye, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import type { ApiRegistryList, ApiRegistryRecord } from '@dtr/shared';
import { api, downloadText } from '../api/client';
import { ErrorMessage, Loading, Modal } from '../components/Feedback';

export function ApiRegistriesPage() {
  const client = useQueryClient();
  const [search, setSearch] = useState('');
  const [deleting, setDeleting] = useState<ApiRegistryRecord>();
  const query = useQuery({
    queryKey: ['api-registries', search],
    queryFn: ({ signal }) =>
      api<ApiRegistryList>(`/api-registries?${new URLSearchParams({ search })}`, { signal }),
    refetchInterval: 5000,
  });
  const remove = useMutation({
    mutationFn: (record: ApiRegistryRecord) =>
      api<void>(`/api-registries/${record.id}`, { method: 'DELETE', etag: record.etag }),
    onSuccess: async () => {
      setDeleting(undefined);
      await client.invalidateQueries({ queryKey: ['api-registries'] });
    },
  });
  if (query.isPending) return <Loading />;
  const data = query.data;
  return (
    <>
      <header className="page-header">
        <div>
          <span className="eyebrow">WORKSPACE / API</span>
          <h1>Registres API</h1>
          <p>Déclarez les applications, collections, points d’accès et tools disponibles.</p>
        </div>
        <Link className="button primary" to="/apis/new">
          <Plus size={18} />
          Nouveau registre API
        </Link>
      </header>
      <ErrorMessage error={query.error} />
      <section className="catalog panel">
        <div className="section-title">
          <h2>
            Tous les registres API <span className="count">{data?.total ?? 0}</span>
          </h2>
        </div>
        <div className="filter-bar">
          <label className="search">
            <Search size={16} />
            <input
              aria-label="Rechercher un registre API"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Application, collection, endpoint ou tool…"
            />
          </label>
        </div>
        {!data?.items.length ? (
          <div className="empty">
            <Braces size={38} />
            <h2>{search ? 'Aucun résultat' : 'Aucun registre API'}</h2>
            <p>
              {search
                ? 'Essayez une autre recherche.'
                : 'Créez votre premier registre pour exposer les capacités de vos applications.'}
            </p>
            {!search && (
              <Link className="button primary" to="/apis/new">
                <Plus size={16} /> Nouveau registre API
              </Link>
            )}
          </div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Registre / applications</th>
                  <th>Collections</th>
                  <th>Endpoints</th>
                  <th>Tools</th>
                  <th>Dernière modification</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((record) => {
                  const applications = Object.entries(record.document.applications);
                  const total = (key: 'collections' | 'endpoint_acces' | 'tools') =>
                    applications.reduce((sum, [, application]) => sum + application[key].length, 0);
                  return (
                    <tr key={record.id}>
                      <td>
                        <div className="registry-name">
                          <span className="document-icon">
                            <Braces size={18} />
                          </span>
                          <div>
                            <strong>{applications.map(([name]) => name).join(', ')}</strong>
                            <code>{record.id}</code>
                          </div>
                        </div>
                      </td>
                      <td>{total('collections')}</td>
                      <td>{total('endpoint_acces')}</td>
                      <td>{total('tools')}</td>
                      <td>
                        {new Intl.DateTimeFormat('fr', { dateStyle: 'medium' }).format(
                          new Date(record.updatedAt),
                        )}
                      </td>
                      <td>
                        <div className="row-actions">
                          <Link aria-label="Voir" to={`/apis/${record.id}`}>
                            <Eye size={15} />
                          </Link>
                          <Link aria-label="Modifier" to={`/apis/${record.id}/edit`}>
                            <Pencil size={15} />
                          </Link>
                          <button
                            aria-label="Télécharger YAML"
                            onClick={() => downloadText(record.yaml, `${record.id}.yml`)}
                          >
                            <Download size={15} />
                          </button>
                          <button aria-label="Supprimer" onClick={() => setDeleting(record)}>
                            <Trash2 size={15} />
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
      </section>
      {!!data?.invalid.length && (
        <section className="panel invalid-files">
          <h2>Fichiers API invalides</h2>
          {data.invalid.map((file) => (
            <details key={file.path}>
              <summary>{file.path}</summary>
              <pre>{file.error}</pre>
            </details>
          ))}
        </section>
      )}
      {deleting && (
        <Modal title={`Supprimer · ${deleting.id}`} close={() => setDeleting(undefined)}>
          <p>Cette opération supprimera le fichier :</p>
          <code className="file-path">registry/api/{deleting.path}</code>
          <ErrorMessage error={remove.error} />
          <div className="modal-footer">
            <button className="button" onClick={() => setDeleting(undefined)}>
              Annuler
            </button>
            <button
              className="button danger"
              disabled={remove.isPending}
              onClick={() => remove.mutate(deleting)}
            >
              Supprimer définitivement
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
