interface Props {
  msg: string;
}

export default function LoadingScreen({ msg }: Props) {
  return (
    <div className="screen">
      <div className="loading-screen">
        <div className="spinner" />
        <div>{msg}</div>
      </div>
    </div>
  );
}
