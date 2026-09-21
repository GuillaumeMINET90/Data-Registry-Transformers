import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import type { RegistryRecord } from '@dtr/shared';
import { normalizeId } from '@dtr/shared';
import { api } from '../../api/client';
import { ErrorMessage, Modal } from '../../components/Feedback';
import { useT } from '../../i18n/index';
export function RegistryActions({
  record,
  action,
  close,
}: {
  record: RegistryRecord;
  action: 'clone' | 'delete';
  close: () => void;
}) {
  const t = useT();
  const query = useQueryClient();
  const navigate = useNavigate();
  const registry = record.document.registry;
  const { register, handleSubmit, setValue } = useForm({
    defaultValues: {
      id: `${registry.id}_copie`,
      name: `${registry.name} — copie`,
      department: registry.department,
      version: '1.0.0',
    },
  });
  const [confirmed, setConfirmed] = useState(false);
  const mutation = useMutation<RegistryRecord | void, Error, unknown>({
    mutationFn: (body?: unknown) =>
      action === 'clone'
        ? api<RegistryRecord>(`/registries/${registry.id}/clone`, { method: 'POST', body })
        : api<void>(`/registries/${registry.id}`, { method: 'DELETE', etag: record.etag }),
    onSuccess: async (result) => {
      await query.invalidateQueries({ queryKey: ['registries'] });
      close();
      if (result) navigate(`/registries/${result.document.registry.id}/edit`);
      else navigate('/registries');
    },
  });
  return (
    <Modal
      title={`${t(action === 'clone' ? 'Cloner' : 'Supprimer')} · ${registry.name}`}
      close={close}
    >
      {action === 'clone' ? (
        <form onSubmit={handleSubmit((values) => mutation.mutate(values))}>
          <div className="fields-grid">
            <label className="form-field">
              {t('Nom')}
              <input {...register('name', { required: true })} />
            </label>
            <label className="form-field">
              {t('Identifiant')}
              <input
                {...register('id', { required: true })}
                onBlur={(e) => setValue('id', normalizeId(e.target.value))}
              />
            </label>
            <label className="form-field">
              {t('Service')}
              <input {...register('department', { required: true })} />
            </label>
            {!record.document.simple_contract && (
              <label className="form-field">
                Version
                <input {...register('version', { required: true })} />
              </label>
            )}
          </div>
          <p className="muted">
            Le clone sera un brouillon indépendant. Toutes les règles seront conservées.
          </p>
          <ErrorMessage error={mutation.error} />
          <div className="modal-footer">
            <button type="button" className="button" onClick={close}>
              {t('Annuler')}
            </button>
            <button className="button primary" disabled={mutation.isPending}>
              {t('Cloner')}
            </button>
          </div>
        </form>
      ) : (
        <>
          <p>Cette opération supprimera le fichier :</p>
          <code className="file-path">{record.path}</code>
          <label className="confirm-check">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            Je confirme la suppression de ce Registry.
          </label>
          <ErrorMessage error={mutation.error} />
          <div className="modal-footer">
            <button className="button" onClick={close}>
              {t('Annuler')}
            </button>
            <button
              className="button danger"
              disabled={!confirmed || mutation.isPending}
              onClick={() => mutation.mutate(undefined)}
            >
              Supprimer définitivement
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
