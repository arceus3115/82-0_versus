interface Props {
  label: string;
  used: boolean;
  disabled?: boolean;
  onClick: () => void;
}

export function MulliganButton({ label, used, disabled, onClick }: Props) {
  return (
    <button
      type="button"
      className="btn btn-secondary btn-sm mulligan-btn"
      disabled={disabled ?? used}
      onClick={onClick}
    >
      {label} ({used ? "used" : "1 left"})
    </button>
  );
}
