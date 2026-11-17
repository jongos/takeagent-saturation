import test from 'node:test';
import assert from 'node:assert/strict';
import {createBoundedTransport} from '../src/transport.js';
const url='https://next-api.saturation.io/v1/me';
const json=body=>new Response(JSON.stringify(body),{headers:{'content-type':'application/json'}});
test('bounded transport forces GET and redirect prohibition and parses JSON',async()=>{
  let received;
  const transport=createBoundedTransport(async(target,options)=>{received={target,options};return json({id:'synthetic'});});
  assert.deepEqual(await (await transport(url,{method:'GET',redirect:'follow'})).json(),{id:'synthetic'});
  assert.equal(received.options.redirect,'error'); assert.equal(received.options.method,'GET');
  await assert.rejects(transport(url,{method:'POST'}),/read-only/);
  await assert.rejects(transport('https://other.example/v1/me'),/destination/);
});
test('declared and actual oversized streams are rejected and cancelled',async()=>{
  const declared=createBoundedTransport(async()=>new Response('{}',{headers:{'content-type':'application/json','content-length':'100'}}),{maxBytes:10});
  await assert.rejects(declared(url),/byte limit/);
  let cancelled=false;
  const stream=new ReadableStream({start(controller){controller.enqueue(new Uint8Array(11));},cancel(){cancelled=true;}});
  const actual=createBoundedTransport(async()=>new Response(stream,{headers:{'content-type':'application/json'}}),{maxBytes:10});
  await assert.rejects(actual(url),/byte limit/); assert.equal(cancelled,true);
});
test('deadline covers stalled body and cancellation even with non-cooperative stream',async()=>{
  let cancelled=false; let signal;
  const transport=createBoundedTransport(async(_,options)=>{
    signal=options.signal;
    return new Response(new ReadableStream({pull(){return new Promise(()=>{});},cancel(){cancelled=true;}}),{headers:{'content-type':'application/json'}});
  },{timeoutMs:15});
  await assert.rejects(transport(url),/timed out/); assert.equal(signal.aborted,true); assert.equal(cancelled,true);
});
test('caller abort propagates during stream read',async()=>{
  const controller=new AbortController();
  const transport=createBoundedTransport(async()=>new Response(new ReadableStream({start(){setTimeout(()=>controller.abort('private'),5);}}),{headers:{'content-type':'application/json'}}));
  await assert.rejects(transport(url,{signal:controller.signal}),error=>error.message==='Saturation request timed out or cancelled');
});
test('redirects, non-JSON and invalid encoding fail without leaking bodies',async()=>{
  const responses=[new Response(null,{status:302}),new Response('secret',{headers:{'content-type':'text/html'}}),new Response(new Uint8Array([0xff]),{headers:{'content-type':'application/json'}})];
  for(const response of responses) await assert.rejects(createBoundedTransport(async()=>response)(url),error=>!error.message.includes('secret'));
  const redirected=json({}); Object.defineProperty(redirected,'redirected',{value:true});
  await assert.rejects(createBoundedTransport(async()=>redirected)(url),/redirects/);
});
test('encoded traversal, doubled slashes, NUL and dot-segments are rejected',async()=>{
  const transport=createBoundedTransport(async()=>json({}));
  const blocked=[
    'https://next-api.saturation.io/v1/foo/..%2f..%2fadmin',
    'https://next-api.saturation.io/v1/me%00',
    'https://next-api.saturation.io/v1/foo//bar',
    'https://next-api.saturation.io/v1/%2e%2e/admin',
    'https://next-api.saturation.io/v1/foo%2fbar',
  ];
  for (const target of blocked) await assert.rejects(transport(target),/destination/);
});
test('HTTP failures expose status only; fetch/stream errors are redacted',async()=>{
  const failed=await createBoundedTransport(async()=>new Response('private',{status:401}))(url);
  assert.equal(failed.status,401); await assert.rejects(failed.json(),/not exposed/);
  await assert.rejects(createBoundedTransport(async()=>{throw new Error('private token');})(url),error=>error.message==='Saturation transport failure');
  const broken=new ReadableStream({pull(controller){controller.error(new Error('private token'));}});
  await assert.rejects(createBoundedTransport(async()=>new Response(broken,{headers:{'content-type':'application/json'}}))(url),error=>error.message==='Saturation response read failure');
});
