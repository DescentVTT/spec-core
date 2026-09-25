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
than the survivor.

**A test for every heuristic's negative case.** A rule that fires has a test
for the input where it must not.

## Consequences

The suite is larger than the code, and slower than a unit suite usually is,
because the oracle and enumeration tests do real work. They are what makes a
change to the core safe to copy.
