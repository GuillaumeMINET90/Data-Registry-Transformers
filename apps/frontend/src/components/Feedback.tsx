import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import { AlertCircle, X } from 'lucide-react';
import { useT } from '../i18n/index';
export function ErrorMessage({ error }: { error: unknown }) {
  return error ? (
    <div role="alert" className="notice error">
      <AlertCircle size={18} />
      <span>{error instanceof Error ? error.message : String(error)}</span>
    </div>
  ) : null;
}
export function Loading() {
  const t = useT();
  return (
    <div className="loading" role="status">
      {t('Chargement…')}
    </div>
  );
}
export function Modal({
  title,
  children,
  close,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog ref={ref} onCancel={close} aria-label={title}>
      <div className="modal-title">
        <h2>{title}</h2>
        <button className="icon-button" onClick={close} aria-label="Fermer">
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
