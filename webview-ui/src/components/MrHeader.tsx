import { MergeRequest, ApprovalState } from '../types';
import { Translations } from '../translations';

interface Props {
  mr: MergeRequest;
  t: Translations;
  onOpenInGitLab: (url: string) => void;
  approvalState?: ApprovalState | null;
  currentUserId?: number | null;
  onApprove?: () => void;
  onRevoke?: () => void;
}

export default function MrHeader({ mr, t, onOpenInGitLab, approvalState, currentUserId, onApprove, onRevoke }: Props) {
  const desc = mr.description
    ? mr.description.substring(0, 300) + (mr.description.length > 300 ? '…' : '')
    : '';

  const iApproved = approvalState?.approvedBy.some((u) => u.id === currentUserId) ?? false;
  const showApprovalButton = approvalState !== undefined && approvalState !== null && onApprove && onRevoke;

  return (
    <div className="mr-header">
      <div className="mr-title-row">
        <span className="mr-iid">!{mr.iid}</span>
        <span className="mr-title">{mr.title}</span>
        <span className="badge">{mr.state || 'open'}</span>
        {approvalState?.approved && (
          <span className="badge badge-approved">{t.approvedLabel}</span>
        )}
      </div>
      <div className="mr-meta">
        <span>👤 {mr.author?.name ?? ''}</span>
        <span>
          🌿 <code>{mr.source_branch}</code> → <code>{mr.target_branch}</code>
        </span>
        {/* eslint-disable-next-line jsx-a11y/anchor-is-valid */}
        <a
          className="link-gitlab"
          onClick={() => onOpenInGitLab(mr.web_url)}
          style={{ cursor: 'pointer' }}
        >
          {t.linkOpenMr}
        </a>
        {showApprovalButton && (
          iApproved ? (
            <button className="btn-secondary btn-sm" onClick={onRevoke}>
              {t.btnRevoke}
            </button>
          ) : (
            <button className="btn-primary btn-sm" onClick={onApprove}>
              {t.btnApprove}
            </button>
          )
        )}
      </div>
      {desc && <div className="mr-description">{desc}</div>}
    </div>
  );
}
