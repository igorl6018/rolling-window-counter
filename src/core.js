/**
 * Maintains a count of events that occurred within a sliding time window of
 * fixed duration. On every record and read we discard entries whose timestamp
 * has fallen out of the window before answering.
 *
 * Why a Map rather than an array: a `Map` preserves insertion order in the
 * spec, and because we only ever `push` via `set`, older entries naturally
 * live at the front of the iteration. That lets eviction drop a contiguous
 * prefix in `O(expired)` rather than scanning every entry on every call.
 */
export class RollingWindowCounter {
  /**
   * @param {number} windowMs - Window length in milliseconds. Must be a
   *   positive, finite number.
   * @param {() => number} [clock] - Milliseconds source. Defaults to
   *   `Date.now`. Injected so tests can drive time deterministically without
   *   `setTimeout` / sleeping — wall-clock assertions are the classic source
   *   of flaky suite failures.
   */
  constructor(windowMs, clock = Date.now) {
    if (
      typeof windowMs !== 'number' ||
      !Number.isFinite(windowMs) ||
      windowMs <= 0
    ) {
      throw new RangeError(
        'windowMs must be a positive, finite number of milliseconds'
      );
    }
    if (typeof clock !== 'function') {
      throw new TypeError('clock must be a function returning milliseconds');
    }
    this._windowMs = windowMs;
    this._clock = clock;
    /** @type {Map<number, number>} timestamp -> count recorded at that tick */
    this._entries = new Map();
  }

  /**
   * Drop every entry whose timestamp is at or before `now - windowMs`.
   *
   * We iterate in insertion order (guaranteed for Map) and `break` on the
   * first in-window entry, which turns the common "a few expired at the
   * front" case into a cheap prefix removal instead of a full scan.
   *
   * @param {number} now - Current time in ms from the injected clock.
 * @returns {void}
   */
  _evictExpired(now) {
    const cutoff = now - this._windowMs;
    for (const [timestamp, count] of this._entries) {
      if (timestamp <= cutoff) {
        this._entries.delete(timestamp);
        // Map iteration stays live after deletes; continue.
      } else {
        break;
      }
    }
  }

  /**
   * Record `count` events at the current clock value and return the in-window
   * total after the insert. Coalescing same-tick entries keeps the map small
   * when callers hammer `record` on a coarse clock.
   *
   * @param {number} [count=1] - How many events to record. Must be a finite
   *   non-negative integer; rejecting here surfaces caller bugs immediately
   *   instead of silently corrupting the running total.
   * @returns {number} In-window event count after recording.
   */
  record(count = 1) {
    if (
      typeof count !== 'number' ||
      !Number.isFinite(count) ||
      count < 0 ||
      !Number.isInteger(count)
    ) {
      throw new RangeError(
        'count must be a finite, non-negative integer'
      );
    }
    const now = this._clock();
    this._evictExpired(now);
    if (count > 0) {
      const existing = this._entries.get(now) ?? 0;
      this._entries.set(now, existing + count);
    }
    return this._total();
  }

  /**
   * Return the current in-window event count without recording anything.
   * @returns {number}
   */
  count() {
    const now = this._clock();
    this._evictExpired(now);
    return this._total();
  }

  /**
   * Sum of counts across remaining entries. Iterates whatever is left after
   * eviction, so it never touches expired data.
   * @returns {number}
   */
  _total() {
    let total = 0;
    for (const c of this._entries.values()) {
      total += c;
    }
    return total;
  }
}
