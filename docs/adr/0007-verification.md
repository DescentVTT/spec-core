---
status: accepted
date: 2026-09-26
---

# ADR-0007: Verification is against something outside the code

## Context

A defect here ships in every tool that copies the module (ADR-0001), and the
most expensive defects in the family so far were the kind a suite written by
the same hand does not find: a clause of the ECMAScript specification read
backwards, a comment masked from the wrong end, a fence opened on the wrong
info string. The sibling tools each found theirs by comparing against
something that was not their own belief.

## Decision

Every module is checked against at least one thing it did not write:

| Module | Checked against |
| --- | --- |
| `pattern` glob | An oracle that reads generated syntax trees by the definition, recursively, and never shares a parser with the engine (`tests/pattern/oracle.test.ts`); five dialect readings over every path of up to three segments. |
| `pattern` witness | Brute-force enumeration: a witness must satisfy its claim, nothing shorter may, and `none` must leave nothing satisfying, over every path to length six. |
| `pattern` regex | `RegExp`, over a written corpus and a generated one (moved from spec-graph). |
| `markdown` | Every scanner it replaces, run side by side, each difference named in a test as a fix or a dialect; invariants over a generated corpus. |
| `jsonrpc` | The protocol revisions it serves, message by message. |

Then mutation testing, for the question the above cannot answer - does a test
pin down each decision. The sweep covers all of `src/` against all of
`tests/`; every test is a unit test, so there is one sweep, not two.

**Thresholds are measurements, never targets.** The first full sweep sets the
`break` a little under what it measured; it moves up with the measurement and
never down to let a change pass. A surviving mutant is read, and either killed
by a test that asserts a decision or left with a comment saying why it is
equivalent. A test that restates the implementation to kill a mutant is worse
than the survivor. *Amended 2026-09-27*: the `break` is 94, set against the
first two full sweeps; the record below has the measurements and what was
done with the survivors the second one found.

**A test for every heuristic's negative case.** A rule that fires has a test
for the input where it must not.

## Consequences

The suite is larger than the code, and slower than a unit suite usually is,
because the oracle and enumeration tests do real work. They are what makes a
change to the core safe to copy.

## Record

### 2026-09-27: the first gate

Two full sweeps, both on hosted CI (the `mutation` job):

| Commit | Run | Score | Mutants | Killed | Timed out | Survived | No coverage |
| --- | --- | --- | --- | --- | --- | --- | --- |
| cbe2223 | 36213861974 | 95.37% | 5,029 | 4,214 | 582 | 206 | 27 |
| 8840d36 | 36252418643 | 94.89% | 5,086 | 4,251 | 575 | 233 | 27 |

The second took three hours. Stryker counts a mutant that times out as
detected, and whether one times out depends on the runner as much as on the
code: among the mutants of code the two commits share, 23 timed out in the
first sweep and survived the second, one did the reverse, and 79 moved
between killed and timed out. Counted as the first sweep counted them, the
second would have scored 95.32%. The rest of the difference is the five
survivors in the code the second commit added.

**The `break` is 94**: under 94.89% by 0.89 points, some 45 mutants, which
is more than the swing between two sweeps of nearly the same code, so noise
does not fail the build, while a change that leaves that many more alive
does. `high` and `low` stay where they were.

The second sweep reported 28 survivors the first did not; the 23 of them in
shared code had all timed out the first time. Each was read.

- **Killed, 17**, each by a test of a decision it had left unpinned:
  the column of a list item's text after no space, four spaces and five
  (eight of the nine at `itemColumn`); the items a marker leaves open (two,
  with the four survivors on the same line that both sweeps reported); an
  image in a link's text that closes past the text's `]`, and a wiki embed
  there, which is not read (three); the JSON-RPC 2.0 error codes and the
  `_meta` key for client information, written out as a client meets them
  (four, with `INTERNAL_ERROR` and the other three `_meta` keys, which both
  sweeps reported). Each was applied by hand and seen to fail the new test.
- **Equivalent, 11.** Applied by hand, each leaves the whole suite passing,
  and each has a comment beside the code saying why:
  - `links.ts`, leaving a link's text: `textEnd > 0` (a `]` that closes a
    `[` is never at 0) and `at > textEnd` (the `]` is read as no link, and
    one step later resumes at the same place).
  - `links.ts`, `pairBrackets`: `at <= to`; `tables.ts`, `splitRow`:
    `at <= line.end`; `scan.ts`, `closeRun`: `at <= stop`. Each reads a
    line terminator, as the file's header says.
  - `scan.ts`, `closeRun`: a search for `""` (records a run of length zero,
    which no opener asks for) and `at > 0` (a run ends at `from`, so `from`
    is past 0).
  - `scan.ts`, the loops that pop the list item stack: `true` and
    `items.length >= 0` for `items.length > 0` (`undefined > indent` is
    false). The same pair on the other loop timed out in both sweeps.
  - `scan.ts`, `itemColumn`: `spaces > 1` (at one space both arms give one).
  - `lists.ts`: `sawBlank` starting `true` (nothing reads it before a
    marker line clears it).

The survivors both sweeps reported are not reread in this entry.

### 2026-09-27: the first sweep under the gate

| Commit | Run | Score | Mutants | Killed | Timed out | Survived | No coverage |
| --- | --- | --- | --- | --- | --- | --- | --- |
| c78de30 | 36267469758 | 95.42% | 5,086 | 4,342 | 511 | 206 | 27 |

Stryker enforced `break: 94`, and the sweep cleared it by 1.42 points.
c78de30's code is 8840d36's - only tests and comments changed between them -
so what moved is what the tests of the entry above killed, and the runner:
against the sweep of 8840d36, 24 survivors were killed, 5 timed out instead
and one mutant that had timed out survived, and 77 moved from timed out to
killed and 17 back.
