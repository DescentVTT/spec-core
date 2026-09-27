# spec-core

The shared core of the **spec-\*** tools: how they read paths, patterns and
Markdown the same way, and how their servers speak MCP. Pure TypeScript, no
dependencies, no I/O, copied into each tool byte for byte and verified there
by hash ([ADR-0001](docs/adr/0001-one-core-copied-by-hash.md)).

If you are looking for a tool to run, you want one of the four below. This
repository is where their common ground is written, tested and decided.

## The family

Agents write the code; the tools decide, deterministically, whether it is
right against what the repository's documents say; a person approves the two
things only a person should.

| Tool | The question it answers | Start with |
| --- | --- | --- |
| [spec-brief](https://github.com/DescentVTT/spec-brief) | Is this round's contract complete? Can these rounds run in parallel without writing the same file? Is this one really done? | `lint`, `matrix`, `schedule`, `archive` |
| [spec-graph](https://github.com/DescentVTT/spec-graph) | Do the documents agree with each other - references, lifecycles, open items handed to documents that no longer hold? | `check` |
| [spec-guard](https://github.com/DescentVTT/spec-guard) | Does the code do what the documents assert, and can each assertion actually fail? | `spec-guard`, `query`, `prove` |
| [spec-harness](https://github.com/DescentVTT/spec-harness) | What does an agent need to start this round, may it touch this file, did it stay inside the lines, and who ruled on the exceptions? | `init`, `context`, `guard`, `audit` |

```text
          goal ─▶ agent drafts briefs ─▶ spec-brief lint / schedule ─▶ person approves
                                                                            │
    spec-harness context ◀──────────────────────────────────────────────────┘
          │  (brief + cited ADRs from spec-graph + rules in force from spec-guard)
          ▼
    agent works in a worktree ── spec-harness guard (hooks) ── escalate ─▶ person rules
          │
          ▼
    spec-harness audit ─▶ spec-brief archive --dry-run ─▶ person approves ─▶ archive
          │
          ▼
    CI, every change: spec-guard (code ↔ docs), spec-graph (docs ↔ docs), spec-brief lint
```

**The smallest useful install is one tool.** spec-guard alone keeps code and
ADRs honest. spec-brief alone manages rounds of work and proves parallel waves
cannot collide. `spec-harness init` sets up all four so they agree from the
first day - which directories hold briefs, which statuses retire a document,
which globs mean what.

What the family shares, whatever you install ([ADR-0005](docs/adr/0005-the-family-contract.md)):

- **One package each, zero runtime dependencies**, no account, no API key, no
  IDE. Node 22 or later.
- **Exit codes that mean something:** `0` clean, `1` found something, `2` the
  result cannot be trusted. Nothing measured is never reported as clean.
- **No model inside.** The agent is the model. A tool's answer is the same
  every time you ask.
- **The document is the record.** No manifest, index or state file in your
  tree.
- **False positives cost more than misses**, and every finding says what to do
  next.

Why five tools and not the eleven once planned: [ADR-0006](docs/adr/0006-five-tools-not-eleven.md). How to adopt them, from one tool to the whole loop, and how to configure a repository where agents write most of the code: [docs/adopting.md](docs/adopting.md).

## Modules

| Module | What it gives | Used by |
| --- | --- | --- |
| `path` | Repository paths that refuse to leave the repository; POSIX arithmetic independent of the host; link destinations. | all |
| `text` | Line tables for `\n`, `\r\n` and `\r`; offset-preserving masks. | all |
| `pattern` | Globs in three named dialects - `path`, `ripgrep`, `gitignore` - on one non-backtracking automaton, a malformed one refused with a reason (for `docs/**.md`, the two patterns it may have meant: `docs/**/*.md` and `docs/*.md`); a shortest **witness** path two scopes share, less what either protects, or a proof there is none; scope inclusion; the regex matcher behind spec-graph's `~=`. | all |
| `markdown` | One pass that is exact about code and comments per CommonMark: headings, list items with their extent and checkboxes, links in six forms (a link inside a link is the link, and a definition never interrupts a paragraph, as CommonMark reads them), tables, front matter and word of any that never closes, code and raw-text HTML blocks, each HTML block with its tag, and three masks for three questions. | all |
| `jsonrpc` | MCP over JSON-RPC 2.0 without an SDK: both protocol eras (the `initialize` handshake through 2025-11-25, and 2026-07-28), tools, resources, prompts, line framing with cancellation. | spec-guard, spec-harness |

```ts
import { compileGlob, globWitness } from './vendor/spec-core/pattern/index.js';

const mine = compileGlob('src/**', { dialect: 'path', caseSensitive: true });
const theirs = compileGlob('**/*.ts', { dialect: 'path', caseSensitive: true });
const schema = compileGlob('src/db/schema.ts', { dialect: 'path', caseSensitive: true, literal: 'file' });

globWitness([mine, theirs]);           // { kind: 'found', path: 'src/.ts' }
globWitness([mine, theirs], [schema]); // still found: only the schema is protected
```

## Using a module in a tool

```bash
# in spec-core
node scripts/vendor.mjs --into ../spec-brief --modules pattern,markdown
node scripts/vendor.mjs --check ../spec-brief
```

The first copies the modules (and the modules they import) into
`src/vendor/spec-core/` and writes `VENDOR.json` with the commit and a SHA-256
per file. The tool keeps a test that recomputes those hashes, excludes
`src/vendor/**` from its own mutation sweep and coverage, and commits the copy
as an ordinary diff.

## Decisions

| ADR | Decision |
| --- | --- |
| [0001](docs/adr/0001-one-core-copied-by-hash.md) | One core, copied into each tool and verified by hash |
| [0002](docs/adr/0002-pure-and-total.md) | Pure and total |
| [0003](docs/adr/0003-glob-dialects.md) | Three named glob dialects on one automaton |
| [0004](docs/adr/0004-markdown-structure.md) | Markdown structure is exact about code and comments, and simple about the rest |
| [0005](docs/adr/0005-the-family-contract.md) | The family contract |
| [0006](docs/adr/0006-five-tools-not-eleven.md) | Five tools, not eleven |
| [0007](docs/adr/0007-verification.md) | Verification is against something outside the code |
| [0008](docs/adr/0008-toolchain.md) | The toolchain, and latest is not newest |

## License

MIT
