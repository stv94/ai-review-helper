interface Props {
  msg: string;
  onBack: () => void;
}

export default function ErrorScreen({ msg, onBack }: Props) {
  return (
    <div className="screen">
      <div className="error-box">{msg}</div>
      <div style={{ marginTop: 16 }}>
        <button className="btn-secondary" onClick={onBack}>
          ← Back
        </button>
      </div>
    </div>
  );
}
