---
status: accepted
date: 2026-09-26
---

# ADR-0005: The family contract

## Context

Five tools (ADR-0006) are used together by people and by agents, and read
each other's output. What they share was, until now, a set of values each
repository wrote down for itself: no runtime dependencies, exit codes that
separate "found something" from "cannot tell", false positives costing more
than misses. Where the values were written slightly differently, the tools
drifted - a status word one tool suspended and another enforced, a glob one
tool matched and another did not. This records the contract once, where every
tool's CLAUDE.md can point.

## Decision

### Runs

- **Exit codes.** `0` the run was clean. `1` it found something, or refused
  an action. `2` its result cannot be trusted: a configuration that did not
  load, an unknown key, a directory that does not exist, a question it could
  not decide. A tool never falls back to defaults and reports clean.
- **Nothing measured is not clean.** A check that inspected nothing - an empty
  scope, a diff that was never read, a base equal to the head - says so, and
  under `--strict` refuses.
- **No prompts, no network, no model.** A tool runs unattended in CI and under
  an agent. None calls an LLM: the agent is the LLM, and a tool's answers must
  be the same every time.

### Findings and output

- A finding has a rule id, a severity, a place (file, line, column where there
  is one), a message, and a **hint that names the next action**. One defect is
  one finding.
- Every machine-readable output carries a format version, and a change that
  removes or renames a field bumps it. Where findings have places, SARIF 2.1.0
  and GitHub annotations are offered; GitLab Code Quality is added as each
  tool next touches its reporter, so the family is not GitHub-only.
- **Tools talk through their CLIs.** One tool reads another's versioned JSON;
  none imports another's package. Shared code arrives only through spec-core
  copies (ADR-0001). Each tool can be released, pinned and dropped on its own.

### Paths and patterns

- Paths are repository-relative POSIX, compared **case-sensitively on every
  host**. Globs are one of three named dialects (ADR-0003).

### Documents and state

- **The document is the record.** No tool keeps a manifest, an index or a
  state file in the working tree. A brief's lifecycle is its directory and its
  `status`; a wave is computed from `dependsOn` and `wave`.
- State that exists only while work is in flight - an escalation waiting for a
  person, a sandbox in use - lives **outside the working tree**, under the git
  common directory (`.git/spec-harness/`), and only its outcome is written back
  into a document.
- **Lifecycle words mean the same everywhere:**

  | status | spec-brief | spec-guard executes assertions | spec-graph |
  | --- | --- | --- | --- |
  | `draft`, `proposed` | a brief not yet active | no | not yet in force |
  | `accepted`, `active` | the round in progress | yes | in force |
  | `rejected`, `deprecated`, `superseded` | - | no | retired |
  | `archived` | a closed round, frozen | no | **a record, not retired**: depending on it is normal |

  A premise a brief asserts (the defect still exists) and a goal it asserts
  (the fix is in) are different: premises run on every build with
  `--ignore-status` so that a stale brief fails CI; goals run when the round
  closes. A brief says which is which (spec-harness ADRs).

### Git and the working tree

- spec-brief, spec-graph and spec-guard **read git and never write it**.
- spec-harness may create **temporary worktrees** to run an agent or a probe in
  isolation. It always removes them, including on interruption, and it
  **never touches the user's own working tree**: a failed round is discarded
  by discarding its worktree.

### People

- **Two human gates**: approving a brief before work starts (its scope and what
  it protects), and approving the archive when it ends. Everything between is
  the agent's.
- A ruling that lifts a protection must arrive through a channel an agent
  cannot impersonate - a signature by a key the agent cannot use, or a review
  on the forge by a different identity. A hash an agent can compute is not a
  signature.
- In a repository where agents write the code, the rule files (ADRs, tool
  configuration, brief protections) are protected by the forge (CODEOWNERS,
  branch rules), and CI checks a change against the **base branch's** rules,
  not the ones the change itself carries.

## Consequences

Each tool's CLAUDE.md links here instead of restating the list, and a tool
that breaks a clause needs an ADR of its own saying why.
