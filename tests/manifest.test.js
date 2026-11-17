import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
test('integration stays development-only with categorized blockers',async()=>{
  const manifest=JSON.parse(await readFile(new URL('../integration-manifest.json',import.meta.url),'utf8'));
  assert.equal(manifest.id,'saturation'); assert.equal(manifest.status,'development'); assert.equal(manifest.liveEnabled,false);
  assert.deepEqual([...new Set(manifest.blockers.map(item=>item.category))].sort(),['engineering','user','vendor']);
  assert.equal(manifest.sourceIssue,'https://github.com/jongos/takeagent/issues/57');
});
