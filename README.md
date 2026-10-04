# rolling-window-counter

Maintains a count of events recorded within a fixed sliding time window. On every `record` and every `count`, entries older than the window are evicted before answering, so the returned number is always the count of events still inside the window.

## Usage

```js
import { RollingWindowCounter } from 'rolling-window-counter';

// 1-second window using the real clock.
const counter = new RollingWindowCounter(1000);

counter.record(1);   // -> 1
counter.record(4);   // -> 5
counter.count();     // -> 5  (no time has passed here)

// For deterministic tests, inject a clock function:
let t = 0;
const testCounter = new RollingWindowCounter(1000, () => t);
testCounter.record(5); // -> 5
t += 1000;
testCounter.count();   // -> 0
```

Exported names: `RollingWindowCounter`.

## Why

Counting events in a trailing window is a recurring need — rate limiting, request throttling, "events per minute" dashboards. Doing it naively with a growing array and a `filter` on every read burns memory and CPU proportional to lifetime traffic. This library coalesces events recorded at the same timestamp and evicts only the expired prefix on each call, so steady-state cost is proportional to the number of distinct active timestamps rather than the raw event volume.

The trade-off: the counter only knows what you tell it. There is no background timer sweeping entries out; eviction happens lazily inside `record` and `count`. If neither is called, stale entries sit in memory until the next call. That is fine for the intended use (someone always reads the count to make a decision) and keeps the class free of timers, which would make deterministic testing painful.

## Edge cases worth knowing

- **Window boundary is exclusive on the old side.** An event recorded at time `T` is considered expired at time `T + windowMs`, not `T + windowMs + 1`. At exactly `T + windowMs`, `count()` returns 0 for that event. This is the only interpretation that makes the window length mean exactly `windowMs`.
- **`count` must be a non-negative integer.** Fractional or negative values throw `RangeError` rather than silently corrupting the total. `record(0)` is allowed and is a no-op that still returns the current total.
- **Same-timestamp records are summed.** Two `record(3)` calls at the same clock value produce one entry of `6`, not two entries of `3`. The returned count is identical either way.
- **The injected clock can be rewound.** If you pass a clock that goes backward, entries whose timestamps are still `> now - window` survive. The library does not assume monotonic time; it only compares against whatever the clock returns. In production use `Date.now`, which is monotonic enough for this purpose.
