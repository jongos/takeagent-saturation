import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {reviewBudgetDocumentBytes,compareSnapshots,createTrustedReviewContext} from '../src/index.js';
const context=createTrustedReviewContext({workspaceId:'synthetic_workspace',projectId:'synthetic_project',revision:'r1',importedAt:'2026-11-17T10:00:00Z',now:new Date('2026-11-17T11:00:00Z'),phaseMap:{originalBudget:'estimate'},sourceScopeReviewed:true,phaseMappingReviewed:true,expectedCurrency:'USD'});
test('offline example completes bytes, hierarchy, revision and blocked-source flow without network',()=>{
  const bytes=readFileSync(new URL('../examples/synthetic-budget.json',import.meta.url));
  const first=reviewBudgetDocumentBytes(bytes,context);
  assert.equal(first.status,'ready-for-review'); assert.equal(first.preview.snapshot.costs.originalBudget.amount,100);
  assert.equal(first.preview.snapshot.costs.actuals,null); assert.equal(first.canApply,false);
  const changed=JSON.parse(bytes); changed.lines[1].values.estimate.amount=120; changed.lines[0].values.estimate.amount=110; changed.totals.estimate.amount=110;
  const next=reviewBudgetDocumentBytes(Buffer.from(JSON.stringify(changed)),createTrustedReviewContext({...context,revision:'r2'}));
  assert.equal(compareSnapshots(first.preview,next.preview).changes[0].after.amount,110);
  changed.totals.estimate.amount=111;
  const blocked=reviewBudgetDocumentBytes(Buffer.from(JSON.stringify(changed)),context);
  assert.equal(blocked.preview,null); assert.equal(blocked.issues[0].code,'RECONCILIATION_MISMATCH');
});
