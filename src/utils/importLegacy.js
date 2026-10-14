import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db, requireUser } from './firebase.js';
import { listLocalFilings, saveFiling, filingKey } from './filingStorage.js';

export async function importLegacyData(uid) {
  requireUser(uid);
  const clients = JSON.parse(localStorage.getItem('gst-helper-clients-v1') || '[]');
  if (!Array.isArray(clients) || clients.some(client => !client?.id || !client.gstin || !client.tradeName)) {
    throw new Error('The old browser client data cannot be imported.');
  }
  let count = 0;
  for (const client of clients) {
    requireUser(uid);
    const reference = doc(db, 'users', uid, 'clients', client.id);
    if (!(await getDoc(reference)).exists()) { await setDoc(reference, client); count++; }
  }
  for (const { key, saved } of await listLocalFilings()) {
    const [clientId, year, month] = JSON.parse(key);
    if (!clients.some(client => client.id === clientId)) continue;
    requireUser(uid);
    const cloudKey = filingKey(clientId, month, year);
    const reference = doc(db, 'users', uid, 'filings', encodeURIComponent(cloudKey));
    if (!(await getDoc(reference)).exists()) { await saveFiling(cloudKey, saved); count++; }
  }
  return count;
}
