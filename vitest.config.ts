import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    testTimeout: 60_000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/index.ts'],
      reporter: ['text', 'lcov'],
      // Floors sit just below the measurement and move up with it, never down
      // to make a change pass. Set once the first modules are measured.
      thresholds: {
        lines: 99,
        statements: 99,
        functions: 99,
        branches: 97,
      },
    },
  },
});
