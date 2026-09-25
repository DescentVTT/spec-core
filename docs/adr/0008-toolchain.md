---
status: accepted
date: 2026-09-26
---

# ADR-0008: The toolchain, and latest is not newest

## Context

The family's rule for choosing a version is the organisation's: the current
recommended production choice, which for a major released a few weeks ago is
deliberately not the highest number on the registry. A library whose files are
compiled by four other projects must also compile under all four of their
configurations.

## Decision

The same toolchain as the sibling tools, read from the npm registry on
2026-09-26:

| Component | Chosen | Newest | Why |
| --- | --- | --- | --- |
| Node | `>=22` | 26 | 22 is in maintenance until April 2027, 24 is the active LTS; CI runs 22, 24 and 26. |
| `@types/node` | `^22` | 26.6 | Types for the lowest runtime supported. The modules use no Node API at all; only tests and scripts do. |
| TypeScript | `^7.0.2` | 7.0.2 (7.1 in `next`) | The native compiler every sibling uses. Its missing programmatic API matters to no tool here. |
| Vitest | `^4.1.11` | 5.0.2 | 5.0 is a few weeks old; 4.1 is the maintained line every sibling runs. |
| Stryker | `^10.0.0` | 10.0.0 | As the siblings; its TypeScript checker needs the API TypeScript 7 lacks, so it is not used. |
| MCP revisions served | 2024-10-07 to 2025-11-25, and 2026-07-28 | 2026-07-28 | The newest revision is served, and so are the ones most clients still speak (ADR-0012 in spec-guard). |

The compiler options are the strictest union of the tools' own: `strict`,
`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`,
`noImplicitReturns`, `noFallthroughCasesInSwitch`, `noUnusedLocals`,
`noUnusedParameters`, `verbatimModuleSyntax`, `isolatedModules`, NodeNext.
A file that compiles here compiles in every tool.

GitHub Actions are pinned to commits, with the tag beside each, as the
siblings pin them.

## Consequences

Re-read this table when it is a quarter old, when Vitest 5 has had a release
line's worth of patches, or when TypeScript ships its programmatic API.
