export default function EmbedPlaceholder({ title, children, error = false, style }) {
  return (
    <div className={`placeholder${error ? ' error' : ''}`} style={style}>
      <b>{title}</b>
      <div>{children}</div>
    </div>
  );
}

export function EmbedLoading({ label, done }) {
  return (
    <div className={`embed-loading${done ? ' done' : ''}`} aria-hidden={done}>
      <span className="spin">
        <i />
        {label}
      </span>
    </div>
  );
}
