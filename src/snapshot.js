import {createHash} from 'node:crypto';
import {previewTotals} from './preview.js';
import {rejectBudget} from './errors.js';
import {majorUnits as units} from './money.js';
import {timestamp} from './dates.js';

const identifier = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);

/** Full unfiltered BudgetDocument profile; account/line/credit only. */
export function reconcileBudgetDocument(document, context) {
  if (!document || typeof document !== 'object' || Array.isArray(document) || !context || typeof context !== 'object') rejectBudget('DOCUMENT_INVALID','Invalid budget document or context');
  if (!identifier(document.id) || document.selection === null || typeof document.selection !== 'object' || Array.isArray(document.selection) || Object.keys(document.selection).length) rejectBudget('SOURCE_SCOPE_UNSUPPORTED','A full unfiltered budget document is required');
  if (!Array.isArray(document.lines) || !document.lines.length || document.lines.length > 10000 || !Array.isArray(document.phases)) rejectBudget('DOCUMENT_INVALID','Invalid budget document');
  const now = context.now ?? new Date();
  const importedAt = timestamp(context.importedAt);
  if (!(now instanceof Date) || !Number.isFinite(now.getTime()) || !Number.isFinite(importedAt) || importedAt < timestamp(document.computedAt) || importedAt > now.getTime()) rejectBudget('PROVENANCE_INVALID','Invalid import timestamp');
  const preview = previewTotals(document, {...context,now});
  const phases = Object.values(context.phaseMap);
  const phaseIds = new Set();
  for (const phase of document.phases) {
    if (!phase || !identifier(phase.id) || phaseIds.has(phase.id)) rejectBudget('PHASE_UNAVAILABLE','Invalid or duplicate phase');
    phaseIds.add(phase.id);
  }
  for (const phase of phases) {
    const record = document.phases.find(p => p.id === phase);
    if (!record || record.isHidden !== false) rejectBudget('PHASE_UNAVAILABLE','Mapped phase is missing or hidden');
    // Phase definitions require explicit human review in the host, including actual filters.
    units(document.totals[phase].amount);
  }
  const byId = new Map();
  for (const row of document.lines) {
    if (!row || !identifier(row.id) || byId.has(row.id)) rejectBudget('HIERARCHY_INVALID','Duplicate or invalid line ID');
    if (!['account','line','credit'].includes(row.type)) rejectBudget('LINE_TYPE_UNSUPPORTED','Unsupported computed line type; fringe reconciliation requires vendor validation');
    if (row.parentId !== null && !identifier(row.parentId)) rejectBudget('HIERARCHY_INVALID','Invalid parent ID');
    if (!Number.isInteger(row.depth) || row.depth < 0 || row.depth > 100) rejectBudget('HIERARCHY_INVALID','Invalid hierarchy depth');
    for (const field of ['accountId','path']) if (row[field] != null && (typeof row[field] !== 'string' || row[field].length > 512)) rejectBudget('PROVENANCE_INVALID','Invalid account provenance');
    if (!row.values || typeof row.values !== 'object') rejectBudget('LINE_VALUE_MISSING','Missing line values');
    for (const phase of phases) {
      const value = row.values[phase];
      if (!value) rejectBudget('LINE_VALUE_MISSING','Missing phase value');
      if (value.currency !== document.totals[phase].currency) rejectBudget('CURRENCY_MISMATCH','Phase value currency mismatch');
      units(value.amount);
    }
    byId.set(row.id,row);
  }
  const children = new Map();
  for (const row of document.lines) {
    if (row.parentId !== null && !byId.has(row.parentId)) rejectBudget('HIERARCHY_INVALID','Missing parent');
    const ancestors = new Set([row.id]); let current = row;
    while (current.parentId !== null) {
      if (ancestors.has(current.parentId)) rejectBudget('HIERARCHY_INVALID','Cyclic hierarchy');
      ancestors.add(current.parentId); current = byId.get(current.parentId);
      if (!current) rejectBudget('HIERARCHY_INVALID','Missing parent');
      if (ancestors.size > 101) rejectBudget('HIERARCHY_INVALID','Hierarchy exceeds supported depth');
    }
    if (row.depth !== ancestors.size - 1) rejectBudget('HIERARCHY_INVALID','Inconsistent hierarchy depth');
    const list = children.get(row.parentId) ?? []; list.push(row); children.set(row.parentId,list);
  }
  for (const [parentId, rows] of children) {
    if (parentId !== null && byId.get(parentId).type !== 'account') rejectBudget('HIERARCHY_INVALID','Only accounts may contain child lines');
    for (const phase of phases) {
      const expected = parentId === null ? document.totals[phase] : byId.get(parentId).values[phase];
      const sum = rows.reduce((total,row) => total + units(row.values[phase].amount),0n);
      if (sum !== units(expected.amount)) rejectBudget('RECONCILIATION_MISMATCH',`Reconciliation mismatch at ${parentId === null ? 'project' : 'account'}`,{scope:parentId === null ? 'project' : 'account'});
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
