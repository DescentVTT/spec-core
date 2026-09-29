# Contributing

```bash
npm install
npm run lint            # tsc --noEmit
npm test                # vitest
npm run build
npm run test:mutation   # stryker
```

Node 22 or later. Vitest reads `src/` directly; there is no build step for the
tests.

## Layout

| Path | What |
| --- | --- |
| `src/<module>/` | One module per directory; `index.ts` only re-exports. |
| `modules.json` | Which modules each module may import. |
| `tests/` | Unit, oracle, enumeration and differential tests; `boundaries.test.ts` holds the rules above. |
| `scripts/vendor.mjs` | Copies modules into a tool and checks a tool's copy. |
| `docs/adr/` | The decisions, including the family's contract. |
| `docs/` | The family's shared documentation: adopting the tools, their concepts, a tutorial. |

## Adding a module

Add the directory, its entry in `modules.json` and in `package.json`'s
`exports`, and a row in the README. The boundaries test fails until all four
agree.

## Updating a tool's copy

After a change here merges, in this repository:

```bash
node scripts/vendor.mjs --into ../<tool> --modules <modules>
```

Then, in the tool, run its full verification and open a PR whose changelog
entry names this repository's commit and any behaviour change the ADRs here
record.
