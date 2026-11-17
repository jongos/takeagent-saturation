import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {prepareBudgetReview,reviewBudgetDocumentBytes,createTrustedReviewContext} from '../src/index.js';

const trusted = fields => createTrustedReviewContext({
  workspaceId: 'ws_synthetic',
  projectId: 'prj_synthetic',
  revision: 'revision_issue1',
  importedAt: '2026-11-17T10:00:00Z',
  now: new Date('2026-11-17T11:00:00Z'),
  phaseMap: {originalBudget: 'estimate'},
  sourceScopeReviewed: true,
  phaseMappingReviewed: true,
  expectedCurrency: 'USD',
  ...fields
});

test('issue #1 regression: reconciled account tree with mismatched project grand total stays blocked', () => {
  const bytes = readFileSync(new URL('../examples/synthetic-blocked-grand-total-gap.json', import.meta.url));
  const result = reviewBudgetDocumentBytes(bytes, trusted());
  assert.equal(result.status, 'blocked');
  assert.equal(result.preview, null);
  assert.equal(result.issues[0].code, 'RECONCILIATION_MISMATCH');
  assert.equal(result.issues[0].scope, 'project');
  assert.equal(result.issues[0].referenceCode, 'SATURATION_GRAND_TOTALS_001');
});

test('issue #1 regression: line actuals without document project total cannot be joined or zero-filled', () => {
  const value = amount => ({amount, currency: 'USD'});
  const document = {
    id: 'budget_issue1_actuals',
    computedAt: '2026-11-17T09:00:00Z',
    selection: {},
    phases: [
      {id: 'estimate', isHidden: false},
      {id: 'actual', isHidden: false}
    ],
    totals: {estimate: value(10)},
    lines: [
      {id: 'account', type: 'account', parentId: null, depth: 0, values: {estimate: value(10), actual: value(0)}},
      {id: 'line', type: 'line', parentId: 'account', depth: 1, values: {estimate: value(10), actual: value(0)}}
    ]
  };
  const result = prepareBudgetReview(document, trusted({phaseMap: {originalBudget: 'estimate', actuals: 'actual'}}));
  assert.equal(result.status, 'blocked');
  assert.equal(result.issues[0].code, 'PROJECT_TOTAL_MISSING');
  assert.equal(result.issues[0].field, 'actuals');
  assert.equal(result.preview, null);
  assert.equal(Object.hasOwn(document.totals, 'actual'), false);
});