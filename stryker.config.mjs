// @ts-check
/**
 * Mutation testing configuration.
 *
 * Every module here is pure and every test is a unit test, so there is one
 * sweep, not two. A defect here is a defect in every tool that vendors the
 * module, which is why the gate sits higher than any single tool's
 * (docs/adr/0007-verification.md).
 *
 * @type {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
export default {
  packageManager: 'npm',
  testRunner: 'vitest',
  vitest: { configFile: 'vitest.config.ts', related: false },
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
  // than the mutants that timed out in one sweep and survived the other. The
  // break sits under the last measurement by more than that swing, and moves
  // up with the measurement, never down (docs/adr/0007-verification.md).
  thresholds: { high: 97, low: 93, break: 94 },
};
