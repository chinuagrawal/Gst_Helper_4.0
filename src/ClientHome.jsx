import { useState, useEffect } from 'react';
import { createClientId } from './utils/clientId.js';
import { listFilings } from './utils/filingStorage.js';
import { summarizeFiling } from './utils/filingDashboard.js';
import Dashboard from './Dashboard.jsx';
import NavigationBar from './NavigationBar.jsx';
import { useAccount } from './accountContext.js';

const emptyClient = { tradeName: '', partyName: '', gstin: '', returnFrequency: 'Quarterly', active: true };


export default function ClientHome({ onOpen, view = 'dashboard', onNavigate, newClient = false, onBack, canGoBack }) {
  const { clients, saveClients } = useAccount();
  const initial = { error: '' };
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState(newClient ? { ...emptyClient } : null);
  const [deleteId, setDeleteId] = useState(null);
  const [query, setQuery] = useState('');
  const [filings, setFilings] = useState([]);
  const [filingStatus, setFilingStatus] = useState('Loading saved months…');

  useEffect(() => {
    if (!draft) return;
    const closeForm = event => {
      if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing ||
        document.querySelector('dialog[open]')) return;
      event.preventDefault();
      event.stopPropagation();
      setDraft(null);
      setError(initial.error);
    };
    window.addEventListener('keydown', closeForm, true);
    return () => window.removeEventListener('keydown', closeForm, true);
  }, [draft, initial.error]);

  useEffect(() => {
    let cancelled = false;
    listFilings().then(records => {
      if (cancelled) return;
      setFilings(records.map(record => summarizeFiling(record.key, record.saved)).filter(Boolean)
        .sort((a, b) => b.year - a.year || b.month - a.month));
      setFilingStatus('');
    }).catch(() => {
      if (!cancelled) setFilingStatus('Saved months could not be loaded. Reopen the client list to retry.');
    });
    return () => { cancelled = true; };
  }, []);

  async function persist(next) {
    if (saving) return false;
    setSaving(true);
    try {
      await saveClients(next);
      setError('');
      return true;
    } catch {
      setError('Unable to save clients to Firebase. Check your connection and try again.');
      return false;
    } finally { setSaving(false); }
  }

  async function saveClient(event) {
    event.preventDefault();
    const client = {
      ...draft,
      tradeName: draft.tradeName.trim(),
      partyName: draft.partyName.trim(),
      gstin: draft.gstin.trim().toUpperCase(),
    };
    if (!client.tradeName || !client.partyName ||
      !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(client.gstin)) {
      setError('Enter a trade name, party name, and valid 15-character GST number.');
      return;
    }
    if (clients.some(item => item.gstin === client.gstin && item.id !== client.id)) {
      setError('A client with this GST number already exists.');
      return;
    }
    try {
      const next = client.id
        ? clients.map(item => item.id === client.id ? client : item)
        : [...clients, { ...client, id: createClientId() }];
      if (await persist(next)) { setDraft(null); setQuery(''); }
    } catch {
      setError('Unable to save this client. Please try again.');
    }
  }

  const filtered = clients.filter(client =>
    `${client.tradeName} ${client.partyName} ${client.gstin}`.toLowerCase().includes(query.toLowerCase()));

  if (view === 'dashboard') return <Dashboard clients={clients} filings={filings} filingStatus={filingStatus}
    onBack={onBack} canGoBack={canGoBack}
    error={error} onClients={() => onNavigate({ screen: 'clients' })} onOpen={onOpen}
    onToggle={client => persist(clients.map(item => item.id === client.id
      ? { ...item, active: item.active === false } : item))} />;

  return (
    <div className="app">
      <header className="app-header">
        <h1>GST Helper · Clients</h1>
        <p className="subtitle">Choose a client to upload files and generate their return.</p>
      </header>
      <main className="container">
        <NavigationBar disabled={saving} canGoBack={canGoBack || Boolean(draft) || Boolean(deleteId)}
          onBack={() => { if (draft) { setDraft(null); setError(''); } else if (deleteId) setDeleteId(null); else onBack(); }} />
        <section className="card">
          <div className="client-toolbar">
            <h2>Your clients ({clients.length})</h2>
            <div className="client-toolbar-actions">
            <button className="btn btn-primary" onClick={() => {
              setDraft({ ...emptyClient }); setDeleteId(null); setError(initial.error);
            }}>+ Add client</button>
            <button className="btn btn-secondary" onClick={() => onNavigate({ screen: 'dashboard' })}>Dashboard</button>
            </div>
          </div>
          <p className="client-storage-note">Client details are saved privately in your Firebase account.</p>
          {filingStatus && <p className="client-storage-note" role="status">{filingStatus}</p>}
          {error && <div className="error-msg" role="alert">{error}</div>}
          {draft && (
            <form className="client-form" onSubmit={saveClient}>
              <h3>{draft.id ? 'Edit client' : 'Add client'}</h3>
              <div className="client-form-grid">
                <label className="field">Trade name
                  <input autoFocus required value={draft.tradeName} onChange={e => setDraft({ ...draft, tradeName: e.target.value })} />
                </label>
                <label className="field">Party name
                  <input required value={draft.partyName} onChange={e => setDraft({ ...draft, partyName: e.target.value })} />
                </label>
                <label className="field">GST number
                  <input required maxLength={15} placeholder="08EKGPA4015M1Z8" value={draft.gstin}
                    onChange={e => setDraft({ ...draft, gstin: e.target.value.toUpperCase() })} />
                </label>
                <label className="field">Return frequency
                  <select value={draft.returnFrequency} onChange={e => setDraft({ ...draft, returnFrequency: e.target.value })}>
                    <option>Monthly</option><option>Quarterly</option><option>Annual</option>
                  </select>
                </label>
              </div>
              <div className="client-actions">
                <button className="btn btn-primary" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save client'}</button>
                <button className="btn btn-secondary" type="button" onClick={() => { setDraft(null); setError(initial.error); }}>Cancel</button>
              </div>
            </form>
          )}
          {deleteId && (
            <div className="client-delete" role="alert">
              <p>Delete {clients.find(client => client.id === deleteId)?.tradeName} from your client list?</p>
              <div className="client-actions">
                <button className="btn btn-danger" disabled={saving} onClick={async () => {
                  if (await persist(clients.filter(client => client.id !== deleteId))) setDeleteId(null);
                }}>Delete client</button>
                <button className="btn btn-secondary" onClick={() => setDeleteId(null)}>Cancel</button>
              </div>
            </div>
          )}
          <label className="field client-search">Search clients
            <input type="search" placeholder="Trade name, party name, or GST number" value={query} onChange={e => setQuery(e.target.value)} />
          </label>
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Trade name</th><th>Party name</th><th>GST number</th><th>Return frequency</th><th>Saved months & return status</th><th>Actions</th></tr></thead>
              <tbody>
                {filtered.map(client => (
                  <tr className="client-row" key={client.id} onClick={() => onOpen(client)}>
                    <td><button className="client-open" onClick={e => { e.stopPropagation(); onOpen(client); }}>{client.tradeName}</button></td>
                    <td>{client.partyName}</td><td><code>{client.gstin}</code></td><td>{client.returnFrequency}</td>
                    <td>
                      <div className="saved-months">
                        {filings.filter(filing => filing.clientId === client.id).map(filing => (
                          <button className="saved-month" key={`${filing.year}-${filing.month}`}
                            onClick={event => { event.stopPropagation(); onOpen(client, filing); }}>
                            <strong>{new Date(filing.year, filing.month - 1, 1).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}</strong>
                            <span>{filing.uploaded}/3 files uploaded</span>
                            <span className={filing.status === 'Ready to download' ? 'upload-status' : ''}>{filing.status}</span>
                          </button>
                        ))}
                        {!filingStatus && !filings.some(filing => filing.clientId === client.id) && <span>No saved months</span>}
                      </div>
                    </td>
                    <td><div className="client-actions">
                      <button className="btn btn-secondary" onClick={e => {
                        e.stopPropagation(); setDraft({ ...client }); setDeleteId(null); setError(initial.error);
                      }}>Edit</button>
                      <button className="btn btn-danger" onClick={e => {
                        e.stopPropagation(); setDeleteId(client.id); setDraft(null);
                      }}>Delete</button>
                    </div></td>
                  </tr>
                ))}
                {!filtered.length && <tr><td colSpan={6} className="client-empty">
                  {clients.length ? 'No clients match your search.' : 'No clients yet. Add your first client to get started.'}
                </td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
