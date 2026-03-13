import { useState } from 'react';
import { MergeRequest, DiffBlock, ApprovalState, GitLabNote } from '../types';
import { Translations } from '../translations';
import { postMessage } from '../vscode';
import MrHeader from '../components/MrHeader';
import CommentsPanel from '../components/CommentsPanel';

interface Props {
  t: Translations;
  mr: MergeRequest;
  diffBlocks: DiffBlock[];
  approvalState: ApprovalState | null;
  notes: GitLabNote[];
  currentUserId: number | null;
  onOpenInGitLab: (url: string) => void;
  onApprove: () => void;
  onRevoke: () => void;
  onAddComment: (body: string) => void;
  onDeleteComment: (noteId: number) => void;
}

export default function MrScreen({
  t, mr, diffBlocks, approvalState, notes, currentUserId,
  onOpenInGitLab, onApprove, onRevoke, onAddComment, onDeleteComment,
}: Props) {
  const [generating, setGenerating] = useState(false);

  function handleGenerate() {
    setGenerating(true);
    postMessage({ type: 'generateReview' });
  }

  return (
    <div className="screen">
      <MrHeader
        mr={mr}
        t={t}
        onOpenInGitLab={onOpenInGitLab}
        approvalState={approvalState}
        currentUserId={currentUserId}
        onApprove={onApprove}
        onRevoke={onRevoke}
      />

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

      <div style={{ marginTop: 20 }}>
        <CommentsPanel
          t={t}
          notes={notes}
          currentUserId={currentUserId}
          onAddComment={onAddComment}
          onDeleteComment={onDeleteComment}
        />
      </div>
    </div>
  );
}
