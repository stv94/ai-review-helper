import { useState } from 'react';
import { MergeRequest, DiffBlock } from '../types';
import { Translations } from '../translations';
import { postMessage } from '../vscode';
import MrHeader from '../components/MrHeader';

interface Props {
  t: Translations;
  mr: MergeRequest;
  diffBlocks: DiffBlock[];
  onOpenInGitLab: (url: string) => void;
}

export default function MrScreen({ t, mr, diffBlocks, onOpenInGitLab }: Props) {
  const [generating, setGenerating] = useState(false);

  function handleGenerate() {
    setGenerating(true);
    postMessage({ type: 'generateReview' });
  }

  return (
    <div className="screen">
      <MrHeader mr={mr} t={t} onOpenInGitLab={onOpenInGitLab} />

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        <button className="btn-primary" onClick={handleGenerate} disabled={generating}>
          {t.btnGenerate}
        </button>
      </div>

      <div style={{ fontSize: '0.9em', color: 'var(--vscode-descriptionForeground)', marginBottom: 12 }}>
        {t.filesChanged(diffBlocks.length)}
      </div>

      {diffBlocks.map((b) => {
        const sign = b.isNewFile ? (
          <span style={{ color: 'var(--added)' }}>+</span>
        ) : b.isDeletedFile ? (
          <span style={{ color: 'var(--removed)' }}>−</span>
        ) : (
          <span style={{ color: 'var(--vscode-descriptionForeground)' }}>~</span>
        );
        return (
          <div
            key={b.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '5px 0',
              fontFamily: 'monospace',
              fontSize: '0.88em',
              borderBottom: '1px solid var(--vscode-widget-border,#333)',
            }}
          >
            {sign}
            <span style={{ flex: 1, wordBreak: 'break-all' }}>{b.filePath}</span>
          </div>
        );
      })}
    </div>
  );
}
