import {createHash} from 'node:crypto';
import {previewTotals} from './preview.js';

const identifier = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
// Exact fixed precision comparisons; unsupported precision is rejected, never rounded.
function units(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('Invalid monetary amount');
  const match = /^(-?)(\d+)(?:\.(\d{1,4}))?$/.exec(String(value));
  if (!match) throw new Error('Unsupported amount precision (maximum four decimals)');
  const scaled = BigInt(match[2]) * 10000n + BigInt((match[3] ?? '').padEnd(4,'0'));
  if (scaled > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Amount exceeds supported range');
  return match[1] ? -scaled : scaled;
}

/** Full unfiltered BudgetDocument profile; account/line/credit only. */
export function reconcileBudgetDocument(document, context) {
  if (!identifier(document.id) || document.selection === null || typeof document.selection !== 'object' || Array.isArray(document.selection) || Object.keys(document.selection).length) throw new Error('A full unfiltered budget document is required');
  if (!Array.isArray(document.lines) || !document.lines.length || document.lines.length > 10000 || !Array.isArray(document.phases)) throw new Error('Invalid budget document');
  if (typeof context.importedAt !== 'string' || !Number.isFinite(Date.parse(context.importedAt)) || Date.parse(context.importedAt) < Date.parse(document.computedAt)) throw new Error('Invalid import timestamp');
  const preview = previewTotals(document, context);
  const phases = Object.values(context.phaseMap);
  const phaseIds = new Set();
  for (const phase of document.phases) {
    if (!identifier(phase.id) || phaseIds.has(phase.id)) throw new Error('Invalid or duplicate phase');
    phaseIds.add(phase.id);
  }
  for (const phase of phases) {
    const record = document.phases.find(p => p.id === phase);
    if (!record || record.isHidden !== false) throw new Error('Mapped phase is missing or hidden');
    // Phase definitions require explicit human review in the host, including actual filters.
    units(document.totals[phase].amount);
  }
  const byId = new Map();
  for (const row of document.lines) {
    if (!identifier(row.id) || byId.has(row.id)) throw new Error('Duplicate or invalid line ID');
    if (!['account','line','credit'].includes(row.type)) throw new Error('Unsupported computed line type; fringe reconciliation requires vendor validation');
    if (row.parentId !== null && !identifier(row.parentId)) throw new Error('Invalid parent ID');
    if (!Number.isInteger(row.depth) || row.depth < 0 || row.depth > 100) throw new Error('Invalid hierarchy depth');
    for (const field of ['accountId','path']) if (row[field] != null && (typeof row[field] !== 'string' || row[field].length > 512)) throw new Error('Invalid account provenance');
    if (!row.values || typeof row.values !== 'object') throw new Error('Missing line values');
    for (const phase of phases) {
      const value = row.values[phase];
      if (!value || value.currency !== document.totals[phase].currency) throw new Error('Missing phase value or currency mismatch');
      units(value.amount);
    }
    byId.set(row.id,row);
  }
  const children = new Map();
  for (const row of document.lines) {
    if (row.parentId !== null && !byId.has(row.parentId)) throw new Error('Missing parent');
    const ancestors = new Set([row.id]); let current = row;
    while (current.parentId !== null) {
      if (ancestors.has(current.parentId)) throw new Error('Cyclic hierarchy');
      ancestors.add(current.parentId); current = byId.get(current.parentId);
      if (!current) throw new Error('Missing parent');
    }
    if (row.depth !== ancestors.size - 1) throw new Error('Inconsistent hierarchy depth');
    const list = children.get(row.parentId) ?? []; list.push(row); children.set(row.parentId,list);
  }
  for (const [parentId, rows] of children) {
    if (parentId !== null && byId.get(parentId).type !== 'account') throw new Error('Only accounts may contain child lines');
    for (const phase of phases) {
      const expected = parentId === null ? document.totals[phase] : byId.get(parentId).values[phase];
      const sum = rows.reduce((total,row) => total + units(row.values[phase].amount),0n);
      if (sum !== units(expected.amount)) throw new Error(`Reconciliation mismatch at ${parentId ?? 'project'} for ${phase}`);
    }
  }
  const accounts = [...byId.values()].sort((a,b)=>a.id.localeCompare(b.id)).map(row=>({
    sourceLineId:row.id, accountCode:row.accountId ?? null, accountPath:row.path ?? null,
    parentSourceLineId:row.parentId, depth:row.depth, type:row.type,
    costs:Object.fromEntries(Object.keys(preview.snapshot.costs).map(field=>{
      const phase = context.phaseMap[field];
      return [field,phase ? {amount:row.values[phase].amount,currency:row.values[phase].currency,unit:'major',sourcePhaseId:phase} : null];
    }))
  }));
  const snapshot = {...preview.snapshot, schemaVersion:'1.0', sourceBudgetId:document.id, amountUnit:'major', accounts,
    reconciliation:{status:'reconciled',profile:'saturation-budget-document-account-line-credit-v1',scope:'Mapped phase totals and every parent-child account subtotal',transactionOverlapVerified:false}};
  const fingerprint = createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
  return {...preview,snapshot,fingerprint,importedAt:new Date(context.importedAt).toISOString(),reconciliation:snapshot.reconciliation,
    warnings:['Accounting costs do not establish financing commitments.','Phase semantics and actual/commitment overlap require host review.']};
}

export function compareSnapshots(previous, next) {
  for (const key of ['source','workspaceId','projectId','sourceBudgetId']) if (previous.snapshot[key] !== next.snapshot[key]) throw new Error('Snapshot scope mismatch');
  for (const field of Object.keys(next.snapshot.costs)) {
    const before = previous.snapshot.costs[field]; const after = next.snapshot.costs[field];
    if ((before?.sourcePhaseId ?? null) !== (after?.sourcePhaseId ?? null)) throw new Error('Phase mapping changed; review a new baseline');
    if ((before?.currency ?? null) !== (after?.currency ?? null) || before?.unit !== after?.unit) throw new Error('Currency or unit changed; review a new baseline');
  }
  if (next.snapshot.asOf < previous.snapshot.asOf) throw new Error('Older snapshot cannot replace newer evidence');
  if (previous.fingerprint === next.fingerprint) return {status:'duplicate',changes:[],accountChanges:[],financePlanMutation:false};
  if (previous.snapshot.revision === next.snapshot.revision) throw new Error('Revision conflict');
  const changes = [];
  for (const field of Object.keys(next.snapshot.costs)) {
    const before = previous.snapshot.costs[field]; const after = next.snapshot.costs[field];
    if (JSON.stringify(before) !== JSON.stringify(after)) changes.push({field,before,after});
  }
  const priorAccounts = new Map(previous.snapshot.accounts.map(row=>[row.sourceLineId,row]));
  const nextAccounts = new Map(next.snapshot.accounts.map(row=>[row.sourceLineId,row]));
  const accountChanges = [...new Set([...priorAccounts.keys(),...nextAccounts.keys()])].sort().flatMap(sourceLineId=>{
    const before=priorAccounts.get(sourceLineId) ?? null; const after=nextAccounts.get(sourceLineId) ?? null;
    return JSON.stringify(before) === JSON.stringify(after) ? [] : [{sourceLineId,before,after}];
  });
  return {status:'new-revision',changes,accountChanges,financePlanMutation:false};
}
