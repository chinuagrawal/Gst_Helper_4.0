export default function NavigationBar({ onBack, disabled = false, canGoBack = false }) {
  if (!canGoBack) return null;
  return <nav className="screen-navigation" aria-label="Screen navigation">
    <button className="btn btn-secondary" onClick={onBack} disabled={disabled}>← Back</button>
  </nav>;
}
