// @ts-check
/**
 * One shard of the sweep CI runs: the base configuration with three
 * differences. See scripts/mutation-shards.mjs and ADR-0007.
 *
 *   MUTATION_SHARD=2 npx stryker run stryker.shard.config.mjs
 *
 * @type {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
import base from './stryker.config.mjs';
import { mutateFor } from './scripts/mutation-shards.mjs';

const shard = process.env.MUTATION_SHARD;

export default {
  ...base,

  // The files this shard holds. An unset or unknown shard is an error here,
  // never a run over everything.
  mutate: mutateFor(base.mutate, shard),

  // A shard is not a score. The ones holding automaton.ts and regex.ts read
  // 90.7% and 91.5% while the sweep read 96.4%, so the gate is applied once,
  // by the merge.
  thresholds: { ...base.thresholds, break: null },

  // The merge reads the JSON and writes the page for the whole sweep. The
  // progress reporter stays: its timestamped counts are the only record of
  // where a sweep's minutes went (scripts/mutation-timeline.mjs).
  reporters: ['json', 'clear-text', 'progress'],
  jsonReporter: { fileName: `reports/mutation/shard-${shard}.json` },
};
