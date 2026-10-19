import test from 'node:test';
import assert from 'node:assert/strict';
import { runRetrieval } from '../src/run.mjs';

test('evaluation runner deduplicates file IDs and emits unanswerable cases', () => {
  const documents = [{ id: 'a', source: 'a.md', text: 'atomic transaction' }, { id: 'b', source: 'a.md', text: 'transaction' }, { id: 'c', source: 'b.md', text: 'atomic' }];
  const result = runRetrieval(documents, [{ id: 'q1', query: 'transaction' }, { id: 'q2', query: 'unseen' }], 3);
  assert.deepEqual(result[0].retrieved, ['a.md']);
  assert.equal(result[1].abstained, true);
  assert.ok(result.every(r => r.latencyMs >= 0));
  assert.throws(() => runRetrieval(documents, [{ id: 'a', query: 'x' }, { id: 'a', query: 'y' }]));
  assert.throws(() => runRetrieval(documents, [{ id: 'a', query: 'x' }], -1));
});
