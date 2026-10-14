export default function WorkspaceLoading({ error, slow, onRetry, onLogout, busy, session = false }) {
  return <main className="login-page workspace-loading">
    <section className="card loading-card" aria-live="polite">
      <div className={`workspace-orbit ${error ? 'has-error' : ''}`} aria-hidden="true"><span>G</span></div>
      <span className="loading-eyebrow">GST HELPER</span>
      <h1>{error ? 'Connection needs attention' : session ? 'Welcome back' : 'Preparing your workspace'}</h1>
      <p>{error || (slow ? 'Firebase is taking longer than expected. Check your internet connection and Firestore setup, then retry.' : session ? 'Checking your secure session…' : 'Syncing your clients and monthly work…')}</p>
      {!error && !slow && <div className="loading-dots" aria-hidden="true"><i /><i /><i /></div>}
      {(slow || error) && onRetry && <button className="btn btn-primary" onClick={onRetry}>Retry connection</button>}
      {onLogout && <button className="btn btn-secondary" disabled={busy} onClick={onLogout}>Sign out</button>}
    </section>
  </main>;
}
