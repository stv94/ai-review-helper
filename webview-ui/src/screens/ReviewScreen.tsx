import { useState } from 'react';
import { MergeRequest, ReviewNarrative, ParsedDiff, NarrativeBlock } from '../types';
import { Translations } from '../translations';
import MrHeader from '../components/MrHeader';
import DiffViewer from '../components/DiffViewer';

type DiffMode = 'inline' | 'split';

interface Props {
  t: Translations;
  mr: MergeRequest;
  narrative: ReviewNarrative;
  parsedDiffs: ParsedDiff[];
  currentBlockIdx: number;
  diffModes: Record<string, DiffMode>;
  onPrev: () => void;
  onNext: () => void;
  onJump: (idx: number) => void;
  onSetDiffMode: (diffId: string, mode: DiffMode) => void;
  onOpenInGitLab: (url: string) => void;
}

// ---- Overview banner ----
function OverviewBanner({ overview, label }: { overview: string; label: string }) {
  const [expanded, setExpanded] = useState(true);
  if (!overview) return null;
  return (
    <div className="mr-overview">
      <div className="mr-overview-header" onClick={() => setExpanded((v) => !v)}>
        <span className="mr-overview-label">{label}</span>
        <span className="mr-overview-toggle">{expanded ? '▾' : '▸'}</span>
      </div>
      {expanded && <div className="mr-overview-body">{overview}</div>}
    </div>
  );
}

// ---- Single narrative step ----
interface NarrativeBlockViewProps {
  block: NarrativeBlock;
  blockIdx: number;
  parsedDiffs: ParsedDiff[];
  diffModes: Record<string, DiffMode>;
  onSetDiffMode: (diffId: string, mode: DiffMode) => void;
  mrWebUrl: string;
  onOpenInGitLab: (url: string) => void;
  t: Translations;
}

function NarrativeBlockView({
  block,
  blockIdx,
  parsedDiffs,
  diffModes,
  onSetDiffMode,
  mrWebUrl,
  onOpenInGitLab,
  t,
}: NarrativeBlockViewProps) {
  const diffs = block.diffIds
    .map((id) => parsedDiffs.find((pd) => pd.block.id === id))
    .filter((pd): pd is ParsedDiff => pd !== undefined);

  // Build quick lookup: diffId → context
  const ctxMap: Record<string, string> = {};
  for (const c of block.diffContexts) {
    ctxMap[c.diffId] = c.context;
  }

  return (
    <div className="narrative-block">
      {/* Header */}
      <div className="block-header">
        <div className="block-step">{blockIdx + 1}</div>
        <div className="block-title">{block.title}</div>
      </div>

      {/* Explanation */}
      <div className="block-section">
        <div className="block-section-label">{t.secExplanation}</div>
        <div className="block-explanation">{block.explanation}</div>
      </div>

      {/* Diffs */}
      {diffs.length > 0 && (
        <div className="block-section">
          <div className="block-section-label">{t.secChanges(diffs.length)}</div>
          {diffs.map((pd) => (
            <DiffViewer
              key={pd.block.id}
              parsedDiff={pd}
              context={ctxMap[pd.block.id] ?? ''}
              mode={diffModes[pd.block.id] ?? 'inline'}
              onModeChange={onSetDiffMode}
              mrWebUrl={mrWebUrl}
              t={t}
              onOpenInGitLab={onOpenInGitLab}
            />
          ))}
        </div>
      )}

      {/* Remarks — always shown */}
      <div className="block-section">
        <div className="block-section-label">{t.secRemarks}</div>
        <div className="block-remarks">{block.analysis || t.remarksEmpty}</div>
      </div>
    </div>
  );
}

// ---- ReviewScreen ----
export default function ReviewScreen({
  t,
  mr,
  narrative,
  parsedDiffs,
  currentBlockIdx,
  diffModes,
  onPrev,
  onNext,
  onJump,
  onSetDiffMode,
  onOpenInGitLab,
}: Props) {
  const { blocks } = narrative;
  const block = blocks[currentBlockIdx];
  const total = blocks.length;

  return (
    <div className="screen">
      <MrHeader mr={mr} t={t} onOpenInGitLab={onOpenInGitLab} />

      <OverviewBanner overview={narrative.overview} label={t.secOverview} />

      <div className="walkthrough">
        {/* Navigation bar */}
        <div className="nav-bar">
          <button
            className="btn-secondary btn-sm"
            onClick={onPrev}
            disabled={currentBlockIdx === 0}
          >
            {t.btnPrev}
          </button>
          <span className="nav-counter">{t.stepLabel(currentBlockIdx + 1, total)}</span>
          <button
            className="btn-primary btn-sm"
            onClick={onNext}
            disabled={currentBlockIdx === total - 1}
          >
            {t.btnNext}
          </button>
          <div className="nav-spacer" />
          <select
            className="jump-select"
            value={currentBlockIdx}
            onChange={(e) => onJump(parseInt(e.target.value, 10))}
          >
            {blocks.map((b, i) => (
              <option key={i} value={i}>
                {t.jumpPrefix} {i + 1}: {b.title.substring(0, 40)}
              </option>
            ))}
          </select>
        </div>

        {/* Current block */}
        <div className="block-content">
          {block && (
            <NarrativeBlockView
              key={currentBlockIdx}
              block={block}
              blockIdx={currentBlockIdx}
              parsedDiffs={parsedDiffs}
              diffModes={diffModes}
              onSetDiffMode={onSetDiffMode}
              mrWebUrl={mr.web_url}
              onOpenInGitLab={onOpenInGitLab}
              t={t}
            />
          )}
        </div>
      </div>
    </div>
  );
}
