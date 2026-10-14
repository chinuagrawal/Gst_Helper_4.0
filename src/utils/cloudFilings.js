import { collection, doc, getDoc, getDocs, setDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getBlob } from 'firebase/storage';
import { db, storage, requireUser } from './firebase.js';
import { createClientId } from './clientId.js';
import { encodeCloud, decodeCloud } from './cloudCodec.js';
import { summarizeFiling } from './filingDashboard.js';

const fileCache = new WeakMap();
const idFor = key => encodeURIComponent(key);
export async function saveCloudFiling(key, value, uid) {
  requireUser(uid);
  const folder = `users/${uid}/filings/${idFor(key)}`;
  const files = {};
  for (const [type, file] of Object.entries(value.files || {})) {
    if (!file) { files[type] = null; continue; }
    let cached = fileCache.get(file);
    if (!cached || cached.uid !== uid || cached.key !== key) {
      const path = `${folder}/files/${createClientId()}`;
      await uploadBytes(ref(storage, path), file, { contentType: file.type || 'application/octet-stream' });
      cached = { uid, key, path }; fileCache.set(file, cached);
    }
    files[type] = { path: cached.path, name: file.name || type, type: file.type || '', lastModified: file.lastModified || 0 };
  }
  requireUser(uid);
  const path = `${folder}/snapshots/${createClientId()}.json`;
  const snapshot = new Blob([JSON.stringify(encodeCloud({ ...value, files }))], { type: 'application/json' });
  await uploadBytes(ref(storage, path), snapshot);
  const document = doc(db, 'users', uid, 'filings', idFor(key));
  requireUser(uid);
  await setDoc(document, { key, path, dashboard: summarizeFiling(key, value), updatedAt: serverTimestamp() });
  // Immutable snapshots remain readable by another device while a newer save commits.
}

export async function restoreCloudFiling(key, uid) {
  requireUser(uid);
  const record = await getDoc(doc(db, 'users', uid, 'filings', idFor(key)));
  if (!record.exists()) return null;
  const blob = await getBlob(ref(storage, record.data().path));
  const saved = decodeCloud(JSON.parse(await blob.text()));
  for (const [type, file] of Object.entries(saved.files || {})) {
    if (!file) continue;
    requireUser(uid);
    const source = await getBlob(ref(storage, file.path));
    const restored = new File([source], file.name, { type: file.type, lastModified: file.lastModified });
    fileCache.set(restored, { uid, key, path: file.path }); saved.files[type] = restored;
  }
  requireUser(uid);
  return saved;
}

export async function listCloudFilings(uid) {
  requireUser(uid);
  const records = await getDocs(collection(db, 'users', uid, 'filings'));
  requireUser(uid);
  return records.docs.map(record => ({ key: record.data().key, saved: { dashboard: record.data().dashboard } }));
}
