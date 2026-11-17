import { createHash } from 'node:crypto';
const fields = ['originalBudget', 'revisedBudget', 'actuals', 'openCommitments', 'estimateToComplete', 'estimatedFinalCost'];
// Explicit reviewed phase mapping is required. A phase name is never guessed.
export function previewTotals(payload, {workspaceId, projectId, revision, phaseMap, now = new Date(), maxAgeDays = 7}) {
  if (![workspaceId, projectId, revision].every(x => typeof x === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(x))) throw new Error('Missing provenance');
  const date = Date.parse(payload.computedAt);
  if (!Number.isFinite(now.getTime()) || !Number.isFinite(date) || date > now.getTime() || !Number.isFinite(maxAgeDays) || maxAgeDays < 0) throw new Error('Invalid report date');
  if (payload.filter && Object.keys(payload.filter).length) throw new Error('Filtered totals cannot represent a full project');
  if (!payload.totals || typeof payload.totals !== 'object' || !phaseMap || typeof phaseMap !== 'object') throw new Error('Missing totals or mapping');
  const costs = Object.fromEntries(fields.map(field => [field, null]));
  const used = new Set(); const currencies = new Set();
  for (const [field, phase] of Object.entries(phaseMap)) {
    if (!fields.includes(field) || typeof phase !== 'string' || used.has(phase) || !Object.hasOwn(payload.totals, phase)) throw new Error('Ambiguous phase mapping');
    const value = payload.totals[phase];
    if (!value || !Number.isFinite(value.amount) || !/^[A-Z]{3}$/.test(value.currency)) throw new Error('Invalid phase amount');
    used.add(phase); currencies.add(value.currency);
    costs[field] = {amount: value.amount, currency: value.currency, unit: 'major', sourcePhaseId: phase};
  }
  if (currencies.size > 1) throw new Error('Mixed currencies require explicit FX reconciliation');
  if (!used.size) throw new Error('Empty phase mapping');
  const snapshot = {source: 'saturation', workspaceId, projectId, revision, asOf: new Date(date).toISOString(), costs};
  const fingerprint = createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
  return {snapshot, fingerprint, stale: now.getTime() - date > maxAgeDays * 86400000,
    missingFields: fields.filter(field => costs[field] === null),
    unmappedPhaseIds: Object.keys(payload.totals).filter(phase => !used.has(phase)).sort(),
    reconciliation: 'Phase totals only; account-level and transaction reconciliation not yet implemented',
    financePlanMutation: false};
}
