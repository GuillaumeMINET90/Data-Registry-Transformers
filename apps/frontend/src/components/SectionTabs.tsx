interface SectionTab {
  id: string;
  label: string;
  number?: number;
}
interface SectionTabsProps {
  id: string;
  label: string;
  items: readonly SectionTab[];
  activeId: string;
  onChange: (id: string) => void;
}

export function SectionTabs({ id, label, items, activeId, onChange }: SectionTabsProps) {
  return (
    <div className="section-tabs" role="tablist" aria-label={label}>
      {items.map((item, index) => (
        <button
          key={item.id}
          id={`${id}-tab-${item.id}`}
          type="button"
          role="tab"
          aria-selected={activeId === item.id}
          aria-controls={`${id}-panel-${item.id}`}
          tabIndex={activeId === item.id ? 0 : -1}
          onClick={() => onChange(item.id)}
          onKeyDown={(event) => {
            let next: number;
            if (event.key === 'ArrowRight') next = (index + 1) % items.length;
            else if (event.key === 'ArrowLeft') next = (index - 1 + items.length) % items.length;
            else if (event.key === 'Home') next = 0;
            else if (event.key === 'End') next = items.length - 1;
            else return;
            event.preventDefault();
            onChange(items[next]!.id);
            const button =
              event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
                '[role="tab"]',
              )[next];
            button?.focus({ preventScroll: true });
            button?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
          }}
        >
          {item.number !== undefined && (
            <span className="tab-number">{String(item.number).padStart(2, '0')}</span>
          )}
          {item.label}
        </button>
      ))}
    </div>
  );
}
