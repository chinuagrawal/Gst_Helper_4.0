export async function checkFirestore({ projectId, databaseId, uid, token, signal, fetcher = fetch }) {
  const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/${encodeURIComponent(databaseId)}/documents/users/${encodeURIComponent(uid)}/clients?pageSize=1`;
  const response = await fetcher(url, { headers: { Authorization: `Bearer ${token}` }, signal });
  if (response.ok) return;
  let payload;
  try { payload = await response.json(); } catch { /* report HTTP status */ }
  const error = new Error(payload?.error?.message || `Firestore returned HTTP ${response.status}.`);
  error.code = response.status === 404 ? 'not-found' : response.status === 403 ? 'permission-denied' : 'unavailable';
  throw error;
}
