import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

// Individual Han characters preserve recall; bigrams reward phrase matches.
export function tokenize(text) {
  const terms = [];
  for (const word of text.normalize('NFKC').toLowerCase().match(/[\p{Script=Han}]+|[\p{L}\p{N}_]+/gu) ?? []) {
    if (/\p{Script=Han}/u.test(word)) {
      terms.push(...word);
      for (let i = 0; i < word.length - 1; i++) terms.push(word.slice(i, i + 2));
    } else terms.push(word);
  }
  return terms;
}

export function chunkText(text, source, maxChars = 700, overlapLines = 1) {
  if (!Number.isInteger(maxChars) || maxChars < 1 || !Number.isInteger(overlapLines) || overlapLines < 0) throw new Error('Invalid chunk settings');
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const chunks = [];
  let start = 0;
  while (start < lines.length) {
    let end = start, size = 0;
    do { size += lines[end].length + 1; end++; } while (end < lines.length && size + lines[end].length < maxChars);
    const body = lines.slice(start, end).join('\n').trim();
    if (body) chunks.push({ id: createHash('sha256').update(`${source}\0${start + 1}\0${body}`).digest('hex').slice(0, 16), source, startLine: start + 1, endLine: end, text: body });
    if (end === lines.length) break;
    // Always move forward, including when one long line exceeds maxChars.
    start = Math.max(start + 1, end - overlapLines);
  }
  return chunks;
}

export async function readCorpus(root) {
  const documents = [];
  async function walk(directory) {
    for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name.startsWith('.') || entry.isSymbolicLink()) continue;
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (/\.(md|txt)$/i.test(entry.name)) {
        documents.push(...chunkText(await readFile(full, 'utf8'), path.relative(root, full).split(path.sep).join('/')));
      }
    }
  }
  await walk(root);
  return documents;
}

export class BM25 {
  constructor(documents, { k1 = 1.2, b = 0.75 } = {}) {
    if (!Array.isArray(documents) || documents.some(d => typeof d.text !== 'string' || typeof d.id !== 'string') || new Set(documents.map(d => d.id)).size !== documents.length) throw new Error('Documents need unique string IDs and text');
    this.documents = documents;
    this.k1 = k1; this.b = b;
    this.rows = documents.map(d => {
      const terms = tokenize(d.text), frequencies = new Map();
      for (const term of terms) frequencies.set(term, (frequencies.get(term) ?? 0) + 1);
      return { length: terms.length, frequencies };
    });
    this.average = this.rows.reduce((sum, row) => sum + row.length, 0) / (this.rows.length || 1) || 1;
    this.df = new Map();
    for (const row of this.rows) for (const term of row.frequencies.keys()) this.df.set(term, (this.df.get(term) ?? 0) + 1);
  }
  search(query, k = 5) {
    if (!Number.isInteger(k) || k < 1 || k > 100) throw new Error('k must be an integer from 1 to 100');
    const terms = [...new Set(tokenize(query))];
    return this.rows.map((row, i) => {
      let score = 0;
      for (const term of terms) {
        const tf = row.frequencies.get(term) ?? 0;
        if (!tf) continue;
        const df = this.df.get(term);
        const idf = Math.log(1 + (this.rows.length - df + 0.5) / (df + 0.5));
        score += idf * tf * (this.k1 + 1) / (tf + this.k1 * (1 - this.b + this.b * row.length / this.average));
      }
      return { ...this.documents[i], score };
    }).filter(d => d.score > 0).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, k);
  }
}
