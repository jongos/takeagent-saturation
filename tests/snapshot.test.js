import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcileBudgetDocument,compareSnapshots} from '../src/snapshot.js';
const value = amount => ({amount,currency:'USD'});
function fixture() {
  return {id:'bud_test',computedAt:'2026-11-17T10:00:00Z',selection:{},phases:[{id:'estimate',isHidden:false}],totals:{estimate:value(99.9)},lines:[
    {id:'account',type:'account',parentId:null,depth:0,accountId:'0100',path:'0100',values:{estimate:value(99.9)}},
    {id:'line',type:'line',parentId:'account',depth:1,accountId:'0110',path:'0100/0110',values:{estimate:value(100.1)},description:'Exclude personal text'},
    {id:'credit',type:'credit',parentId:'account',depth:1,values:{estimate:value(-0.2)}}]};
}
const context = {workspaceId:'ws_test',projectId:'prj_test',revision:'rev_1',phaseMap:{originalBudget:'estimate'},now:new Date('2026-11-17T11:00:00Z'),importedAt:'2026-11-17T10:30:00Z'};
test('reconcile child, account and project totals exactly without double counting',()=>{
  const result=reconcileBudgetDocument(fixture(),context);
  assert.equal(result.snapshot.costs.originalBudget.amount,99.9);
  assert.equal(result.snapshot.reconciliation.status,'reconciled');
  assert.equal(result.snapshot.accounts.length,3);
  assert.equal(result.snapshot.accounts[0].accountCode,'0100');
  assert.equal(result.snapshot.accounts[0].costs.actuals,null);
  assert.equal(JSON.stringify(result).includes('personal'),false);
  assert.equal(result.snapshot.amountUnit,'major');
});
test('line order and import time do not change content fingerprint',()=>{
  const document=fixture(); const first=reconcileBudgetDocument(document,context);
  document.lines.reverse();
  assert.equal(first.fingerprint,reconcileBudgetDocument(document,{...context,importedAt:'2026-11-17T10:45:00Z'}).fingerprint);
});
test('account and project mismatches fail independently',()=>{
  const child=fixture(); child.lines[1].values.estimate.amount=100;
  assert.throws(()=>reconcileBudgetDocument(child,context),/Reconciliation mismatch at account/);
  const total=fixture(); total.totals.estimate.amount=100;
  assert.throws(()=>reconcileBudgetDocument(total,context),/Reconciliation mismatch at project/);
});
test('cycles, missing parents, duplicate IDs and depth corruption fail',()=>{
  const cases=[d=>{d.lines[0].parentId='line';},d=>{d.lines[1].parentId='missing';},d=>{d.lines[1].id='account';},d=>{d.lines[1].depth=0;}];
  for (const corrupt of cases) { const document=fixture(); corrupt(document); assert.throws(()=>reconcileBudgetDocument(document,context)); }
});
test('filtered, hidden, unsupported type, currency and precision fail closed',()=>{
  const cases=[d=>{d.selection={path:'0100'};},d=>{d.phases[0].isHidden=true;},d=>{d.lines[2].type='fringe';},d=>{d.lines[1].values.estimate.currency='EUR';},d=>{d.lines[1].values.estimate.amount=100.12345;}];
  for (const corrupt of cases) { const document=fixture(); corrupt(document); assert.throws(()=>reconcileBudgetDocument(document,context)); }
});
test('duplicate import, conflicting revision and cross-scope comparisons',()=>{
  const first=reconcileBudgetDocument(fixture(),context);
  assert.equal(compareSnapshots(first,first).status,'duplicate');
  const changed=fixture(); changed.lines[1].values.estimate.amount=101.1; changed.lines[0].values.estimate.amount=100.9; changed.totals.estimate.amount=100.9;
  assert.throws(()=>compareSnapshots(first,reconcileBudgetDocument(changed,context)),/Revision conflict/);
  const next=reconcileBudgetDocument(changed,{...context,revision:'rev_2'});
  assert.equal(compareSnapshots(first,next).changes[0].after.amount,100.9);
  assert.equal(compareSnapshots(first,next).financePlanMutation,false);
  assert.throws(()=>compareSnapshots(first,reconcileBudgetDocument(fixture(),{...context,projectId:'other'})),/scope/);
});
test('currency or phase mapping changes require a new baseline',()=>{
  const first=reconcileBudgetDocument(fixture(),context);
  const currency=fixture(); currency.totals.estimate.currency='EUR'; for(const row of currency.lines) row.values.estimate.currency='EUR';
  assert.throws(()=>compareSnapshots(first,reconcileBudgetDocument(currency,{...context,revision:'rev_2'})),/Currency/);
  const mapped=reconcileBudgetDocument(fixture(),{...context,revision:'rev_2',phaseMap:{revisedBudget:'estimate'}});
  assert.throws(()=>compareSnapshots(first,mapped),/mapping/);
});
test('offsetting account changes appear even when project totals are unchanged',()=>{
  const first=reconcileBudgetDocument(fixture(),context); const changed=fixture();
  changed.lines[1].values.estimate.amount=101.1; changed.lines[2].values.estimate.amount=-1.2;
  const result=compareSnapshots(first,reconcileBudgetDocument(changed,{...context,revision:'rev_2'}));
  assert.equal(result.changes.length,0); assert.equal(result.accountChanges.length,2);
  assert.deepEqual(result.accountChanges.map(change=>change.sourceLineId),['credit','line']);
});
test('visible phase line values without a project total stay blocked, never zero-filled',()=>{
  const document=fixture(); document.phases.push({id:'actual',isHidden:false});
  for(const row of document.lines) row.values.actual=value(0);
  assert.throws(()=>reconcileBudgetDocument(document,{...context,phaseMap:{actuals:'actual'}}),/Mapped phase has no project total/);
  assert.equal(Object.hasOwn(document.totals,'actual'),false);
});
