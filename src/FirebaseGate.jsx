import { useEffect, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, doc, onSnapshot, writeBatch } from 'firebase/firestore';
import { auth, db, firebaseConfigured, requireUser } from './utils/firebase.js';
import { flushFilingWrites } from './utils/filingStorage.js';
import Login from './Login.jsx';
import { importLegacyData } from './utils/importLegacy.js';
import { Account } from './accountContext.js';

export default function FirebaseGate({ children }) {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);
  const [clients, setClients] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [importStatus, setImportStatus] = useState('');
  const [hasLegacy] = useState(() => {
    try { return JSON.parse(localStorage.getItem('gst-helper-clients-v1') || '[]').length > 0; } catch { return false; }
  });
  useEffect(() => {
    if (!auth) return;
    return onAuthStateChanged(auth, next => {
      setUser(next); setChecking(false); setClients([]); setLoaded(false); setError(''); setImportStatus('');
    });
  }, []);
  useEffect(() => {
    if (!user) return;
    return onSnapshot(collection(db, 'users', user.uid, 'clients'), snapshot => {
      setClients(snapshot.docs.map(item => ({ ...item.data(), id: item.id }))); setLoaded(true);
    }, err => { setError(`Cannot load cloud clients (${err.code}). Check the Firebase rules and connection.`); });
  }, [user]);
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
  if (checking) return <main className="login-page">Checking your session…</main>;
  if (!user) return <Login />;
  if (!loaded) return <main className="login-page"><section className="card"><p>{error || 'Loading your cloud workspace…'}</p><button className="btn btn-secondary" onClick={logout} disabled={busy}>Sign out</button></section></main>;
  return <Account.Provider value={{ user, clients, saveClients }}>
    <div className="account-bar"><span>{user.phoneNumber}</span>{hasLegacy && <button className="btn btn-secondary" disabled={busy} onClick={importOldData}>Import old browser data</button>}<button className="btn btn-secondary" onClick={logout} disabled={busy}>Sign out</button></div>
    {importStatus && <p className="info-msg" role="status">{importStatus}</p>}
    {error && <p className="error-msg" role="alert">{error}</p>}{children}
  </Account.Provider>;
}
