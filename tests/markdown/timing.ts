/**
 * Timing for the tests that hold the scanner to linear time.
 *
 * Under coverage or mutation testing every statement is instrumented and
 * costs several times more, so an absolute bound is a claim about the code
 * as shipped and is only checked there. A ratio between two sizes survives
 * instrumentation, which slows both alike.
 */

/** Whether the code under test is instrumented, by coverage or by Stryker. */
export function instrumented(): boolean {
  const worker = (globalThis as Record<string, unknown>)['__vitest_worker__'] as { config?: { coverage?: { enabled?: boolean } } } | undefined;
  return '__stryker__' in globalThis || worker?.config?.coverage?.enabled === true;
}

/**
 * The fastest of a few runs, in milliseconds. The first run of anything pays
 * for compiling it, and a machine busy with other work can slow any one run;
 * instrumented, one run is all the time there is.
 */
export function fastest(runs: number, run: () => unknown): number {
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i < (instrumented() ? 1 : runs); i += 1) {
    const started = performance.now();
    run();
    best = Math.min(best, performance.now() - started);
  }
  return best;
}
