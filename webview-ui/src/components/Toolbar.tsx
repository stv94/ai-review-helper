import { Translations } from '../translations';

interface Props {
  t: Translations;
  showBack: boolean;
  onBack: () => void;
  onSettings: () => void;
}

export default function Toolbar({ t, showBack, onBack, onSettings }: Props) {
  return (
    <div className="toolbar">
      <span className="toolbar-title">{t.title}</span>
      <div className="toolbar-spacer" />
      {showBack && (
        <button className="btn-ghost btn-sm" onClick={onBack}>
          {t.btnBack}
        </button>
      )}
      <button className="btn-ghost btn-sm" onClick={onSettings}>
        {t.btnSettings}
      </button>
    </div>
  );
}
