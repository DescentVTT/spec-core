// @ts-check
/**
 * Mutation testing configuration.
 *
 * Every module here is pure and every test is a unit test, so there is one
 * sweep, not two. A defect here is a defect in every tool that vendors the
 * module, which is why the gate sits higher than any single tool's
 * (docs/adr/0007-verification.md).
 *
 * `npm run test:mutation` runs the sweep in one process with this file. CI
 * runs the same sweep in shards, each with stryker.shard.config.mjs, and
 * applies these thresholds to the merged report.
 *
 * @type {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
export default {
  packageManager: 'npm',
  testRunner: 'vitest',

  // CI runs the sweep in shards (scripts/mutation-shards.mjs), and the merge
  // takes them as one sweep only if each ran every test: with `related` on,
  // which tests run would depend on the files a shard holds.
  vitest: { configFile: 'vitest.mutation.config.ts', related: false },
  coverageAnalysis: 'perTest',
  mutate: ['src/**/*.ts', '!src/**/index.ts'],

  // Stryker's sandbox rewrites a tsconfig that reaches outside the project,
  // and the rewriter calls a TypeScript API the native TypeScript 7 compiler
  // does not expose. A file that does not exist makes the step a no-op, as in
  // the sibling tools.
  tsconfigFile: 'tsconfig.stryker-noop.json',
  disableTypeChecks: 'src/**/*.ts',

  reporters: ['html', 'json', 'clear-text', 'progress'],
  htmlReporter: { fileName: 'reports/mutation/index.html' },
  jsonReporter: { fileName: 'reports/mutation/mutation.json' },
  clearTextReporter: { allowColor: false, maxTestsToLog: 0, reportScoreTable: true },

  // Pure unit tests finish in milliseconds; a mutant still running after a few
  // seconds is a loop bound that no longer ends.
  timeoutMS: 5000,

  // Measured 95.37% at cbe2223 and 94.89% at 8840d36, apart by little more
  // than the mutants that timed out in one sweep and survived the other; then
  // 95.42% at c78de30, 95.56% at 119345e and 95.54% at d5fab98. 65ef842 read
  // 95.48% on one runner and 94.21% on a faster one, where mutants that had
  // only ever timed out finished and survived; tests now hold what they
  // change. The break sits under the measurements, and moves up with the
  // measurement, never down (docs/adr/0007-verification.md).
  thresholds: { high: 97, low: 93, break: 94.5 },
};
