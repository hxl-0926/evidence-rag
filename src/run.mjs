import { performance } from 'node:perf_hooks';
import { BM25 } from './search.mjs';

// File-level IDs let evaluation labels survive changes in chunk boundaries.
export function runRetrieval(documents, cases, k = 5) {
  if (!Number.isInteger(k) || k < 1 || k > 100) throw new Error('k must be 1..100');
  const ids = new Set();
  if (!Array.isArray(cases) || !cases.length) throw new Error('Expected non-empty questions');
  for (const c of cases) {
    if (typeof c.id !== 'string' || !c.id || ids.has(c.id) || typeof c.query !== 'string') throw new Error('Questions need unique IDs and query strings');
    ids.add(c.id);
  }
  if (documents.some(d => typeof d.source !== 'string')) throw new Error('Documents need source paths');
  const search = new BM25(documents);
  return cases.map(({ id, query }) => {
    const start = performance.now();
    // Consider the top 100 chunks, deduplicate by source, then keep k files.
    const hits = search.search(query, 100);
    const retrieved = [...new Set(hits.map(h => h.source))].slice(0, k);
    return { id, retrieved, citations: retrieved, abstained: !retrieved.length, latencyMs: performance.now() - start };
  });
}
