import { canDownloadOutput, compareToReference } from './compare.js';

export function downloadFileName(client, fp) {
  const name = (client.tradeName || client.partyName || 'Client').trim()
    .replace(/[^\p{L}\p{N}._-]+/gu, '_').replace(/^[._-]+|[._-]+$/g, '') || 'Client';
  return `${name}_${fp}_GSTR1.json`;
}

export function summarizeFiling(key, saved) {
  const [clientId, year, month] = JSON.parse(key);
  const uploaded = ['tcs_sales', 'tcs_sales_return', 'Tax_invoice_details']
    .filter(type => saved.rows?.[type]?.length > 0).length;
  if (!uploaded && !saved.output) return null;
  const fp = `${String(month).padStart(2, '0')}${year}`;
  let status = uploaded === 3 ? 'Ready to generate' : 'Uploads incomplete';
  if (saved.output) {
    try {
      const comparison = saved.reference ? compareToReference(saved.output, saved.reference) : null;
      status = uploaded === 3 && saved.output.fp === fp && canDownloadOutput(saved.output, comparison).allowed
        ? 'Ready to download' : 'Needs review';
    } catch { status = 'Needs review'; }
  }
  return { clientId, year, month, uploaded, status, completed: Boolean(saved.output && saved.output.fp === fp) };
}

export function monthlyWork(clients, filings, month, year, activity = 'active', work = 'all') {
  return clients.filter(client => activity === 'all' ||
    (activity === 'active' ? client.active !== false : client.active === false))
    .map(client => {
      const filing = filings.find(item => item.clientId === client.id && item.month === month && item.year === year);
      return { client, uploaded: filing?.uploaded || 0, completed: filing?.completed === true };
    }).filter(item => work === 'all' || (work === 'completed' ? item.completed : !item.completed));
}
