/**
 * Self-check for the fenced-JSON extractor — the one place where a parsing slip silently
 * discards a whole agent run's output.
 *
 * Run: npx tsx server/src/agents/verdict.check.ts
 */
import assert from 'node:assert';
import { extractLastJsonBlock, parseVerdict, suggestionsOutputSchema } from './verdict.js';

const F = '```';

// 1. The bug that lost a real batch of suggestions: a literal ```json inside a JSON string value.
const withInnerFence =
  'Przejrzałem kod.\n\n' +
  F +
  'json\n' +
  JSON.stringify([{ title: 'Testy', description: 'pokryć parseVerdict na blokach ' + F + 'json, i innych', rationale: 'brak testów', kind: 'improvement', effort: 'M', impact: 'M' }]) +
  '\n' +
  F;
const parsed = parseVerdict(suggestionsOutputSchema, withInnerFence);
assert.ok(parsed, 'inner ```json literal must not truncate the block');
assert.strictEqual(parsed.length, 1);
assert.strictEqual(parsed[0]!.title, 'Testy');

// 2. Output cut off before the closing fence still parses.
const truncated = 'prose\n\n' + F + 'json\n{"verdict":"approve","summary":"ok"}';
assert.deepStrictEqual(extractLastJsonBlock(truncated), { verdict: 'approve', summary: 'ok' });

// 3. The LAST block wins when several are present.
const twoBlocks =
  F + 'json\n{"n":1}\n' + F + '\nsome prose\n' + F + 'json\n{"n":2}\n' + F;
assert.deepStrictEqual(extractLastJsonBlock(twoBlocks), { n: 2 });

// 4. Bare JSON with no fence at all.
assert.deepStrictEqual(extractLastJsonBlock('  [1,2,3]  '), [1, 2, 3]);

// 5. Nothing parseable → null, never a throw.
assert.strictEqual(extractLastJsonBlock('no json here'), null);
assert.strictEqual(extractLastJsonBlock(F + 'json\nnot json at all\n' + F), null);

console.log('verdict.check: ok');
