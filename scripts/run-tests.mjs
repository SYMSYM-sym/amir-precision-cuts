#!/usr/bin/env node
/**
 * run-tests.mjs — `npm test`, with the two ways node --test lies removed.
 *
 * WHY THIS WRAPPER EXISTS
 *
 * `node --test scripts/*.test.mjs` exits 0 in at least two situations where the
 * suite did not actually pass. Both were hit for real in this repo:
 *
 *   1. A THROW FROM A describe() BODY. The callback runs at collection time, so
 *      a ReferenceError there kills the suite before any it() is registered.
 *      node reports `not ok <n> - <suite name>` with `failureType:
 *      testCodeFailure`, counts ZERO tests from that file, and still exits 0.
 *      This shipped for days: `describe('duplicated constants stay in sync')`
 *      called `test(...)` without importing it, so the one assertion protecting
 *      FEED_MAX from drifting never ran, and `npm test` was green the whole time.
 *
 *   2. SILENT SKIPS. layout-css.test.mjs skips itself when fixtures/ is absent,
 *      which is correct behaviour for a client repo but catastrophic in the
 *      template repo — those are the checks that catch a CSS rule written into
 *      the wrong variant partition. "77 pass, 0 fail, 8 skipped" reads green.
 *
 * So: run the same command, then read the TAP output and fail on any `not ok`
 * at any nesting depth, on any skip, and on a test count below the floor. A
 * count floor also catches a whole test FILE failing to load.
 */
import { spawnSync } from 'node:child_process';

// Raise this when tests are added. It is deliberately a floor, not an equality:
// the point is to catch a file that silently stopped contributing, not to make
// adding a test a two-file change.
const MIN_TESTS = 95;

const res = spawnSync(
  process.execPath,
  ['--test', ...process.argv.slice(2).length ? process.argv.slice(2) : ['scripts/']],
  { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
);

const out = (res.stdout || '') + (res.stderr || '');
process.stdout.write(out);

const problems = [];

const notOk = out.split('\n').filter((l) => /^\s*not ok \d+/.test(l));
if (notOk.length) {
  problems.push(
    `${notOk.length} TAP failure line(s) — including suites that node --test does not count:\n` +
      notOk.map((l) => `      ${l.trim()}`).join('\n'),
  );
}

const num = (label) => {
  const m = out.match(new RegExp(`^# ${label} (\\d+)$`, 'm'));
  return m ? Number(m[1]) : null;
};

const tests = num('tests');
const skipped = num('skipped');

if (tests === null) {
  problems.push('no "# tests" summary line — the runner did not finish');
} else if (tests < MIN_TESTS) {
  problems.push(
    `only ${tests} tests ran, expected at least ${MIN_TESTS}. ` +
      'A test file that fails to load reports zero tests and exits 0.',
  );
}

if (skipped) {
  problems.push(
    `${skipped} test(s) skipped. In this repo that almost always means fixtures/ ` +
      'is missing and the per-variant CSS checks did not run — those are the ones ' +
      'that catch a rule written into the wrong partition block.',
  );
}

if (res.status !== 0) problems.push(`node --test exited ${res.status}`);

if (problems.length) {
  console.error('\nFAIL  npm test\n');
  for (const p of problems) console.error(`  • ${p}`);
  console.error('');
  process.exit(1);
}

console.log(`\nOK    ${tests} tests, 0 failed, 0 skipped.`);
