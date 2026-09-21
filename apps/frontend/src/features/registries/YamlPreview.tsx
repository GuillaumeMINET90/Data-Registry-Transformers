import { useState } from 'react';
import { Copy, Download } from 'lucide-react';
import { downloadText } from '../../api/client';
import { useT } from '../../i18n/index';
import { ErrorMessage } from '../../components/Feedback';
export function YamlPreview({ yaml, id }: { yaml: string; id: string }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<unknown>();
  return (
    <div className="yaml-preview">
      <div className="yaml-toolbar">
        <code>{id.replaceAll('_', '-')}.yml</code>
        <div>
          <button
            type="button"
            className="button small"
            onClick={() => {
              navigator.clipboard
                .writeText(yaml)
                .then(() => setCopied(true))
                .catch(setError);
            }}
          >
            <Copy size={14} />
            {t(copied ? 'Copié' : 'Copier')}
          </button>
          <button
            type="button"
            className="button small"
            onClick={() => downloadText(yaml, `${id}.yml`)}
          >
            <Download size={14} />
            {t('Télécharger YAML')}
          </button>
        </div>
      </div>
      <ErrorMessage error={error} />
      <pre>
        {yaml.split('\n').map((line, index) => {
          const match = /^(\s*-?\s*)([a-zA-Z_]+)(:)(.*)$/.exec(line);
          return (
            <div key={index}>
              <span className="line-number">{index + 1}</span>
              {match ? (
                <>
                  {match[1]}
                  <span className="yaml-key">{match[2]}</span>
                  {match[3]}
                  <span className="yaml-value">{match[4]}</span>
                </>
              ) : (
                line
              )}
            </div>
          );
        })}
      </pre>
    </div>
  );
}
