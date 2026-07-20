// Thin API client. Handles the browser-scoped voter identity and the
// locally-stored admin key so the rest of the UI stays declarative.

const VOTER_KEY = 'mindmap.voterId';
const ADMIN_KEY = 'mindmap.adminKey';

export function getVoterId() {
  let id = localStorage.getItem(VOTER_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(VOTER_KEY, id);
  }
  return id;
}

export function getAdminKey() {
  return localStorage.getItem(ADMIN_KEY) || '';
}
export function setAdminKey(key) {
  if (key) localStorage.setItem(ADMIN_KEY, key);
  else localStorage.removeItem(ADMIN_KEY);
}

async function req(method, url, body) {
  const headers = { 'Content-Type': 'application/json' };
  const adminKey = getAdminKey();
  if (adminKey) headers['x-admin-key'] = adminKey;
  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'request-failed');
  }
  return res.json();
}

export const api = {
  config: () => req('GET', '/api/config'),
  defaultMap: () => req('GET', '/api/default-map'),
  getMap: (id) => req('GET', `/api/maps/${id}`),
  propose: (mapId, { parentId, text, color }) =>
    req('POST', `/api/maps/${mapId}/proposals`, {
      parentId,
      text,
      color,
      authorId: getVoterId(),
    }),
  vote: (nodeId) => req('POST', `/api/nodes/${nodeId}/vote`, { voterId: getVoterId() }),
  moveNode: (nodeId, { x, y }) => req('POST', `/api/nodes/${nodeId}/position`, { x, y }),
  adminCommit: (nodeId) => req('POST', `/api/nodes/${nodeId}/commit`),
  adminDismiss: (nodeId) => req('POST', `/api/nodes/${nodeId}/dismiss`),
  adminDelete: (nodeId) => req('POST', `/api/nodes/${nodeId}/delete`),
  adminReparent: (nodeId, newParentId) =>
    req('POST', `/api/nodes/${nodeId}/reparent`, { newParentId }),
  bulkDelete: (ids) => req('POST', '/api/nodes/bulk-delete', { ids }),
  bulkReparent: (ids, newParentId) =>
    req('POST', '/api/nodes/bulk-reparent', { ids, newParentId }),
  addParent: (childId, parentId) =>
    req('POST', `/api/nodes/${childId}/parents`, { parentId }),
  removeParent: (childId, parentId) =>
    req('POST', `/api/nodes/${childId}/parents/remove`, { parentId }),
  // Validate an admin key against the server before persisting it.
  async unlockAdmin(key) {
    const res = await fetch('/api/admin/check', { headers: { 'x-admin-key': key } });
    if (!res.ok) throw new Error('invalid-admin-key');
    setAdminKey(key);
    return true;
  },
};
