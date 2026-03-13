import { MergeRequest } from '../types';
import { Translations } from '../translations';

interface Props {
  mr: MergeRequest;
  t: Translations;
  onOpenInGitLab: (url: string) => void;
}

export default function MrHeader({ mr, t, onOpenInGitLab }: Props) {
  const desc = mr.description
    ? mr.description.substring(0, 300) + (mr.description.length > 300 ? '…' : '')
    : '';

  return (
    <div className="mr-header">
      <div className="mr-title-row">
        <span className="mr-iid">!{mr.iid}</span>
        <span className="mr-title">{mr.title}</span>
        <span className="badge">{mr.state || 'open'}</span>
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
      </div>
      {desc && <div className="mr-description">{desc}</div>}
    </div>
  );
}
