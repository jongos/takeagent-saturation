import { createHash } from 'node:crypto';
import {rejectBudget} from './errors.js';
import {majorUnits} from './money.js';
import {timestamp} from './dates.js';
const fields = ['originalBudget', 'revisedBudget', 'actuals', 'openCommitments', 'estimateToComplete', 'estimatedFinalCost'];
// Explicit reviewed phase mapping is required. A phase name is never guessed.
export function previewTotals(payload, {workspaceId, projectId, revision, phaseMap, now = new Date(), maxAgeDays = 7} = {}) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) rejectBudget('DOCUMENT_INVALID','Invalid totals document');
  if (![workspaceId, projectId, revision].every(x => typeof x === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(x))) rejectBudget('PROVENANCE_INVALID','Missing provenance');
  const date = timestamp(payload.computedAt);
  if (!(now instanceof Date) || !Number.isFinite(now.getTime()) || !Number.isFinite(date) || date > now.getTime() || !Number.isFinite(maxAgeDays) || maxAgeDays < 0) rejectBudget('PROVENANCE_INVALID','Invalid report date');
  if (payload.filter && Object.keys(payload.filter).length) rejectBudget('SOURCE_SCOPE_UNSUPPORTED','Filtered totals cannot represent a full project');
  if (!payload.totals || typeof payload.totals !== 'object' || Array.isArray(payload.totals) || !phaseMap || typeof phaseMap !== 'object' || Array.isArray(phaseMap)) rejectBudget('MAPPING_INVALID','Missing totals or mapping');
  const costs = Object.fromEntries(fields.map(field => [field, null]));
  const used = new Set(); const currencies = new Set();
  for (const [field, phase] of Object.entries(phaseMap)) {
    if (!fields.includes(field) || typeof phase !== 'string' || used.has(phase)) rejectBudget('MAPPING_INVALID','Ambiguous phase mapping');
    if (!Object.hasOwn(payload.totals, phase)) rejectBudget('PROJECT_TOTAL_MISSING','Mapped phase has no project total; independent reconciliation is required',{field});
    const value = payload.totals[phase];
    if (!value || !Number.isFinite(value.amount) || !/^[A-Z]{3}$/.test(value.currency)) rejectBudget('AMOUNT_INVALID','Invalid phase amount');
    majorUnits(value.amount);
    used.add(phase); currencies.add(value.currency);
    costs[field] = {amount: value.amount, currency: value.currency, unit: 'major', sourcePhaseId: phase};
  }
  if (currencies.size > 1) rejectBudget('CURRENCY_MISMATCH','Mixed currencies require explicit FX reconciliation');
  if (!used.size) rejectBudget('MAPPING_INVALID','Empty phase mapping');
  const snapshot = {source: 'saturation', workspaceId, projectId, revision, asOf: new Date(date).toISOString(), costs};
  const fingerprint = createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
  return {snapshot, fingerprint, stale: now.getTime() - date > maxAgeDays * 86400000,
    missingFields: fields.filter(field => costs[field] === null),
    unmappedPhaseIds: Object.keys(payload.totals).filter(phase => !used.has(phase)).sort(),
    reconciliation: 'Phase totals only; account-level and transaction reconciliation not yet implemented',
    financePlanMutation: false};
}
