export function filingKey(clientId, month, year) {
  return JSON.stringify([clientId, Number(year), Number(month)]);
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('gst-helper-filings', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('filings');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function transact(mode, key, value) {
  const db = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction('filings', mode);
      const store = transaction.objectStore('filings');
      const request = mode === 'readonly' ? store.get(key) : store.put(value, key);
      transaction.oncomplete = () => resolve(request.result ?? null);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error || new Error('Saving was interrupted.'));
    });
  } finally { db.close(); }
}

let writes = Promise.resolve();
export function saveFiling(key, value) {
  const next = writes.catch(() => {}).then(() => transact('readwrite', key, value));
  writes = next;
  return next;
}

export async function restoreFiling(key) {
  await writes.catch(() => {});
  return transact('readonly', key);
}
