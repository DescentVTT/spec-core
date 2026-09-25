# CLAUDE.md

Working agreements for this repository. The ADRs in `docs/adr/` carry the
reasoning; ADR-0005 is the contract every spec-* tool keeps.

## Invariants

Breaking one is a decision that needs an ADR.

- **Pure.** No module imports anything outside `src/`, `node:` included, and
  none reads the disk, the clock, the environment or the platform
  ([ADR-0002](docs/adr/0002-pure-and-total.md)).
- **Modules cross only where `modules.json` says.** `pattern` may use `path`,
  `markdown` may use `text`. `tests/boundaries.test.ts` holds this, and
  `scripts/vendor.mjs` copies a module with exactly its declared dependencies
  ([ADR-0001](docs/adr/0001-one-core-copied-by-hash.md)).
- **Nothing takes longer than its input.** No `RegExp` is built at run time;
  patterns run on automata; a search without a natural bound has a budget and
  answers `undecided` at it.
- **Refuse rather than guess.** Malformed input is an error with a reason.
- **Zero runtime dependencies**, `private: true`, native ESM, TypeScript 7,
  Node >= 22, the strictest compiler options any tool uses
  ([ADR-0008](docs/adr/0008-toolchain.md)).
- **LF, no control characters**, in every file (held by a test). Write escapes
  for anything invisible. Files are copied into other repositories and
  compared by hash.

## Verification

All of these pass before anything is called done.

```bash
npm run lint            # tsc --noEmit
npm test                # vitest: unit, oracle, enumeration, differential
npm run build
npm run test:mutation   # stryker over all of src/
```

The mutation `break` and the coverage floors sit below the last measurement
and move up with it, never down to let a change pass
([ADR-0007](docs/adr/0007-verification.md)).

## Changing a module

A change here reaches every tool that copies the module. So:

- Check behaviour against something outside the code: the oracle, brute
  force, the scanner it replaced. A new heuristic has a test for the input it
  must not match.
- A behaviour change a tool's user can see is written in `CHANGELOG.md` and
  named in the ADR that covers it, so each tool's release can say it.
- After merging, run `node scripts/vendor.mjs --into <tool> --modules …` for
  each tool that copies the module, and open that tool's PR.

## Design rules

- False positives cost more than misses; `undecided` is reported, never
  resolved by a guess.
- Comments explain why, never what. No exclamation marks, no hedging.
