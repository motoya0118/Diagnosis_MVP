const { getFlowAndResults } = require('../utils/extractFlow');
const { findDeadEnds, findPathToResult } = require('../utils/graphUtils');
const { formatTrail } = require('../debug/flowDebug');

describe('Career diagnose flow graph', () => {
  const START_ID = 'Q1';
  const MAX_DEPTH = 16;
  let results;
  let flow;

  beforeAll(() => {
    ({ results, flow } = getFlowAndResults());
  });

  test('findDeadEnds: no dead-ends reachable from Q1', () => {
    const dead = findDeadEnds(flow, START_ID, MAX_DEPTH);
    if (dead.length) {
      const reasons = dead.map((d) => ` - ${d.id}: ${d.reason}`).join('\n');
      const hint = [
        'Dead-ends detected. Fix broken links or ensure a path to a result.',
        'Tip: use the debug helper to inspect trails to a particular result:',
        "  import { formatTrail } from 'frontend/tests/debug/flowDebug'",
        '  // e.g., const p = findPathToResult(flow, "Q1", "PROMPT"); console.log(formatTrail(p))',
      ].join('\n');
      throw new Error(`Dead-ends reachable from Q1:\n${reasons}\n\n${hint}`);
    }
    expect(dead.length).toBe(0);
  });

  test('findPathToResult: every result key is reachable from Q1', () => {
    const keys = Object.keys(results);
    const missing = [];
    const examples = [];

    for (const key of keys) {
      const p = findPathToResult(flow, START_ID, key, MAX_DEPTH);
      if (!p) missing.push(key);
      else if (examples.length < 5) examples.push(`${key}: ${formatTrail(p)}`);
    }

    if (missing.length) {
      const hint = [
        'Some results have no path from the start node.',
        `Missing keys (${missing.length}): ${missing.join(', ')}`,
        'Tip: use the debug helper to trace a path that almost reaches your target and adjust the flow:',
        "  import { formatTrail } from 'frontend/tests/debug/flowDebug'",
        '  // p = findPathToResult(flow, "Q1", "<RESULT_KEY>"); console.log(formatTrail(p))',
      ].join('\n');
      throw new Error(hint);
    }

    expect(missing).toHaveLength(0);
    // Optionally log a few example trails for visibility in CI
    if (examples.length) {
      // eslint-disable-next-line no-console
      console.log('\nExample trails (first 5):');
      for (const ex of examples) console.log(` - ${ex}`);
    }
  });
});

