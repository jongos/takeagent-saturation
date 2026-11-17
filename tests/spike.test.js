import test from 'node:test';
import assert from 'node:assert/strict';
import {createReadClient} from '../src/client.js';
import {previewTotals} from '../src/preview.js';
const identity = {workspaces:[{workspaceId:'ws_test'}]};
function setup(responses, extra = {}) {
  const calls = [];
  const transport = async (url, options) => { calls.push({url, options}); const body = responses.shift(); return {ok: !body.status, status: body.status ?? 200, json: async () => body}; };
  return {calls, client:createReadClient({token:'synthetic',workspaceId:'ws_test',projectId:'prj_test',transport,...extra})};
}
const row = id => ({id, projectId:'prj_test',amount:{amount:-10,currency:'USD'},bank:'excluded'});
test('GET-only scoped pagination minimizes fields and preserves credits', async () => {
  const {client,calls} = setup([identity,{data:[row('a')],nextCursor:'next'},{data:[row('b')],nextCursor:null}]);
  const rows = await client.transactions();
  assert.equal(rows.length,2); assert.equal(rows[0].amount.amount,-10); assert.equal(rows[0].bank,undefined);
  assert.ok(calls.every(call => call.options.method === 'GET' && call.options.redirect === 'error'));
  assert.match(calls[2].url,/cursor=next/); assert.match(calls[1].url,/projectId=prj_test/);
});
test('wrong workspace stops before project read', async () => {
  const {client,calls} = setup([{workspaces:[{workspaceId:'other'}]}]);
  await assert.rejects(client.budgetTotals(),/Workspace/); assert.equal(calls.length,1);
});
test('wrong project or missing identity rejects all rows', async () => {
  for (const projectId of ['other',undefined]) {
    const {client} = setup([identity,{data:[{...row('a'),projectId}]}]);
    await assert.rejects(client.transactions(),/Project/);
  }
});
test('duplicates, repeated cursors, and page cap cannot return partial success', async () => {
  for (const [pages,extra,error] of [
    [[{data:[row('a')],nextCursor:'x'},{data:[row('a')]}],{},/Duplicate/],
    [[{data:[],nextCursor:'x'},{data:[],nextCursor:'x'}],{},/cursor/],
    [[{data:[],nextCursor:'x'}],{maxPages:1},/Page limit/]]) {
    const {client}=setup([identity,...pages],extra); await assert.rejects(client.transactions(),error);
  }
});
test('auth, revocation, rate limits and failures expose status without provider bodies', async () => {
  for (const status of [401,403,429,500]) {
    const {client}=setup([{status,message:'secret'}]);
    await assert.rejects(client.budgetTotals(), error => error.message === `Saturation HTTP ${status}`);
  }
});
test('disconnect invalidates client', async () => {
  const {client,calls}=setup([]); client.disconnect();
  await assert.rejects(client.budgetTotals(),/Disconnected/); assert.equal(calls.length,0);
});
const payload = {computedAt:'2026-11-01T00:00:00Z',totals:{estimate:{amount:100,currency:'USD'},actual:{amount:-2,currency:'USD'},other:{amount:10,currency:'USD'}}};
const context = {workspaceId:'ws_test',projectId:'prj_test',revision:'rev_1',phaseMap:{originalBudget:'estimate',actuals:'actual'},now:new Date('2026-11-17T00:00:00Z')};
test('preview is deterministic, preserves distinct unknowns and stale state', () => {
  const a=previewTotals(payload,context); const b=previewTotals(payload,context);
  assert.equal(a.fingerprint,b.fingerprint); assert.equal(a.snapshot.costs.actuals.amount,-2);
  assert.equal(a.snapshot.costs.openCommitments,null); assert.equal(a.stale,true);
  assert.equal(a.financePlanMutation,false); assert.deepEqual(a.unmappedPhaseIds,['other']);
});
test('ambiguous phase reuse and mixed currency reject', () => {
  assert.throws(()=>previewTotals(payload,{...context,phaseMap:{actuals:'actual',openCommitments:'actual'}}),/Ambiguous/);
  assert.throws(()=>previewTotals({...payload,totals:{...payload.totals,actual:{amount:1,currency:'EUR'}}},context),/Mixed currencies/);
});
test('new revision changes fingerprint; invalid amounts/dates fail', () => {
  assert.notEqual(previewTotals(payload,context).fingerprint,previewTotals(payload,{...context,revision:'rev_2'}).fingerprint);
  assert.throws(()=>previewTotals({...payload,computedAt:'invalid'},context),/date/);
  assert.throws(()=>previewTotals({...payload,totals:{estimate:{amount:NaN,currency:'USD'}}},{...context,phaseMap:{originalBudget:'estimate'}}),/amount/);
});
