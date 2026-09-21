import type { ReactNode } from 'react';

export function WorkspaceCard({
  id,
  section,
  children,
  footer,
}: {
  id: string;
  section: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <section className="panel workspace-card">
      <div
        key={section}
        id={`${id}-panel-${section}`}
        role="tabpanel"
        aria-labelledby={`${id}-tab-${section}`}
        tabIndex={0}
        className="card-scroll"
      >
        {children}
      </div>
      <footer className="workspace-actions">{footer}</footer>
    </section>
  );
}
