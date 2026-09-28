/**
 * Timing for the tests that hold the scanner and the matchers to time linear
 * in what they read.
 *
 * Under coverage or mutation testing every statement is instrumented and
 * costs several times more, so an absolute bound is a claim about the code
 * as shipped and is only checked there. A ratio between two sizes survives
 * instrumentation, which slows both alike, and a slow or busy machine, which
 * an absolute bound does not.
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
  return fastestInTurn(runs, run)[0] as number;
}

/**
 * The fastest of a few runs of each piece of work, the pieces taken in turn,
 * so that a stretch when the machine is busy slows every one of them and not
 * only whichever was running.
 */
export function fastestInTurn(runs: number, ...work: (() => unknown)[]): number[] {
  const best = work.map(() => Number.POSITIVE_INFINITY);
  for (let i = 0; i < (instrumented() ? 1 : runs); i += 1) {
    work.forEach((run, k) => {
      const started = performance.now();
      run();
      best[k] = Math.min(best[k] as number, performance.now() - started);
    });
  }
  return best;
}

/**
 * For work too quick to time once: the time one run takes, in milliseconds,
 * over as many runs as fill `span` milliseconds, the fastest of a few such
 * stretches of each piece of work, taken in turn. A stretch holds at least
 * one run, so work grown to take seconds is timed once and not thousands of
 * times over.
 */
export function perRunInTurn(stretches: number, span: number, ...work: (() => unknown)[]): number[] {
  const best = work.map(() => Number.POSITIVE_INFINITY);
  for (let i = 0; i < stretches; i += 1) {
    work.forEach((run, k) => {
      let runs = 0;
      let elapsed = 0;
      const started = performance.now();
      do {
        run();
        runs += 1;
        elapsed = performance.now() - started;
      } while (elapsed < span && runs < 100_000);
      best[k] = Math.min(best[k] as number, elapsed / runs);
    });
  }
  return best;
}
