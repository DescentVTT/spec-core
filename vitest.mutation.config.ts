import { defineConfig } from 'vitest/config';

/**
 * The suite as Stryker runs it: the one vitest.config.ts runs, less one file,
 * and without v8 coverage, which Stryker replaces with its own per test.
 *
 * mutation-shards.test.ts tests the CI script that splits the sweep and
 * merges it back. It reaches nothing under src/, so it cannot kill a mutant,
 * and every static mutant runs the whole suite. A test holds the rest of this
 * file to vitest.config.ts.
 */
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/mutation-shards.test.ts', '**/node_modules/**'],
    environment: 'node',
    testTimeout: 60_000,
  },
});
