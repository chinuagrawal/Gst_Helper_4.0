import { useState, useEffect } from 'react';
import { createClientId } from './utils/clientId.js';
import { listFilings } from './utils/filingStorage.js';
import { summarizeFiling } from './utils/filingDashboard.js';
import Dashboard from './Dashboard.jsx';

const STORAGE_KEY = 'gst-helper-clients-v1';
const emptyClient = { tradeName: '', partyName: '', gstin: '', returnFrequency: 'Quarterly', active: true };

function readClients() {
  try {
    const clients = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    if (!Array.isArray(clients) || clients.some(client => !client ||
      typeof client.id !== 'string' || typeof client.tradeName !== 'string' ||
      typeof client.partyName !== 'string' || typeof client.gstin !== 'string' ||
      !['Monthly', 'Quarterly', 'Annual'].includes(client.returnFrequency))) {
      throw new Error('Invalid client list');
    }
    return { clients, error: '' };
  } catch {
    return { clients: [], error: 'Saved clients could not be loaded. Check browser storage before adding clients.' };
  }
}

export default function ClientHome({ onOpen }) {
  const [initial] = useState(readClients);
  const [clients, setClients] = useState(initial.clients);
  const [error, setError] = useState(initial.error);
  const [draft, setDraft] = useState(null);
  const [deleteId, setDeleteId] = useState(null);
  const [query, setQuery] = useState('');
  const [view, setView] = useState('dashboard');
  const [filings, setFilings] = useState([]);
  const [filingStatus, setFilingStatus] = useState('Loading saved months…');

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

  function persist(next) {
    if (initial.error) {
      setError(initial.error);
      return false;
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setClients(next);
      setError('');
      return true;
    } catch {
      setError('Unable to save clients. Allow browser storage and try again.');
      return false;
    }
  }

  function saveClient(event) {
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
      if (persist(next)) { setDraft(null); setQuery(''); }
    } catch {
      setError('Unable to save this client. Please try again.');
    }
  }

  const filtered = clients.filter(client =>
    `${client.tradeName} ${client.partyName} ${client.gstin}`.toLowerCase().includes(query.toLowerCase()));

  if (view === 'dashboard') return <Dashboard clients={clients} filings={filings} filingStatus={filingStatus}
    error={error} onClients={() => setView('clients')} onOpen={onOpen}
    onToggle={client => persist(clients.map(item => item.id === client.id
      ? { ...item, active: item.active === false } : item))} />;

  return (
    <div className="app">
      <header className="app-header">
        <h1>GST Helper · Clients</h1>
        <p className="subtitle">Choose a client to upload files and generate their return.</p>
      </header>
      <main className="container">
        <section className="card">
          <div className="client-toolbar">
            <h2>Your clients ({clients.length})</h2>
            <button className="btn btn-secondary" onClick={() => setView('dashboard')}>Dashboard</button>
            <button className="btn btn-primary" onClick={() => {
              setDraft({ ...emptyClient }); setDeleteId(null); setError(initial.error);
            }}>+ Add client</button>
          </div>
          <p className="client-storage-note">Client details are saved in this browser on this device.</p>
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
                <button className="btn btn-primary" type="submit">Save client</button>
                <button className="btn btn-secondary" type="button" onClick={() => { setDraft(null); setError(initial.error); }}>Cancel</button>
              </div>
            </form>
          )}
          {deleteId && (
            <div className="client-delete" role="alert">
              <p>Delete {clients.find(client => client.id === deleteId)?.tradeName} from your client list?</p>
              <div className="client-actions">
                <button className="btn btn-danger" onClick={() => {
                  if (persist(clients.filter(client => client.id !== deleteId))) setDeleteId(null);
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
