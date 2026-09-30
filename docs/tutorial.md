# Tutorial: one round, start to finish

Ten steps through the whole loop on a made-up repository: two ADRs, a small
C# tree, one defect, and one round of agent work to fix it, from the brief to
the archive. Nothing needs to build; the tools read the text.

Every output below comes from running these steps against the published
packages, spec-brief 0.3.0, spec-graph 0.10.0, spec-guard 0.17.0 and
spec-harness 0.7.0, trimmed where a line says `…`. The words in italics are
defined in [concepts](concepts.md).

## 1. The repository

```text
ledger/
  docs/adr/0001-dependencies-point-inward.md
  docs/adr/0002-money-is-decimal.md
  src/Ledger.Domain/Account.cs
  src/Ledger.Application/Interest.cs
  src/Ledger.Application/Transfers.cs
  src/Ledger.Infrastructure/AccountStore.cs
  .gitignore            node_modules/, bin/, obj/
  package.json          { "name": "ledger", "private": true }
```

It is a git repository with one commit, on `main`.

The ADRs state their rules as spec-guard *assertions*, HTML comments under
the sentence each one makes executable:

```markdown
---
status: accepted
---

# ADR-0001: Dependencies point inward

## Decision

The domain depends on nothing, the application on the domain, and the
infrastructure on both.

<!-- @assert-layers target="src" order="Ledger.Domain, Ledger.Application, Ledger.Infrastructure" reason="dependencies point inward" -->
```

```markdown
---
status: accepted
---

# ADR-0002: Money is a decimal

## Decision

Amounts of money are `decimal`, never `double` or `float`, so a cent is never
lost to binary rounding. Where they live is constrained by
[ADR-0001](0001-dependencies-point-inward.md): every amount is the domain's.

<!-- @assert-absence target="src/Ledger.Domain" glob="*.cs" symbol="double" word="true" reason="money is decimal" -->
```

And the defect, in the application layer, which ADR-0002's assertion does
not reach:

```csharp
public static decimal For(Account account, decimal rate) =>
    (decimal)((double)account.Balance * (double)rate);
```

## 2. Install and configure

The repository has no JavaScript of its own, so `package.json` holds nothing
but the tools:

```console
$ npm install --save-dev @descent-vtt/spec-brief @descent-vtt/spec-graph @descent-vtt/spec-guard @descent-vtt/spec-harness
$ npx spec-harness init
run     .spec-brief.json
        spec-brief init: the brief and archive directories, every default spelled out
update  .spec-brief.json
        load spec-harness's plugin, "@descent-vtt/spec-harness/spec-brief-plugin": spec-brief's archive asks it whether a signed ruling allows a protected file, …
create  .spec-graph.json
        read briefs/archive/** as history, for when spec-graph reads the briefs; …
create  .spec-harness.json
        rounds are measured from main, the branch init runs on: no remote records a default branch (refs/remotes/origin/HEAD); …
create  .claude/settings.json
        the guard hooks, run with node from the project's install: …
create  .mcp.json
        the spec-harness MCP server, run with node from the project's install: …
advise  .git/hooks/pre-commit
        no pre-commit hook runs spec-harness: one refuses a commit that changes what the active brief protects, for any agent or none, a shell's writes included; run spec-harness init --git-hook --write to add it
advise  .github/allowed_signers
        rulings count only when signed by a key listed here on the base branch: one line per person, <email> namespaces="git" <public key>. …

Nothing was changed. Run again with --write to apply the plan.
$ npx spec-harness init --write
```

The last two lines are advice. The git hook is written only with
`--git-hook`, and this tutorial goes without it. Nor does `init` choose who
may sign *rulings*: Pat, the person who approves the work, gets a signing key
and a line in the allowed signers file. This key is a throwaway for the
tutorial, kept outside the repository; for real rulings use a FIDO2 key
(`-t ed25519-sk`), whose signature needs a touch no agent can supply.

```console
$ ssh-keygen -t ed25519 -N "" -C person@example.test -f ~/.ssh/ledger-person
$ git config gpg.format ssh
$ git config user.signingkey ~/.ssh/ledger-person
$ mkdir -p .github
$ echo "person@example.test namespaces=\"git\" $(cut -d' ' -f1,2 ~/.ssh/ledger-person.pub)" > .github/allowed_signers
$ git add -A && git commit -m "Configure the spec tools; Pat signs rulings"
$ npx spec-harness doctor
root    …/ledger
branch  main
brief   (none named)
base    main (.spec-harness.json), merge base 13a2b7b59d70
signers .github/allowed_signers is on main
        note: signers whose key is not a FIDO2 key: person@example.test (ssh-ed25519, line 1). …
plugin  spec-brief loads spec-harness's plugin (.spec-brief.json): its archive accepts a protected file a signed ruling allows
claude  init's entries: the guard hooks in .claude/settings.json, the server in .mcp.json
        Claude Code 2.1.235 runs the hooks, which need 2.1.139 or later
git     no pre-commit hook runs spec-harness (.git/hooks/pre-commit): …

found     spec-brief  … (0.3.0)
found     spec-graph  … (0.10.0)
found     spec-guard  … (0.17.0)
```

The note is about the throwaway key, and the `git` line about the hook this
tutorial goes without; neither fails `doctor`. A Claude Code older than
2.1.139 does, since it runs every write unguarded.

## 3. Hold the code to its ADRs

spec-guard reads `docs/**/*.md` by default and runs every assertion in a
document in force:

```console
$ npx spec-guard --verbose
spec-guard 2 specs · 2 assertions · javascript

✔ docs/adr/0001-dependencies-point-inward.md:12  @assert-layers src must keep its layers in order, Ledger.Domain < Ledger.Application < Ledger.Infrastructure (0 violating files)
✔ docs/adr/0002-money-is-decimal.md:13  @assert-absence "double" (0 matches) in src/Ledger.Domain

2 passed · 17ms
✔ every spec assertion holds
```

Add `using Ledger.Infrastructure;` to `Account.cs` and the ADR fails, on the
line that broke it:

```console
$ npx spec-guard
spec-guard 2 specs · 2 assertions · javascript

✖ docs/adr/0001-dependencies-point-inward.md:12  @assert-layers
    src must keep its layers in order, Ledger.Domain < Ledger.Application < Ledger.Infrastructure
    expected no violating files, found 1
    reason: dependencies point inward
      src/Ledger.Domain/Account.cs:1:1  Ledger.Domain -> Ledger.Infrastructure: using Ledger.Infrastructure

1 passed · 1 failed · 17ms
```

Exit 1. Take the line out again. `prove` shows each rule a violation of
itself, in memory, so a rule that cannot fail is found before it is trusted:

```console
$ npx spec-guard prove
spec-guard prove 2 specs · 2 rules

2 seen to fail · 20ms
✔ every rule in force was seen to fail
```

## 4. Keep the documents consistent

spec-graph checks what the documents say about each other. ADR-0002 says it
is constrained by ADR-0001, which spec-graph reads as `assumes`:

```console
$ npx spec-graph check
spec-graph 2 documents - 0 items - 1 relation - 0 open

18.85ms
ok the specification graph is consistent
```

Mark ADR-0001 `superseded` and the ADR resting on it is reported:

```console
$ npx spec-graph check
spec-graph 2 documents - 0 items - 1 relation - 0 open

x docs/adr/0002-money-is-decimal.md:11:12  stale-premise
    ADR-0002 assumes ADR-0001, which no longer holds
    | docs/adr/0001-dependencies-point-inward.md:2:9  ADR-0001 is retired ("superseded")
    > re-check this dependency: the constraint it assumes may have been lifted when ADR-0001 was retired

1 error - 19.29ms
x the specification graph is inconsistent
```

Put the status back.

## 5. Write a brief

A *brief* is the contract for one *round*. The agent drafts it; `new` gives it
the next free id and every section the configuration requires, each with a
comment saying what it must answer:

```console
$ npx spec-brief new "Compute interest in decimal" --type defect --wave 1
wrote briefs/001_compute-interest-in-decimal.md
$ npx spec-brief lint
briefs/001_compute-interest-in-decimal.md
  12  warning  the "Intent" section is empty  empty-section
               The state of the tree when this round is done, and why it matters. One paragraph.
  16  warning  the "Negative Scope" section is empty  empty-section
               What this round must not do, even where it would look helpful.
  …
0 errors, 5 warnings, 0 notes in 1 brief(s)
```

A draft's gaps are warnings; the same gaps in an active brief are errors.
Written, it reads:

```markdown
---
status: draft
date: 2026-09-30
type: defect
wave: 1
affectedFiles: [src/Ledger.Application/Interest.cs]
protectedFiles: [src/Ledger.Domain/**]
---

# 001 — Compute interest in decimal

## Intent

Interest is computed in `decimal` from end to end, so no account gains or
loses a fraction of a cent to binary rounding, as
[ADR-0002](../docs/adr/0002-money-is-decimal.md) requires of every amount.

## Negative Scope

- No change to how transfers work.
- No new rounding rule: the result is rounded as it is today.

## Not Empowered

- The domain model in `src/Ledger.Domain/`.

## Invariants

- [ ] no `double` in `src/Ledger.Application/Interest.cs`

<!-- @assert-absence target="src/Ledger.Application/Interest.cs" symbol="double" word="true" -->

## The Defect, Measured

`Interest.For` converts the balance and the rate to `double` and back:

<!-- @assert-count target="src/Ledger.Application/Interest.cs" symbol="double" word="true" min="1" -->
```

`affectedFiles` is what the round may write and `protectedFiles` what it
must not change. The assertion under *Invariants* is a *goal*: it must hold
when the round is done. The one under *The Defect, Measured* is a *premise*:
it holds now, and the round exists to make it stop.

```console
$ npx spec-brief lint
1 brief(s) checked, no findings
```

## 6. Plan the waves

A second brief, *Record every transfer*, is drafted for wave 1 too, with
`affectedFiles: [src/Ledger.Application/**, src/Ledger.Infrastructure/TransferLog.cs]`.
Two rounds in one *wave* run side by side, so they must not be able to write
the same file:

```console
$ npx spec-brief matrix
wave 1 · 2 briefs
       001  002
  001    ·    X
  002    X    ·
  X 001 "src/Ledger.Application/Interest.cs" and 002 "src/Ledger.Application/**" both cover src/Ledger.Application/Interest.cs
```

Exit 1. The scopes are compared as globs, so the collision is found although
no pattern repeats the other. `schedule` computes waves that hold, and says
why each brief moves:

```console
$ npx spec-brief schedule --write
wave 1 · 1 brief
  001  Compute interest in decimal
wave 2 · 1 brief
  002  Record every transfer        moves from wave 1
         wave 1 does not hold: 001 there also writes src/Ledger.Application/Interest.cs
         not wave 1, where 001 also writes src/Ledger.Application/Interest.cs ("src/Ledger.Application/**" and "src/Ledger.Application/Interest.cs")

wrote the wave of 1 brief: briefs/002_record-every-transfer.md
```

## 7. Approve the brief and start the round

The first human gate: Pat reads brief 001 - its scope and what it protects -
sets it `active`, and commits it. The agent works on a branch named after the
brief, which is how every spec-harness command knows which brief is in play:

```console
$ npx spec-brief list
ID   STATUS  WAVE  TASKS  READY  TITLE
001  active  1     0/1    yes    Compute interest in decimal
002  draft   2     0/2    no     Record every transfer
$ git switch -c brief/001-compute-interest
$ npx spec-harness context
# Round 001: Compute interest in decimal

Status active · wave 1 · branch `brief/001-compute-interest` · measured from `main`

## The contract
…
## Scope, as the guard reads it

May write:
- `src/Ledger.Application/Interest.cs`

Must not change without a ruling:
- `src/Ledger.Domain/**`

Rulings in force:
- none
…
## Rules in force for this scope

### docs/adr/0001-dependencies-point-inward.md

- line 12: src must keep its layers in order, Ledger.Domain < Ledger.Application < Ledger.Infrastructure - dependencies point inward
…
## Documents the brief cites

### `docs/adr/0002-money-is-decimal.md` - ADR-0002: Money is a decimal (accepted)
…
```

That is the *context packet*: the brief in full, then what it implies. Before
each write the agent can ask, and with `init`'s hooks Claude Code asks on its
own:

```console
$ npx spec-harness guard src/Ledger.Application/Interest.cs
ok       src/Ledger.Application/Interest.cs is in brief 001's scope (src/Ledger.Application/Interest.cs)
$ npx spec-harness guard src/Ledger.Application/Transfers.cs
warning  src/Ledger.Application/Transfers.cs is outside brief 001's scope, which covers src/Ledger.Application/Interest.cs
         if the round needs it, say so in briefs/001_compute-interest-in-decimal.md and add it to affectedFiles; the archive reports every file outside the scope
$ npx spec-harness guard src/Ledger.Domain/Account.cs
refused  brief 001 does not empower this round to change src/Ledger.Domain/Account.cs (protectedFiles: src/Ledger.Domain/**)
         if the round cannot be done without it, stop and ask for a ruling: spec-harness escalate --path <file> --reason <why>, or the request_escalation tool
```

The same refusal, as the PreToolUse hook answers an `Edit` of `Account.cs`:

```json
{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"spec-harness: brief 001 does not empower this round to change src/Ledger.Domain/Account.cs (protectedFiles: src/Ledger.Domain/**). Next: if the round cannot be done without it, stop and ask for a ruling: spec-harness escalate --path <file> --reason <why>, or the request_escalation tool."}}
```

## 8. Escalate, and rule

The agent decides the fix belongs on `Account`, which the brief protects. It
does not work around the refusal; it *escalates*:

```console
$ npx spec-harness escalate --path src/Ledger.Domain/Account.cs \
    --reason "Interest on a balance is the account's arithmetic; in Account it stays decimal where the balance lives." \
    --option "Allow: one new method, Account.InterestAt; no existing member changes" \
    --option "Refuse: Interest.cs multiplies the public Balance itself" \
    --recommend "Allow; the method is additive."
# Escalation E-001-1
…
## Options

1. **Allow** - one new method, Account.InterestAt; no existing member changes
2. **Refuse** - Interest.cs multiplies the public Balance itself

## The agent recommends

Allow; the method is additive.

## To rule

Allow: `spec-harness rule E-001-1 --allow --note "<what exactly is allowed>"`
Refuse: `spec-harness rule E-001-1 --deny --note "<why>"`
…
```

Exit 1: the round waits on a person. Pat rules, and the *ruling* is a row in
the brief that counts only once Pat's signature is on the commit that wrote
it:

```console
$ npx spec-harness rule E-001-1 --allow --note "Add Account.InterestAt only."
briefs/001_compute-interest-in-decimal.md now holds ruling R-001-1:

  | R-001-1 | `src/Ledger.Domain/Account.cs` | allow | Add Account.InterestAt only. |

It counts once you commit it signed, with a key the base branch's allowed signers list:

  git commit -S -m "ruling R-001-1: allow" -- briefs/001_compute-interest-in-decimal.md
$ npx spec-harness rulings
R-001-1  allow  src/Ledger.Domain/Account.cs  not verified: its row is not committed
$ git commit -S -m "ruling R-001-1: allow" -- briefs/001_compute-interest-in-decimal.md
$ npx spec-harness rulings
R-001-1  allow  src/Ledger.Domain/Account.cs  signed by person@example.test
$ npx spec-harness guard src/Ledger.Domain/Account.cs
ok       src/Ledger.Domain/Account.cs is protected by brief 001, and ruling R-001-1, signed by person@example.test, allows it
```

An agent can write the same row, and compute any hash; it cannot produce the
signature of a key in the *allowed signers* file as the *base* branch has it.

## 9. Do the work, and audit it

Before the work, the audit says what is missing:

```console
$ npx spec-harness audit
audit of brief 001 from main (079d71e74bf3)

error    briefs/001_compute-interest-in-decimal.md:29  "no `double` in `src/Ledger.Application/Interest.cs`" is neither ticked nor dispositioned  archive/open-task
         tick it, or say why under it, as a bullet or as a paragraph after a blank line, starting "**Delegated", "**Accepted debt", "**Rejected"
error    briefs/001_compute-interest-in-decimal.md:31  "double" must not appear in src/Ledger.Application/Interest.cs: expected no matches, found 2  goal-failed
         the round is not done until this holds
warning  briefs/001_compute-interest-in-decimal.md:37  a premise still holds after the round: "double" must appear at least 1 time in src/Ledger.Application/Interest.cs  premise-holds
         the round set out to change what this premise states; check that it did, or move the assertion out of the premises

measured: goals: 0 held, 1 failed · premises: 0 retired, 1 holding · archive: asked · rulings: 1 verified, 0 unverified · dependencies: 0 changed, 0 unread
2 error(s), 1 warning(s), 0 note(s)
```

The `measured:` line says what the audit read, so a part it could not read
shows there instead of passing unseen.

The agent adds `public decimal InterestAt(decimal rate) => Balance * rate;` to
`Account`, makes `Interest.For` return `account.InterestAt(rate)`, ticks the
box, and commits under its own name. Then:

```console
$ npx spec-harness audit
audit of brief 001 from main (079d71e74bf3)

note     briefs/001_compute-interest-in-decimal.md:7  spec-harness waives protected-file for src/Ledger.Domain/Account.cs: ruling R-001-1, signed by person@example.test, allows it  archive/waived
         review the waiver with the round; it stands where the refusal was
note     briefs/001_compute-interest-in-decimal.md:37  a premise no longer holds, as the round intended: "double" must appear at least 1 time in src/Ledger.Application/Interest.cs  premise-retired
         nothing to do

measured: goals: 1 held, 0 failed · premises: 1 retired, 0 holding · archive: asked · rulings: 1 verified, 0 unverified · dependencies: 0 changed, 0 unread
0 error(s), 0 warning(s), 2 note(s)
```

The goal holds, the premise is retired as intended, and the protected file
the round changed is covered by a signed ruling. The guard only advised; the
audit is the *gate*, and it measured the diff from the base whatever wrote it.

## 10. Archive, and merge

The second human gate. The archive runs on the branch, before the merge,
where the rulings verify:

```console
$ npx spec-brief archive 001 --dry-run --summary "Interest is computed in decimal."
would move briefs/001_compute-interest-in-decimal.md -> briefs/archive/001_compute-interest-in-decimal.md
  1 relative link rewritten
  the round changed 3 files

briefs/001_compute-interest-in-decimal.md
  7  note     spec-harness waives protected-file for src/Ledger.Domain/Account.cs: ruling R-001-1, signed by person@example.test, allows it  waived
              review the waiver with the round; it stands where the refusal was

banner:
  <!-- spec-brief:banner -->
  > **Archived 2026-09-30.**
  > Interest is computed in decimal.
  > Recorded at commit `f044e51`: 3 files changed, +10 −3.
  > Relative links were rewritten to resolve from `briefs/archive/` (1); no other word changed.
  > The body below describes the tree before execution and is not maintained.
  <!-- /spec-brief:banner -->
```

Pat reads the plan, runs it without `--dry-run`, commits the result, and
merges with a merge commit, which keeps the signed ruling's commit as it was
(see [merge settings](adopting.md#merge-settings-that-keep-rulings)):

```console
$ npx spec-brief archive 001 --summary "Interest is computed in decimal."
moved briefs/001_compute-interest-in-decimal.md -> briefs/archive/001_compute-interest-in-decimal.md
…
nothing was committed; review the change and commit it with the round
$ git add -A && git commit -m "Archive brief 001"
$ git switch main && git merge --no-ff brief/001-compute-interest
$ git log --oneline --graph -6
*   12b039c Merge brief 001: compute interest in decimal
|\
| * 951fdb7 Archive brief 001
| * f044e51 Compute interest in decimal (brief 001)
| * 0180393 ruling R-001-1: allow
|/
* 079d71e Briefs 001 and 002; 001 approved
* 13a2b7b Configure the spec tools; Pat signs rulings
$ npx spec-brief list --archived
ID   STATUS    WAVE  TASKS  READY  TITLE
002  draft     2     0/2    no     Record every transfer
001  archived  1     1/1    -      Compute interest in decimal
```

## In CI

On every change, CI runs the checks that need no round in flight. On `main`
now, each exits `0`:

```bash
npx spec-guard
npx spec-graph check
npx spec-brief lint
npx spec-brief matrix
npx spec-harness premises   # 0 premise(s) in 1 live brief(s), 0 no longer hold
```

And it checks a change against the base branch's rules. Suppose a change
deletes ADR-0001's assertion and adds the forbidden `using` in the same
commit. Its own rules pass; `main`'s do not:

```console
$ npx spec-guard
spec-guard 2 specs · 1 assertion · javascript

1 passed · 11ms
✔ every spec assertion holds
$ git worktree add --detach ../base main
$ npx spec-guard "../base/docs/adr/**/*.md"
spec-guard 2 specs · 2 assertions · javascript

✖ ../base/docs/adr/0001-dependencies-point-inward.md:12  @assert-layers
    src must keep its layers in order, Ledger.Domain < Ledger.Application < Ledger.Infrastructure
    expected no violating files, found 1
    reason: dependencies point inward
      src/Ledger.Domain/Account.cs:1:1  Ledger.Domain -> Ledger.Infrastructure: using Ledger.Infrastructure

1 passed · 1 failed · 18ms
```

[Adopting](adopting.md) has both as jobs for GitHub Actions and GitLab CI,
and the forge settings that keep an agent from changing the rules it is
checked against.
