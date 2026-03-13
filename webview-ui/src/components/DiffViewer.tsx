import { memo, useState, Fragment } from 'react';
import { ParsedDiff, DiffHunk, DiffLine, GitLabDiscussion, GitLabDiscussionPosition, DiffRefs } from '../types';
import { Translations } from '../translations';

type DiffMode = 'inline' | 'split';
type LineKey = string; // "new:42" or "old:15"

// ---- Props ----
interface Props {
  parsedDiff: ParsedDiff;
  context: string;
  mode: DiffMode;
  onModeChange: (diffId: string, mode: DiffMode) => void;
  mrWebUrl: string;
  t: Translations;
  onOpenInGitLab: (url: string) => void;
  // inline comment props (optional — graceful degradation if absent)
  discussions?: GitLabDiscussion[];
  diffRefs?: DiffRefs | null;
  currentUserId?: number | null;
  onAddInlineComment?: (body: string, position: GitLabDiscussionPosition) => void;
  onDeleteInlineComment?: (discussionId: string, noteId: number) => void;
}

// ---- Helpers ----

function buildSplitPairs(lines: DiffLine[]): [DiffLine | null, DiffLine | null][] {
  const pairs: [DiffLine | null, DiffLine | null][] = [];
  let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (l.type === 'context') {
      pairs.push([l, l]);
      i++;
    } else if (l.type === 'removed') {
      const next = lines[i + 1];
      if (next && next.type === 'added') {
        pairs.push([l, next]);
        i += 2;
      } else {
        pairs.push([l, null]);
        i++;
      }
    } else if (l.type === 'added') {
      pairs.push([null, l]);
      i++;
    } else {
      i++;
    }
  }
  return pairs;
}

function getLineKey(line: DiffLine): LineKey | null {
  if (line.type === 'removed') {
    return line.oldLineNumber != null ? `old:${line.oldLineNumber}` : null;
  }
  return line.newLineNumber != null ? `new:${line.newLineNumber}` : null;
}

function buildDiscussionMap(
  discussions: GitLabDiscussion[],
  oldPath: string,
  newPath: string
): Map<LineKey, GitLabDiscussion[]> {
  const map = new Map<LineKey, GitLabDiscussion[]>();
  for (const d of discussions) {
    const pos = d.notes[0]?.position;
    if (!pos) continue;
    if (pos.old_path !== oldPath && pos.new_path !== newPath) continue;
    const key: LineKey =
      pos.new_line != null ? `new:${pos.new_line}` :
      pos.old_line != null ? `old:${pos.old_line}` : '';
    if (!key) continue;
    const arr = map.get(key) ?? [];
    arr.push(d);
    map.set(key, arr);
  }
  return map;
}

function buildPosition(
  line: DiffLine,
  diffRefs: DiffRefs,
  oldPath: string,
  newPath: string
): GitLabDiscussionPosition {
  return {
    base_sha: diffRefs.base_sha,
    start_sha: diffRefs.start_sha,
    head_sha: diffRefs.head_sha,
    old_path: oldPath,
    new_path: newPath,
    position_type: 'text',
    old_line: line.type === 'removed' ? line.oldLineNumber : null,
    new_line: line.type !== 'removed' ? line.newLineNumber : null,
  };
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric',
    });
  } catch {
    return iso;
  }
}

// ---- Thread row (rendered as a <tr> spanning all columns) ----
interface ThreadRowProps {
  discussions: GitLabDiscussion[];
  currentUserId: number | null | undefined;
  colSpan: number;
  composing: boolean;
  t: Translations;
  onSubmit: (body: string) => void;
  onCloseCompose: () => void;
  onDelete: (discussionId: string, noteId: number) => void;
}

function ThreadRow({
  discussions, currentUserId, colSpan, composing, t,
  onSubmit, onCloseCompose, onDelete,
}: ThreadRowProps) {
  const [body, setBody] = useState('');
  const [confirmKey, setConfirmKey] = useState<string | null>(null);

  const humanNotes = discussions.flatMap((d) =>
    d.notes.filter((n) => !n.system).map((n) => ({ disc: d, note: n }))
  );

  function handlePost() {
    if (!body.trim()) return;
    onSubmit(body.trim());
    setBody('');
  }

  if (humanNotes.length === 0 && !composing) return null;

  return (
    <tr className="inline-thread-row">
      <td colSpan={colSpan} className="inline-thread-cell">
        {humanNotes.map(({ disc, note }) => {
          const isOwn = currentUserId != null && note.author.id === currentUserId;
          const cKey = `${disc.id}:${note.id}`;
          return (
            <div key={`${disc.id}-${note.id}`} className={`inline-note${isOwn ? ' inline-note-own' : ''}`}>
              <div className="inline-note-header">
                <span className="inline-note-author">{note.author.name}</span>
                <span className="inline-note-date">{fmtDate(note.created_at)}</span>
                {isOwn && (
                  <span className="inline-note-actions">
                    {confirmKey === cKey ? (
                      <>
                        <span className="comment-confirm-label">{t.confirmDelete}</span>
                        <button
                          className="btn-ghost btn-xs comment-confirm-yes"
                          onClick={() => { onDelete(disc.id, note.id); setConfirmKey(null); }}
                        >✓</button>
                        <button className="btn-ghost btn-xs" onClick={() => setConfirmKey(null)}>✗</button>
                      </>
                    ) : (
                      <button
                        className="btn-ghost btn-xs"
                        onClick={() => setConfirmKey(cKey)}
                      >✕</button>
                    )}
                  </span>
                )}
              </div>
              <div className="inline-note-body">{note.body}</div>
            </div>
          );
        })}

        {composing && (
          <div className="inline-compose">
            <textarea
              className="inline-compose-textarea"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={t.inlineCommentPlaceholder}
              rows={3}
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handlePost();
                if (e.key === 'Escape') onCloseCompose();
              }}
            />
            <div className="inline-compose-actions">
              <button className="btn-primary btn-sm" disabled={!body.trim()} onClick={handlePost}>
                {t.postInlineComment}
              </button>
              <button className="btn-ghost btn-sm" onClick={onCloseCompose}>
                {t.cancelInlineComment}
              </button>
            </div>
          </div>
        )}
      </td>
    </tr>
  );
}

// ---- Inline mode hunk ----
interface HunkCommonProps {
  discMap: Map<LineKey, GitLabDiscussion[]>;
  diffRefs: DiffRefs | null | undefined;
  oldPath: string;
  newPath: string;
  currentUserId: number | null | undefined;
  t: Translations;
  onAddInlineComment: ((body: string, pos: GitLabDiscussionPosition) => void) | undefined;
  onDeleteInlineComment: ((discussionId: string, noteId: number) => void) | undefined;
}

function HunkInlineView({ hunk, discMap, diffRefs, oldPath, newPath, currentUserId, t, onAddInlineComment, onDeleteInlineComment }: { hunk: DiffHunk } & HunkCommonProps) {
  const [composingKey, setComposingKey] = useState<LineKey | null>(null);
  const canComment = !!diffRefs && !!onAddInlineComment;

  function handleSubmit(_key: LineKey, line: DiffLine, body: string) {
    if (!diffRefs || !onAddInlineComment) return;
    onAddInlineComment(body, buildPosition(line, diffRefs, oldPath, newPath));
    setComposingKey(null);
  }

  return (
    <table>
      <tbody>
        {hunk.lines.map((line, i) => {
          if (line.type === 'header') return null;
          const cls = line.type === 'added' ? 'line-added' : line.type === 'removed' ? 'line-removed' : '';
          const sign = line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' ';
          const key = getLineKey(line);
          const lineDiscs = key ? (discMap.get(key) ?? []) : [];
          const isComposing = key !== null && composingKey === key;
          const showThread = lineDiscs.length > 0 || isComposing;

          return (
            <Fragment key={i}>
              <tr className={`diff-line-row ${cls}`}>
                <td
                  className={`line-num${canComment && key ? ' line-num-clickable' : ''}`}
                  onClick={() => {
                    if (!canComment || !key) return;
                    setComposingKey(composingKey === key ? null : key);
                  }}
                  title={canComment && key ? t.addInlineComment : undefined}
                >
                  {canComment && key && <span className="line-add-btn" aria-hidden>+</span>}
                  {line.oldLineNumber ?? ''}
                </td>
                <td className="line-num">{line.newLineNumber ?? ''}</td>
                <td className="line-sign">{sign}</td>
                <td className="line-code">{line.content}</td>
              </tr>
              {showThread && key && (
                <ThreadRow
                  discussions={lineDiscs}
                  currentUserId={currentUserId}
                  colSpan={4}
                  composing={isComposing}
                  t={t}
                  onSubmit={(body) => handleSubmit(key, line, body)}
                  onCloseCompose={() => setComposingKey(null)}
                  onDelete={onDeleteInlineComment ?? (() => {})}
                />
              )}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}

// ---- Split mode hunk ----
function HunkSplitView({ hunk, discMap, diffRefs, oldPath, newPath, currentUserId, t, onAddInlineComment, onDeleteInlineComment }: { hunk: DiffHunk } & HunkCommonProps) {
  const [composingKey, setComposingKey] = useState<LineKey | null>(null);
  const pairs = buildSplitPairs(hunk.lines);
  const canComment = !!diffRefs && !!onAddInlineComment;

  function handleSubmit(_key: LineKey, line: DiffLine, body: string) {
    if (!diffRefs || !onAddInlineComment) return;
    onAddInlineComment(body, buildPosition(line, diffRefs, oldPath, newPath));
    setComposingKey(null);
  }

  return (
    <table>
      <tbody>
        {pairs.map(([left, right], i) => {
          const leftCls = left?.type === 'removed' ? 'line-removed' : '';
          const rightCls = right?.type === 'added' ? 'line-added' : '';
          const leftNum = left ? (left.oldLineNumber ?? left.newLineNumber ?? '') : '';
          const rightNum = right ? (right.newLineNumber ?? right.oldLineNumber ?? '') : '';

          // For discussion anchoring, prefer the right (added/context) line key
          const anchorLine = right ?? left;
          const key = anchorLine ? getLineKey(anchorLine) : null;
          const lineDiscs = key ? (discMap.get(key) ?? []) : [];
          const isComposing = key !== null && composingKey === key;
          const showThread = lineDiscs.length > 0 || isComposing;

          return (
            <Fragment key={i}>
              <tr>
                <td className={leftCls}>
                  <div className="split-cell">
                    <span
                      className={`line-num${canComment && key ? ' line-num-clickable' : ''}`}
                      onClick={() => {
                        if (!canComment || !key) return;
                        setComposingKey(composingKey === key ? null : key);
                      }}
                      title={canComment && key ? t.addInlineComment : undefined}
                    >
                      {canComment && key && <span className="line-add-btn" aria-hidden>+</span>}
                      {leftNum}
                    </span>
                    <span className="line-code">{left?.content ?? ''}</span>
                  </div>
                </td>
                <td className="split-divider" />
                <td className={rightCls}>
                  <div className="split-cell">
                    <span className="line-num">{rightNum}</span>
                    <span className="line-code">{right?.content ?? ''}</span>
                  </div>
                </td>
              </tr>
              {showThread && key && anchorLine && (
                <tr className="inline-thread-split-outer">
                  <td colSpan={3} style={{ padding: 0, borderTop: 'none' }}>
                    <table style={{ width: '100%' }}>
                      <tbody>
                        <ThreadRow
                          discussions={lineDiscs}
                          currentUserId={currentUserId}
                          colSpan={1}
                          composing={isComposing}
                          t={t}
                          onSubmit={(body) => handleSubmit(key, anchorLine, body)}
                          onCloseCompose={() => setComposingKey(null)}
                          onDelete={onDeleteInlineComment ?? (() => {})}
                        />
                      </tbody>
                    </table>
                  </td>
                </tr>
              )}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}

// ---- Hunk wrapper ----
function Hunk({ hunk, mode, ...rest }: { hunk: DiffHunk; mode: DiffMode } & HunkCommonProps) {
  return (
    <div>
      <div className="diff-hunk-header">{hunk.header}</div>
      {mode === 'split'
        ? <HunkSplitView hunk={hunk} {...rest} />
        : <HunkInlineView hunk={hunk} {...rest} />
      }
    </div>
  );
}

// ---- Main DiffViewer ----
function DiffViewer({
  parsedDiff, context, mode, onModeChange, mrWebUrl, t, onOpenInGitLab,
  discussions = [], diffRefs, currentUserId, onAddInlineComment, onDeleteInlineComment,
}: Props) {
  const { block, hunks } = parsedDiff;
  const gitlabUrl = mrWebUrl + '/diffs';

  // Build per-line discussion map (recomputes when discussions change)
  const discMap = buildDiscussionMap(discussions, block.oldPath, block.newPath);

  const badge = block.isNewFile ? (
    <span className="diff-badge new">NEW</span>
  ) : block.isDeletedFile ? (
    <span className="diff-badge deleted">DELETED</span>
  ) : block.isRenamedFile ? (
    <span className="diff-badge renamed">RENAMED</span>
  ) : null;

  const hunkCommonProps: HunkCommonProps = {
    discMap, diffRefs, oldPath: block.oldPath, newPath: block.newPath,
    currentUserId, t, onAddInlineComment, onDeleteInlineComment,
  };

  return (
    <div className="diff-container">
      <div className="diff-file-header">
        <span className="diff-file-path">{block.filePath}</span>
        {badge}
        <div className="diff-mode-toggle">
          <button
            className={`diff-mode-btn${mode === 'inline' ? ' active' : ''}`}
            onClick={() => onModeChange(block.id, 'inline')}
          >
            {t.btnInline}
          </button>
          <button
            className={`diff-mode-btn${mode === 'split' ? ' active' : ''}`}
            onClick={() => onModeChange(block.id, 'split')}
          >
            {t.btnSplit}
          </button>
        </div>
        <a
          className="link-gitlab"
          onClick={() => onOpenInGitLab(gitlabUrl)}
          style={{ cursor: 'pointer' }}
        >
          {t.linkGitlab}
        </a>
      </div>

      {context && <div className="diff-context">📝 {context}</div>}

      <div className={`diff-${mode}`}>
        {hunks.length === 0 ? (
          <div style={{ padding: '8px 12px', color: 'var(--vscode-descriptionForeground)', fontSize: '0.85em' }}>
            {t.noDiff}
          </div>
        ) : (
          hunks.map((hunk, i) => (
            <Hunk key={i} hunk={hunk} mode={mode} {...hunkCommonProps} />
          ))
        )}
      </div>
    </div>
  );
}

export default memo(DiffViewer);
