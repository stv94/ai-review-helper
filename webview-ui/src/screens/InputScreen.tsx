import { useRef, KeyboardEvent } from 'react';
import { Translations } from '../translations';
import { postMessage } from '../vscode';

interface Props {
  t: Translations;
}

export default function InputScreen({ t }: Props) {
  const urlRef = useRef<HTMLInputElement>(null);
  const pathRef = useRef<HTMLInputElement>(null);
  const iidRef = useRef<HTMLInputElement>(null);

  function loadByUrl() {
    const url = urlRef.current?.value.trim();
    if (!url) return;
    postMessage({ type: 'loadMR', mrUrl: url });
  }

  function loadByIds() {
    const path = pathRef.current?.value.trim();
    const iid = parseInt(iidRef.current?.value ?? '', 10);
    if (!path || !iid) return;
    postMessage({ type: 'loadMRByIds', projectPath: path, mrIid: iid });
  }

  function onUrlKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') loadByUrl();
  }

  function onIidKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') loadByIds();
  }

  return (
    <div className="screen">
      <div className="input-card">
        <h2>{t.cardTitle}</h2>
        <p>{t.cardSubtitle}</p>

        <div className="input-section">
          <label className="input-label">{t.urlLabel}</label>
          <div className="url-row">
            <input
              ref={urlRef}
              type="text"
              placeholder={t.urlPlaceholder}
              onKeyDown={onUrlKeyDown}
            />
            <button className="btn-primary" onClick={loadByUrl}>
              {t.btnLoad}
            </button>
          </div>
        </div>

        <div className="divider">{t.orDivider}</div>

        <div className="input-section">
          <label className="input-label">{t.idsLabel}</label>
          <div className="ids-row">
            <div className="field">
              <label>{t.pathLabel}</label>
              <input ref={pathRef} type="text" placeholder="group/project" />
            </div>
            <div className="field" style={{ maxWidth: 120 }}>
              <label>{t.iidLabel}</label>
              <input ref={iidRef} type="number" placeholder="42" min={1} onKeyDown={onIidKeyDown} />
            </div>
            <button className="btn-primary" onClick={loadByIds}>
              {t.btnLoad}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
