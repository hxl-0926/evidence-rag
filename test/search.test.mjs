import test from 'node:test';
import assert from 'node:assert/strict';
import { BM25, tokenize, chunkText } from '../src/search.mjs';
import { answerQuestion, validateAnswer } from '../src/answer.mjs';

test('mixed Chinese/English terms and normalization', () => {
  assert.deepEqual(tokenize('复习 API Ａ'), ['复', '习', '复习', 'api', 'a']);
});
test('BM25 ranks rare terms, handles empty corpus and repeated query', () => {
  const search = new BM25([{ id: 'a', text: 'spaced repetition memory' }, { id: 'b', text: 'memory memory memory' }]);
  assert.equal(search.search('spaced memory')[0].id, 'a');
  assert.deepEqual(search.search('spaced'), search.search('spaced spaced'));
  assert.deepEqual(new BM25([]).search('hello'), []);
  assert.deepEqual(search.search('unknown'), []);
  assert.throws(() => search.search('x', NaN));
});
test('chunking terminates, preserves line provenance and stable IDs', () => {
  const chunks = chunkText('one\ntwo\nthree\nfour', 'a.md', 8, 1);
  assert.ok(chunks.length < 10);
  for (const chunk of chunks) assert.equal(chunk.text, 'one\ntwo\nthree\nfour'.split('\n').slice(chunk.startLine - 1, chunk.endLine).join('\n'));
  assert.deepEqual(chunks, chunkText('one\ntwo\nthree\nfour', 'a.md', 8, 1));
  assert.equal(chunkText('x'.repeat(1000), 'b.md', 8).length, 1);
  assert.equal(chunkText('one\ntwo\nthree', 'b.md', 100).length, 1);
});
test('citation validation rejects hallucinated IDs', () => {
  assert.throws(() => validateAnswer({ answer: 'a', citations: ['invented'] }, [{ id: 'real' }]));
  assert.throws(() => validateAnswer({ answer: 'a', citations: [] }, []));
});
test('offline extracts; no evidence abstains without invoking model', async () => {
  assert.equal((await answerQuestion('x', [])).mode, 'abstain');
  assert.equal((await answerQuestion('x', [{ id: 'a', text: 'fact' }])).mode, 'extractive');
});
test('Ollama adapter sends evidence and validates response', async () => {
  const hits = [{ id: 'a', text: 'untrusted fact' }];
  const fetchImpl = async (url, init) => {
    assert.equal(url.pathname, '/api/generate');
    const request = JSON.parse(init.body);
    assert.equal(request.stream, false);
    assert.equal(JSON.parse(request.prompt).evidence[0].id, 'a');
    return new Response(JSON.stringify({ response: JSON.stringify({ answer: 'fact', citations: ['a'] }) }));
  };
  assert.equal((await answerQuestion('q', hits, { model: 'test', fetchImpl })).mode, 'generated');
  await assert.rejects(answerQuestion('q', hits, { model: 'test', fetchImpl: async () => new Response('down', { status: 503 }) }), /503/);
  await assert.rejects(answerQuestion('q', hits, { model: 'test', fetchImpl: async () => new Response(JSON.stringify({ response: 'bad' })) }), /invalid JSON/);
});
