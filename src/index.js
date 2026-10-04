/**
 * Public entry point for the rolling-window-counter library.
 *
 * Re-exports {@link RollingWindowCounter} so callers can do a single named
 * import. Keeping the public surface in one file means future internal
 * refactors never break `from 'rolling-window-counter'` paths.
 */
export { RollingWindowCounter } from './core.js';
