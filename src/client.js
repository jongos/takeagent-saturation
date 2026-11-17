const BASE = 'https://next-api.saturation.io/v1';
const id = value => {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(value)) throw new Error('Invalid identifier');
  return value;
};

// No default network transport: the spike is inert until a host supplies one.
export function createReadClient({ token, workspaceId, projectId, transport, maxPages = 20 }) {
  id(workspaceId); id(projectId);
  if (typeof token !== 'string' || !token || /[\r\n]/.test(token)) throw new Error('Invalid token');
  if (typeof transport !== 'function' || !Number.isInteger(maxPages) || maxPages < 1 || maxPages > 100) throw new Error('Invalid configuration');
  let connected = true;
  async function get(path) {
    if (!connected) throw new Error('Disconnected');
    let response;
    try {
      response = await transport(`${BASE}${path}`, {method: 'GET', redirect: 'error', headers: {Authorization: `Bearer ${token}`}, signal: AbortSignal.timeout(10000)});
    } catch { throw new Error('Transport failure'); }
    if (!connected) throw new Error('Disconnected');
    if (!response.ok) throw new Error(`Saturation HTTP ${response.status}`);
    try { return await response.json(); } catch { throw new Error('Invalid JSON'); }
  }
  async function authorize() {
    const me = await get('/me');
    if (!Array.isArray(me.workspaces) || me.workspaces.length !== 1 || me.workspaces[0].workspaceId !== workspaceId) throw new Error('Workspace mismatch');
  }
  return {
    async budgetTotals() {
      await authorize();
      return get(`/projects/${projectId}/budget/totals`);
    },
    async transactions() {
      await authorize();
      const rows = []; const ids = new Set(); const cursors = new Set();
      let cursor;
      for (let pageNumber = 0; pageNumber < maxPages; pageNumber++) {
        const query = new URLSearchParams({projectId, limit: '100'});
        if (cursor) query.set('cursor', cursor);
        const page = await get(`/transactions?${query}`);
        if (!Array.isArray(page.data)) throw new Error('Invalid page');
        for (const row of page.data) {
          id(row.id);
          if (row.projectId !== projectId) throw new Error('Project mismatch or missing project identity');
          if (ids.has(row.id)) throw new Error('Duplicate transaction');
          if (!row.amount || !Number.isFinite(row.amount.amount) || !/^[A-Z]{3}$/.test(row.amount.currency)) throw new Error('Invalid amount');
          ids.add(row.id);
          // Minimize data: no contacts, payroll fields, descriptions or bank details.
          rows.push({id: row.id, projectId, amount: {amount: row.amount.amount, currency: row.amount.currency}});
        }
        if (page.nextCursor === undefined || page.nextCursor === null) return rows;
        if (typeof page.nextCursor !== 'string' || !page.nextCursor || page.nextCursor.length > 4096 || cursors.has(page.nextCursor)) throw new Error('Invalid or repeated cursor');
        cursors.add(page.nextCursor); cursor = page.nextCursor;
      }
      throw new Error('Page limit exceeded; no partial result returned');
    },
    disconnect() { connected = false; token = ''; }
  };
}
