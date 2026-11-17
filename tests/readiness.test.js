import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareBudgetReview,reviewBudgetDocumentBytes,offlineLimits,previewTotals,BudgetValidationError} from '@takeagent/saturation-spike';
const context={workspaceId:'ws_test',projectId:'prj_test',revision:'revision_1',importedAt:'2026-11-17T10:00:00Z',now:new Date('2026-11-17T11:00:00Z'),phaseMap:{originalBudget:'estimate'},sourceScopeReviewed:true,phaseMappingReviewed:true,expectedCurrency:'USD'};
const value=amount=>({amount,currency:'USD'});
function fixture() {return {id:'budget',computedAt:'2026-11-17T09:00:00Z',selection:{},phases:[{id:'estimate',isHidden:false}],totals:{estimate:value(10)},lines:[{id:'account',parentId:null,depth:0,type:'account',description:'private label',values:{estimate:value(10)}},{id:'line',parentId:'account',depth:1,type:'line',values:{estimate:value(10)}}]};}
const bytes=value=>new TextEncoder().encode(JSON.stringify(value));
test('public bytes entry produces minimized reconciled preview, not financial approval',()=>{
  const result=reviewBudgetDocumentBytes(bytes(fixture()),context);
  assert.equal(result.status,'ready-for-review'); assert.equal(result.reconciled,true);
  assert.equal(result.financialAcceptance,false); assert.equal(result.canApply,false); assert.equal(result.readOnly,true);
  assert.equal(result.preview.snapshot.costs.originalBudget.amount,10); assert.equal(result.preview.snapshot.costs.actuals,null);
  assert.equal(result.source.vendorProjectOwnershipVerified,false); assert.equal(result.source.projectIdentityBasis,'host-reviewed-mapping');
  assert.match(result.source.sha256,/^[a-f0-9]{64}$/); assert.equal(JSON.stringify(result).includes('private label'),false);
});
test('reviewed host project mapping and phase semantics are independently required',()=>{
  assert.equal(prepareBudgetReview(fixture(),{...context,sourceScopeReviewed:false}).issues[0].code,'SOURCE_SCOPE_REVIEW_REQUIRED');
  assert.equal(prepareBudgetReview(fixture(),{...context,phaseMappingReviewed:false}).issues[0].code,'PHASE_MAPPING_REVIEW_REQUIRED');
  assert.equal(prepareBudgetReview(fixture(),null).preview,null);
});
test('readiness requires authorized project currency and blocks a consistent foreign-currency report',()=>{
  assert.equal(prepareBudgetReview(fixture(),{...context,expectedCurrency:undefined}).issues[0].code,'PROJECT_CURRENCY_REQUIRED');
  const result=prepareBudgetReview(fixture(),{...context,expectedCurrency:'EUR'});
  assert.equal(result.issues[0].code,'CURRENCY_MISMATCH'); assert.equal(result.preview,null);
});
test('project discrepancy returns tracked blocker with no partial snapshot or amounts',()=>{
  const document=fixture(); document.totals.estimate.amount=12.34;
  const result=prepareBudgetReview(document,context);
  assert.equal(result.status,'blocked'); assert.equal(result.preview,null); assert.equal(result.reconciled,false);
  assert.equal(result.issues[0].code,'RECONCILIATION_MISMATCH'); assert.equal(result.issues[0].scope,'project');
  assert.equal(result.issues[0].referenceCode,'SATURATION_GRAND_TOTALS_001'); assert.equal(JSON.stringify(result).includes('github.com'),false);
  assert.equal(JSON.stringify(result).includes('12.34'),false);
});
test('account discrepancy has distinct scope without source ID leakage',()=>{
  const document=fixture(); document.lines[0].id='private_identifier'; document.lines[1].parentId='private_identifier'; document.lines[1].values.estimate.amount=9;
  const result=prepareBudgetReview(document,context);
  assert.equal(result.issues[0].scope,'account'); assert.equal(JSON.stringify(result).includes('private_identifier'),false);
});
test('missing actual total cannot be accepted because diagnostic reads worked',()=>{
  const document=fixture(); document.phases.push({id:'actual',isHidden:false});
  for (const row of document.lines) row.values.actual=value(0);
  const result=prepareBudgetReview(document,{...context,phaseMap:{actuals:'actual'},diagnosticTransactionsRead:true});
  assert.equal(result.status,'blocked'); assert.equal(result.issues[0].code,'PROJECT_TOTAL_MISSING'); assert.equal(result.issues[0].field,'actuals');
  assert.equal(result.preview,null); assert.equal(result.financialAcceptance,false);
});
test('bytes entry rejects oversize, malformed UTF-8 and malformed JSON before import',()=>{
  for(const input of [new Uint8Array(),new Uint8Array(offlineLimits.maxBytes+1),'text']) assert.equal(reviewBudgetDocumentBytes(input,context).issues[0].code,'SOURCE_BYTES_INVALID');
  for(const input of [new Uint8Array([0xff]),new TextEncoder().encode('{private')]) assert.equal(reviewBudgetDocumentBytes(input,context).issues[0].code,'SOURCE_JSON_INVALID');
  assert.equal(reviewBudgetDocumentBytes(bytes(null),context).issues[0].code,'DOCUMENT_INVALID');
});
test('unexpected implementation faults are redacted and distinct from validation blockers',()=>{
  const document={get id(){throw new Error('private token or imported text');}};
  const result=prepareBudgetReview(document,context);
  assert.equal(result.status,'failed'); assert.equal(result.issues[0].code,'INTERNAL_REVIEW_FAILURE'); assert.equal(JSON.stringify(result).includes('private token'),false);
});
test('stale but reconciled data requires review and retains unknown categories',()=>{
  const document=fixture(); document.computedAt='2026-10-01T00:00:00Z';
  const result=prepareBudgetReview(document,context);
  assert.equal(result.status,'ready-for-review'); assert.equal(result.issues[0].code,'STALE_SOURCE');
  assert.ok(result.issues.some(item=>item.code==='MISSING_COST_CATEGORIES')); assert.equal(result.canApply,false);
});
test('phase-only previews enforce the same exact precision/range as canonical snapshots',()=>{
  for(const amount of [1.12345,Number.MAX_SAFE_INTEGER]) {
    const document=fixture(); document.totals.estimate.amount=amount;
    assert.throws(()=>previewTotals(document,context),error=>error instanceof BudgetValidationError&&error.code==='AMOUNT_UNSUPPORTED');
  }
});
test('timestamps reject future imports, calendar rollover and ambiguous dates',()=>{
  assert.equal(prepareBudgetReview(fixture(),{...context,importedAt:'2026-11-18T00:00:00Z'}).issues[0].code,'PROVENANCE_INVALID');
  for(const computedAt of ['2026-02-30T00:00:00Z','11/17/2026','2026-11-17T25:00:00Z']) {
    const document=fixture(); document.computedAt=computedAt;
    assert.equal(prepareBudgetReview(document,context).issues[0].code,'PROVENANCE_INVALID');
  }
  const offset=fixture(); offset.computedAt='2026-11-17T04:00:00-05:00';
  assert.equal(prepareBudgetReview(offset,context).status,'ready-for-review');
});
