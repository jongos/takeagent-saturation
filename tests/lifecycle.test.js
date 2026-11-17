import test from 'node:test';
import assert from 'node:assert/strict';
import {createReadClient} from '../src/client.js';
const me={workspaces:[{workspaceId:'ws_test'}]};
const row={id:'txn_test',projectId:'prj_test',amount:{amount:100,currency:'USD'}};
function clientFor(bodies) {
  return createReadClient({workspaceId:'ws_test',projectId:'prj_test',token:'synthetic',transport:async()=>({ok:true,json:async()=>bodies.shift()})});
}
test('count mismatch, oversized page, fractional minor amount and null envelopes fail',async()=>{
  for (const page of [{data:[row],count:2},{data:Array(101).fill(row)},{data:[{...row,amount:{amount:1.2,currency:'USD'}}]},null]) {
    await assert.rejects(clientFor([me,page]).transactions());
  }
});
test('token revoked on a later page cannot return partial data or be reused',async()=>{
  let count=0;
  const client=createReadClient({workspaceId:'ws_test',projectId:'prj_test',token:'synthetic',transport:async()=>{
    count++; return count===3 ? {ok:false,status:401} : {ok:true,json:async()=>count===1 ? me : {data:[row],nextCursor:'next'}};
  }});
  await assert.rejects(client.transactions(),/401/); await assert.rejects(client.transactions(),/Disconnected/); assert.equal(count,3);
});
test('disconnect during body parsing prevents return and aborts request signal',async()=>{
  let resolveBody; let signal;
  const client=createReadClient({workspaceId:'ws_test',projectId:'prj_test',token:'synthetic',transport:async(url,options)=>{
    signal=options.signal; return {ok:true,json:()=>new Promise(resolve=>{resolveBody=resolve;})};
  }});
  const pending=client.budgetDocument();
  await new Promise(resolve=>setImmediate(resolve)); client.disconnect(); resolveBody(me);
  await assert.rejects(pending,/Disconnected/); assert.equal(signal.aborted,true);
});
test('transport errors exclude provider secrets',async()=>{
  const client=createReadClient({workspaceId:'ws_test',projectId:'prj_test',token:'synthetic',transport:async()=>{throw new Error('private token');}});
  await assert.rejects(client.budgetTotals(),error=>error.message==='Transport failure');
});
test('configured page size is bounded and enforced against responses',async()=>{
  for (const pageSize of [0,101,1.5]) assert.throws(()=>createReadClient({workspaceId:'ws_test',projectId:'prj_test',token:'synthetic',transport:async()=>{},pageSize}),/configuration/);
  let count=0; const urls=[];
  const client=createReadClient({workspaceId:'ws_test',projectId:'prj_test',token:'synthetic',pageSize:1,transport:async url=>{
    urls.push(url); count++; return {ok:true,json:async()=>count===1?me:{data:[row,{...row,id:'second'}]}};
  }});
  await assert.rejects(client.transactions(),/Invalid page/); assert.match(urls[1],/limit=1&/);
});

test('pagination rejects increasing and decreasing counts without partial results',async()=>{
  for(const counts of [[3,2],[2,3]]) {
    await assert.rejects(clientFor([me,{data:[row],count:counts[0],nextCursor:'next'},{data:[{...row,id:'second'}],count:counts[1]}]).transactions(),/collection changed/);
  }
});
test('pagination retains observed count when later omitted and supports stable or absent counts',async()=>{
  const first={data:[row],count:2,nextCursor:'next'};
  const second={data:[{...row,id:'second'}]};
  assert.equal((await clientFor([me,first,{...second,count:2}]).transactions()).length,2);
  assert.equal((await clientFor([me,first,second]).transactions()).length,2);
  assert.equal((await clientFor([me,{...first,count:undefined},second]).transactions()).length,2);
  await assert.rejects(clientFor([me,{...first,count:3},second]).transactions(),/Incomplete/);
});
