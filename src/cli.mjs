import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { BM25, readCorpus } from './search.mjs';
import { answerQuestion } from './answer.mjs';
import { runRetrieval } from './run.mjs';

const [command, ...args] = process.argv.slice(2);
const usage = 'index <notes-dir> <index.json> | ask <index.json> <question> [--model NAME] [--url URL] [--k 5] | run <index.json> <questions.jsonl> <run.jsonl> [k]';
try {
  if (command === 'index' && args.length === 2) {
    const documents = await readCorpus(path.resolve(args[0]));
    const target = path.resolve(args[1]);
    await mkdir(path.dirname(target), { recursive: true });
    const temporary = `${target}.${process.pid}.tmp`;
    await writeFile(temporary, JSON.stringify({ version: 1, documents }, null, 2));
    await rename(temporary, target);
    console.log(JSON.stringify({ indexed: documents.length, file: target }));
  } else if (command === 'ask' && args.length >= 2) {
    const [file, question, ...flags] = args;
    const options = {};
    for (let i = 0; i < flags.length; i += 2) {
      if (!['--model', '--url', '--k'].includes(flags[i]) || !flags[i + 1]) throw new Error(usage);
      options[flags[i].slice(2)] = flags[i + 1];
    }
    const index = JSON.parse(await readFile(file, 'utf8'));
    if (index.version !== 1) throw new Error('Unsupported index version; rebuild it');
    const hits = new BM25(index.documents).search(question, options.k === undefined ? 5 : Number(options.k));
    const answer = await answerQuestion(question, hits, { model: options.model, baseUrl: options.url });
    console.log(JSON.stringify({ ...answer, evidence: hits.map(({ id, source, startLine, endLine, score }) => ({ id, source, startLine, endLine, score })) }, null, 2));
  } else if (command === 'run' && [3, 4].includes(args.length)) {
    const [indexFile, questionsFile, output, k] = args;
    const index = JSON.parse(await readFile(indexFile, 'utf8'));
    if (index.version !== 1) throw new Error('Unsupported index version; rebuild it');
    const cases = (await readFile(questionsFile, 'utf8')).replace(/^\uFEFF/, '').split(/\r?\n/).filter(line => line.trim()).map(line => JSON.parse(line));
    const run = runRetrieval(index.documents, cases, k === undefined ? 5 : Number(k));
    await writeFile(output, run.map(row => JSON.stringify(row)).join('\n') + '\n');
    console.log(JSON.stringify({ cases: run.length, mode: 'extractive-file-level', output }));
  } else throw new Error(usage);
} catch (error) { console.error(error.message); process.exitCode = 1; }
