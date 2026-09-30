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
- *Amended 2026-09-30*: **a GitLab Code Quality issue stays the same issue
  while its finding does.** Its `fingerprint` is the SHA-256 of the finding's
  identity - the rule, the file (or the document's id, which outlives a
  rename), and the subject the finding is about: a brief id, a symbol, a pair
  of briefs, a target - with the occurrence index added for the second and
  later findings that share one identity. Never the message, the hint or the
  line: GitLab tells a new issue from one it has seen by the fingerprint, and
  a reworded message or a moved line would show as one problem fixed and
  another found. `severity` is `major` for an error, `minor` for a warning and
  `info` for a note; `critical` and `blocker` are for the cases a tool's README
  names - in spec-guard a failing assertion, a rule that survived `prove`, a
  ghost citation and a stale one under `--strict`; in spec-graph an error that
  is one without `--strict`. The `description` holds the hint, the next
  action, after the message. Where a tool does not yet - spec-brief's
  fingerprint holds the message; spec-guard's `description` has no hint, and
  its fingerprint of a directive it cannot read holds the message - that is a
  defect to fix, not a dialect.
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
- *Amended 2026-09-30*: **where a status is read.** Front matter first -
  `status`, and the other keys a tool's README lists - then, where the front
  matter names none, the other places each README lists: a `## Status`
  section, a `Status:` label, the directory a document is in. spec-graph and
  spec-guard read one more place, **a table of exactly two columns before the
  document's first `##` heading**: a row whose left cell, the header row
  included, is exactly a status key once emphasis is stripped - `Status`,
  `State`, `狀態` or `状态`, in any case - gives its right cell as the status.
  It ranks where each tool ranks a `## Status` section, and front matter still
  wins. A table with more columns, or one after the first `##`, is never read
  for a status: a legend of status words or a register of documents is not
  the document's own status. Each of the two names, in its CHANGELOG, the
  release that first reads it. *Amended again 2026-09-30*: the keys are
  `Status` and `State` only; `狀態` and `状态` are withdrawn with the Chinese
  status words, below the lifecycle table.
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

  *Withdrawn 2026-09-30 by the amendment after this one, and kept as the
  record of what the tools read until then:*

  *Amended 2026-09-30*: **a status written in Chinese is read as the English
  word it translates**, and each tool then does with it what it does with that
  English word, so the family stays consistent without a rule of its own for
  Chinese: `延後` is `deferred`, retired in spec-graph and in force in
  spec-guard, as `deferred` is today. Traditional and Simplified are both
  read. By the English word each maps to:

  | English | Traditional | Simplified |
  | --- | --- | --- |
  | superseded | 已被取代, 被取代, 已取代 (see below), and `被` ... `取代`/`替代`/`取而代之` within 30 characters (`被 ADR-0003 取代`) | 已被取代, 被取代, 已取代, and the same `被` ... `取代` form |
  | deprecated | 已棄用, 棄用, 已廢棄, 廢棄, 已停用, 已過時 | 已弃用, 弃用, 已废弃, 废弃, 已停用, 已过时 |
  | rejected | 已否決, 否決, 已拒絕, 不採納 | 已否决, 否决, 已拒绝, 不采纳 |
  | withdrawn | 已撤回, 撤回, 已作廢, 作廢 | 已撤回, 撤回, 已作废, 作废 |
  | deferred | 延後, 暫緩, 擱置 | 延后, 暂缓, 搁置 |
  | archived | 封存, 已封存, 歸檔, 已歸檔 | 封存, 已封存, 归档, 已归档 |
  | final | 已定案, 定案, 已凍結 | 已定案, 定案, 已冻结 |
  | provisionally accepted | 暫定 (so `暫定接受` is not accepted) | 暂定 |
  | accepted | 已接受, 接受, 已採納, 採納, 已核准, 核准, 已批准, 批准, 已生效, 生效 | 已接受, 接受, 已采纳, 采纳, 已核准, 核准, 已批准, 批准, 已生效, 生效 |
  | implemented | 已實施, 已完成 | 已实施, 已完成 |
  | draft | 草稿, 草案 | 草稿, 草案 |
  | proposed | 提議, 提案, 審查中, 審核中, 討論中, 待審, 待審核 | 提议, 提案, 审查中, 审核中, 讨论中, 待审, 待审核 |

  - `已取代` alone, with emphasis, a date or punctuation around it, is
    `superseded`. `已取代` followed directly by a document reference - after
    optional spaces or a colon, a letter or digit, as in `已取代 ADR-0002` -
    usually means this document supersedes that one, and is not read as a
    status word at all.
  - A Han word directly after a negation (`不 未 非 沒 没 無 无 勿`, and
    `尚未`, `不再`) is not read: `未接受`, `尚未核准`, `不再生效`. An entry
    that itself starts with one, such as `不採納`, is matched as itself.
  - `取代` without `被`, as in `已接受（取代 ADR-0002）`, is not retirement.
  - The status key is read in Chinese too, `狀態` and `状态`, wherever a tool
    reads `status` today. A heading or a label takes an ASCII colon or a
    full-width `：`. Front matter is YAML, where only the ASCII colon
    separates a key from its value: `狀態: 已接受` is read, and `狀態：已接受`
    is a line that is not a key, reported as unreadable front matter (spec-core
    ADR-0004), never guessed at.

  Each tool names, in its CHANGELOG, the release that first reads them.

  *Amended again 2026-09-30*: **status words are English in every tool.** The
  amendment above is withdrawn, its table and every rule under it: no tool
  reads a Chinese status word, the `被` ... `取代` form, `狀態` or `状态` as a
  status key, or a full-width colon after a status label. A document may be
  written in any language and writes its status in English -
  `status: superseded` in front matter, or `Superseded by ADR-0007` under a
  `## Status` heading - which every tool reads. The maintainer chose one
  language: a small team keeps one vocabulary up to date, and a heuristic in
  a second language is where false positives come from. The two-column
  table before the first `##` stays, with the keys `Status` and `State`. A
  status in another language is then a word no tool knows, and each treats
  it as it treats any such word: spec-guard keeps the document in force, so
  no document goes dark by accident. Each tool names, in its CHANGELOG, the
  release that stops reading Chinese.

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
  not the ones the change itself carries. *Amended 2026-09-30*: CODEOWNERS is
  one forge's way, and GitLab Free has no Code Owners approval and no required
  approval rules. The requirement, on any forge: nothing reaches the base
  branch without a person merging or approving it, and a person reads every
  change to a rule file before it does - the CI configuration that runs the
  checks included, since a change can remove the job that would fail it.
  GitHub meets it with `CODEOWNERS` and required review from code owners on a
  protected branch; GitLab Premium with Code Owners and *Require approval from
  code owners*; GitLab Free with a protected branch that no one may push to
  and only Maintainers may merge, agents at the Developer role, and
  *Pipelines must succeed*, so that a person merges every change.
  [Adopting](../adopting.md) has the settings for both.

## Consequences

Each tool's CLAUDE.md links here instead of restating the list, and a tool
that breaks a clause needs an ADR of its own saying why.
