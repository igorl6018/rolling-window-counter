import { test } from 'node:test';
import assert from 'node:assert/strict';

import { RollingWindowCounter } from '../src/index.js';

// Deterministic clock shared by every test. The counter stores nothing that
// depends on wall-clock behaviour, so driving `now` from here is enough to
// cover the time-based edges without any sleeping.
function makeClock() {
  let t = 0;
  return {
    advance(ms) {
      t += ms;
    },
    set(ms) {
      t = ms;
    },
    get now() {
      return t;
    },
    fn() {
      return t;
    },
  };
}

test('counts events recorded in the current window', () => {
  const clk = makeClock();
  const c = new RollingWindowCounter(1000, clk.fn);
  clk.advance(100);
  assert.equal(c.record(), 1);
  assert.equal(c.record(2), 3);
  assert.equal(c.count(), 3);
});

test('coalesces records that share a timestamp', () => {
  const clk = makeClock();
  const c = new RollingWindowCounter(1000, clk.fn);
  c.record(1);
  c.record(2);
  c.record(3);
  assert.equal(c.count(), 6);
});

test('expires entries once the window has passed', () => {
  const clk = makeClock();
  const c = new RollingWindowCounter(1000, clk.fn);
  clk.set(0);
  assert.equal(c.record(5), 5);
  clk.advance(999);
  assert.equal(c.count(), 5);
  clk.advance(1); // now exactly 1000 since record; boundary is expired
  assert.equal(c.count(), 0);
});

test('keeps later entries when earlier ones expire', () => {
  const clk = makeClock();
  const c = new RollingWindowCounter(1000, clk.fn);
  clk.set(0);
  c.record(5);
  clk.advance(500);
  c.record(7);
  clk.advance(500); // 1000 elapsed since first entry, 500 since second
  assert.equal(c.count(), 7);
});

test('record returns post-insert count and evicts first', () => {
  const clk = makeClock();
  const c = new RollingWindowCounter(1000, clk.fn);
  clk.set(0);
  c.record(4);
  clk.advance(1000);
  // record() must evict the stale 4 before reporting, so result reflects
  // only the newly recorded events.
  assert.equal(c.record(3), 3);
});

test('record with count zero does not change the total', () => {
  const clk = makeClock();
  const c = new RollingWindowCounter(1000, clk.fn);
  c.record(5);
  assert.equal(c.record(0), 5);
});

test('default count is one when record called with no args', () => {
  const clk = makeClock();
  const c = new RollingWindowCounter(1000, clk.fn);
  assert.equal(c.record(), 1);
});

test('count on a fresh counter with no records is zero', () => {
  const clk = makeClock();
  const c = new RollingWindowCounter(1000, clk.fn);
  assert.equal(c.count(), 0);
});

test('rejects non-positive window size', () => {
  assert.throws(() => new RollingWindowCounter(0), RangeError);
  assert.throws(() => new RollingWindowCounter(-1), RangeError);
  assert.throws(() => new RollingWindowCounter(NaN), RangeError);
  assert.throws(() => new RollingWindowCounter(Infinity), RangeError);
});

test('rejects negative, fractional, or non-integer count', () => {
  const clk = makeClock();
  const c = new RollingWindowCounter(1000, clk.fn);
  assert.throws(() => c.record(-1), RangeError);
  assert.throws(() => c.record(1.5), RangeError);
  assert.throws(() => c.record('x'), RangeError);
});

test('rejects a non-function clock', () => {
  assert.throws(() => new RollingWindowCounter(1000, 'now'), TypeError);
});

test('count is stable across repeated reads at the same time', () => {
  const clk = makeClock();
  const c = new RollingWindowCounter(1000, clk.fn);
  c.record(3);
  assert.equal(c.count(), 3);
  assert.equal(c.count(), 3);
  assert.equal(c.count(), 3);
});

test('entries recorded out of order by clock are still bounded by window', () => {
  const clk = makeClock();
  const c = new RollingWindowCounter(100, clk.fn);
  clk.set(100);
  c.record(1);
  clk.set(50); // caller rewinds the injected clock
  c.record(2);
  // The 100ms entry is still "future" relative to now=50, so it survives.
  assert.equal(c.count(), 3);
});
