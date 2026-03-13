import { memo } from 'react';
import { ParsedDiff, DiffHunk, DiffLine } from '../types';
import { Translations } from '../translations';

type DiffMode = 'inline' | 'split';

interface Props {
  parsedDiff: ParsedDiff;
  context: string;
  mode: DiffMode;
  onModeChange: (diffId: string, mode: DiffMode) => void;
  mrWebUrl: string;
  t: Translations;
  onOpenInGitLab: (url: string) => void;
}

// ---- Split-mode pair builder ----
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

// ---- Hunk rendering ----
function HunkInline({ hunk }: { hunk: DiffHunk }) {
  return (
    <table>
      <tbody>
        {hunk.lines.map((line, i) => {
          const cls =
            line.type === 'added'
              ? 'line-added'
              : line.type === 'removed'
              ? 'line-removed'
              : '';
          const sign =
            line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' ';
          return (
            <tr key={i} className={cls}>
              <td className="line-num">{line.oldLineNumber ?? ''}</td>
              <td className="line-num">{line.newLineNumber ?? ''}</td>
              <td className="line-sign">{sign}</td>
              <td className="line-code">{line.content}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function HunkSplit({ hunk }: { hunk: DiffHunk }) {
  const pairs = buildSplitPairs(hunk.lines);
  return (
    <table>
      <tbody>
        {pairs.map(([left, right], i) => {
          const leftCls = left?.type === 'removed' ? 'line-removed' : '';
          const rightCls = right?.type === 'added' ? 'line-added' : '';
          const leftNum = left ? (left.oldLineNumber ?? left.newLineNumber ?? '') : '';
          const rightNum = right ? (right.newLineNumber ?? right.oldLineNumber ?? '') : '';
          return (
            <tr key={i}>
              <td className={leftCls}>
                <div className="split-cell">
                  <span className="line-num">{leftNum}</span>
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
          );
        })}
      </tbody>
    </table>
  );
}

function Hunk({ hunk, mode }: { hunk: DiffHunk; mode: DiffMode }) {
  return (
    <div>
      <div className="diff-hunk-header">{hunk.header}</div>
      {mode === 'split' ? <HunkSplit hunk={hunk} /> : <HunkInline hunk={hunk} />}
    </div>
  );
}

// ---- Main DiffViewer ----
function DiffViewer({ parsedDiff, context, mode, onModeChange, mrWebUrl, t, onOpenInGitLab }: Props) {
  const { block, hunks } = parsedDiff;
  const gitlabUrl = mrWebUrl + '/diffs';

  const badge = block.isNewFile ? (
    <span className="diff-badge new">NEW</span>
  ) : block.isDeletedFile ? (
    <span className="diff-badge deleted">DELETED</span>
  ) : block.isRenamedFile ? (
    <span className="diff-badge renamed">RENAMED</span>
  ) : null;

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
          hunks.map((hunk, i) => <Hunk key={i} hunk={hunk} mode={mode} />)
        )}
      </div>
    </div>
  );
}

export default memo(DiffViewer);
