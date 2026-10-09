import { useState } from 'react';
import { monthlyWork } from './utils/filingDashboard.js';

export default function Dashboard({ clients, filings, filingStatus, error, onToggle, onOpen, onClients }) {
  const [defaultPeriod] = useState(() => {
    const today = new Date();
    const previousMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    return { month: previousMonth.getMonth() + 1, year: previousMonth.getFullYear() };
  });
  const [month, setMonth] = useState(defaultPeriod.month);
  const [year, setYear] = useState(defaultPeriod.year);
  const [activity, setActivity] = useState('active');
  const [work, setWork] = useState('pending');
  const [query, setQuery] = useState('');
  const allWork = monthlyWork(clients, filings, month, year, activity);
  const visible = monthlyWork(clients, filings, month, year, activity, work)
    .filter(({ client }) => `${client.tradeName} ${client.partyName} ${client.gstin}`.toLowerCase().includes(query.toLowerCase()));
  const years = [...new Set([year, ...Array.from({ length: 7 }, (_, i) => new Date().getFullYear() - 3 + i), ...filings.map(f => f.year)])].sort((a, b) => b - a);

  return <div className="app">
    <header className="app-header"><h1>GST Helper · Dashboard</h1><p className="subtitle">Track client activity and monthly work.</p></header>
    <main className="container">
      <div className="client-toolbar">
        <h2>Dashboard</h2><button className="btn btn-secondary" onClick={onClients}>Manage clients</button>
      </div>
      {error && <div className="error-msg" role="alert">{error}</div>}
      <section className="card">
        <div className="client-toolbar">
          <h2>Monthly work</h2>
          <div className="dashboard-filters">
            <label className="field">Month<select value={month} onChange={e => setMonth(Number(e.target.value))}>
              {Array.from({ length: 12 }, (_, i) => <option value={i + 1} key={i}>{new Date(2026, i, 1).toLocaleDateString('en-IN', { month: 'long' })}</option>)}
            </select></label>
            <label className="field">Year<select value={year} onChange={e => setYear(Number(e.target.value))}>{years.map(y => <option key={y}>{y}</option>)}</select></label>
            <label className="field">Clients<select value={activity} onChange={e => setActivity(e.target.value)}><option value="active">Active only</option><option value="inactive">Inactive only</option><option value="all">All clients</option></select></label>
            <label className="field">Work<select value={work} onChange={e => setWork(e.target.value)}><option value="all">All work</option><option value="pending">Pending</option><option value="completed">Completed</option></select></label>
          </div>
        </div>
        <p className="client-storage-note">Completed means JSON has been generated for the selected month.</p>
        {filingStatus ? <p role="status">{filingStatus}</p> : <>
          <div className="dashboard-counts">
            <div className="sum-card"><div className="sum-label">Clients in view</div><div className="sum-value">{allWork.length}</div></div>
            <div className="sum-card"><div className="sum-label">Pending</div><div className="sum-value">{allWork.filter(row => !row.completed).length}</div></div>
            <div className="sum-card"><div className="sum-label">Completed</div><div className="sum-value">{allWork.filter(row => row.completed).length}</div></div>
          </div>
          <label className="field client-search">Search clients<input type="search" value={query} placeholder="Name or GST number" onChange={e => setQuery(e.target.value)} /></label>
          <div className="table-wrap"><table className="data-table">
            <thead><tr><th>Client</th><th>GST number</th><th>Activity</th><th>Uploads</th><th>Monthly work</th><th>Actions</th></tr></thead>
            <tbody>{visible.map(({ client, uploaded, completed }) => <tr key={client.id}>
              <td><strong>{client.tradeName}</strong><div>{client.partyName}</div></td><td><code>{client.gstin}</code></td>
              <td>{client.active === false ? 'Inactive' : 'Active'}</td><td>{uploaded}/3 files</td>
              <td><span className={completed ? 'upload-status' : ''}>{completed ? 'Completed' : 'Pending'}</span></td>
              <td><div className="client-actions"><button className="btn btn-primary" onClick={() => onOpen(client, { month, year })}>Open month</button>
                <button className="btn btn-secondary" onClick={() => onToggle(client)}>{client.active === false ? 'Make active' : 'Make inactive'}</button></div></td>
            </tr>)}{!visible.length && <tr><td colSpan={6} className="client-empty">No clients match these filters.</td></tr>}</tbody>
          </table></div>
        </>}
      </section>
    </main>
  </div>;
}
