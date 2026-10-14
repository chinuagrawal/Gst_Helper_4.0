import { useEffect, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, doc, onSnapshot, writeBatch } from 'firebase/firestore';
import { auth, db, firebaseConfigured, requireUser, firebaseProjectId, firestoreDatabaseId } from './utils/firebase.js';
import { flushFilingWrites } from './utils/filingStorage.js';
import Login from './Login.jsx';
import { importLegacyData } from './utils/importLegacy.js';
import { Account } from './accountContext.js';
import ThemeToggle from './ThemeToggle.jsx';
import WorkspaceLoading from './WorkspaceLoading.jsx';

export default function FirebaseGate({ children }) {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);
  const [clients, setClients] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [importStatus, setImportStatus] = useState('');
  const [slow, setSlow] = useState(false);
  const [retry, setRetry] = useState(0);
  const [hasLegacy] = useState(() => {
    try { return JSON.parse(localStorage.getItem('gst-helper-clients-v1') || '[]').length > 0; } catch { return false; }
  });
  useEffect(() => {
    if (!auth) return;
    return onAuthStateChanged(auth, next => {
      setUser(next); setChecking(false); setClients([]); setLoaded(false); setError(''); setImportStatus(''); setSlow(false);
    });
  }, []);
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    let unsubscribe = () => {};
    const timer = setTimeout(() => setSlow(true), 10000);
    const fail = err => {
      if (cancelled) return;
      clearTimeout(timer);
      setError(err.code === 'not-found'
        ? `Firestore database "${firestoreDatabaseId}" was not found in project "${firebaseProjectId}". Create that database or configure the correct database ID.`
        : err.code === 'permission-denied'
          ? `Firebase SDK access was denied for database "${firestoreDatabaseId}". Check App Check enforcement and the published database rules. Sign out and sign in again to refresh your session.`
          : `Cannot connect to Firestore${err.name === 'AbortError' ? ' within 10 seconds' : ` (${err.code || 'network error'})`}. Check your connection and retry.`);
    };
    async function connect() {
      try {
        await user.getIdToken(true);
        if (cancelled) return;
        unsubscribe = onSnapshot(collection(db, 'users', user.uid, 'clients'), { includeMetadataChanges: true }, snapshot => {
      // A populated cache can open immediately; an empty cache is not proof of an empty account.
      if (snapshot.metadata.fromCache && snapshot.empty) return;
      clearTimeout(timer);
      setClients(snapshot.docs.map(item => ({ ...item.data(), id: item.id }))); setLoaded(true);
      setSlow(false); setError('');
        }, fail);
      } catch (err) { fail(err); }
    }
    connect();
    return () => { cancelled = true; clearTimeout(timer); unsubscribe(); };
  }, [user, retry]);
  async function saveClients(next) {
    const uid = requireUser(user.uid);
    const batch = writeBatch(db);
    for (const client of next) {
      const previous = clients.find(item => item.id === client.id);
      if (JSON.stringify(previous) !== JSON.stringify(client)) batch.set(doc(db, 'users', uid, 'clients', client.id), client);
    }
    for (const client of clients) if (!next.some(item => item.id === client.id)) batch.delete(doc(db, 'users', uid, 'clients', client.id));
    await batch.commit();
    requireUser(uid);
  }
  async function logout() {
    setBusy(true); setError('');
    try { await flushFilingWrites(); await signOut(auth); }
    catch { setError('Cloud saving is not complete. Please retry before signing out.'); }
    finally { setBusy(false); }
  }
  async function importOldData() {
    setBusy(true); setImportStatus('Importing your old browser data…');
    try { const count = await importLegacyData(user.uid); setImportStatus(`Import complete: ${count} new records. Existing cloud records were kept. Refresh the dashboard to see imported months.`); }
    catch (err) { setImportStatus(`Import did not finish: ${err.message}. Your browser data is unchanged. You can retry.`); }
    finally { setBusy(false); }
  }
  if (!firebaseConfigured) return <main className="login-page"><section className="card login-card"><h1>Connect Firebase</h1><p>Add the Firebase web configuration to your environment variables to enable phone login and cloud storage.</p><p className="client-storage-note">Setup instructions: docs/firebase-setup.md. Existing browser data is preserved.</p></section></main>;
  if (checking) return <WorkspaceLoading session />;
  if (!user) return <Login />;
  if (!loaded) return <><div className="account-bar"><ThemeToggle /></div><WorkspaceLoading error={error} slow={slow}
    onRetry={() => { setError(''); setSlow(false); setRetry(value => value + 1); }} onLogout={logout} busy={busy} /></>;
  return <Account.Provider value={{ user, clients, saveClients }}>
    <div className="account-bar"><span>{user.phoneNumber}</span>{hasLegacy && <button className="btn btn-secondary" disabled={busy} onClick={importOldData}>Import old browser data</button>}<ThemeToggle /><button className="btn btn-secondary" onClick={logout} disabled={busy}>Sign out</button></div>
    {importStatus && <p className="info-msg" role="status">{importStatus}</p>}
    {error && <p className="error-msg" role="alert">{error}</p>}{children}
  </Account.Provider>;
}
