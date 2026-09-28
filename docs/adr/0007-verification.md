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

**A test of cost states a ratio, not a number of milliseconds.** *Amended
2026-09-28.* A slow or busy machine slows every run, and can push one past
any fixed bound: the scan of a generated megabyte, held to a second, took
915 ms on a machine running other suites. So a test of cost times the same
work at two sizes - a document scanned once at sixteen times its size and
sixteen times over at its size, a name matched and one four times as long -
over runs of about the same length, taken in turn, and allows twice what
linear work takes and a fixed allowance for noise; four times for ordinary
documents, which hold none of the shapes the hostile ones are built from.
Such a test holds only
what changes cost alone, a memo or a mark that a state was visited; a mutant
that changes an answer is held by a test of the answer. The two bounds of
two seconds on the regular-expression matcher stay: every mutant that fails
them changes an answer those tests assert first, and the work they bound
takes microseconds.

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

### 2026-09-27: the sweep of 119345e, and the gate at 94.5

| Commit | Run | Score | Mutants | Killed | Timed out | Survived | No coverage |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 119345e | 36326262615 | 95.56% | 5,227 | 4,460 | 535 | 212 | 20 |

119345e added the reading of a link inside a link, the front matter never
closed, an HTML block's tag and the advice for `**` inside a name. Against
the sweep of c78de30, five survivors were new and none of the old ones gone
but by moving. Each new one was read:

- **Equivalent, 3**, in `globstarAdvice`, each with its comment at the code:
  `at <= written.length`, `close >= 0` and `close - 1`.
- **Killed, 1**: `links.ts`, the backslash that skips the escaped character
  as the link text is walked, emptied. An escaped `[` then opened a wiki
  link with the `[` after it, so `\[[a]]` read as `[[a]]`; the wiki-link
  test now holds an escaped one to no link.
- **Killed, 1**: `LEGACY_RESOURCE_NOT_FOUND` made `+32002`. It and
  `UNSUPPORTED_PROTOCOL_VERSION` trade places between survived and timed out
  from sweep to sweep - a constant's mutant runs the whole suite - and no test
  held either: the tests compared the reply's code to the constant itself.
  They now write -32002 and -32022 out, as the test of JSON-RPC 2.0's codes
  already did.

**The `break` is 94.5.** Two sweeps of the code as it now stands read 95.42%
and 95.56%, over the 94.89% the `break` of 94 was set against. 95 would sit
0.42 points under the lower of them, inside the 0.48 that two sweeps of
nearly the same code have swung; 94.5 sits 0.92 and 1.06 points under, as
far as 94 sat under 94.89.

### 2026-09-28: the sweeps of d5fab98 and 65ef842, and what timing out hid

| Commit | Run | Score | Mutants | Killed | Timed out | Survived | No coverage |
| --- | --- | --- | --- | --- | --- | --- | --- |
| d5fab98 | 36337062683 | 95.54% | 5,227 | 4,493 | 501 | 213 | 20 |
| 65ef842, its pull request | 36343489435 | 95.48% | 5,287 | 4,537 | 511 | 219 | 20 |
| 65ef842, main | 36354143778 | 94.21% | 5,287 | 4,614 | 367 | 286 | 20 |

d5fab98 changed tests and the gate and nothing else, and its sweep cleared
94.5 by 1.04 points. 65ef842, with ca0ec02 under it, changed where a
definition is read, and was swept twice, by its pull request and by main.
The code was the same and the runner was not: main's was faster, and 168
mutants that had timed out on the pull request's finished there - 101 were
killed and 67 survived - while 24 went the other way. Main's sweep read
94.21% and failed the gate. Against the sweep of d5fab98, 73 survivors were
new. Three were in the reader 65ef842 changed: the test that a definition's
line is Markdown and opens with structure, twice, which the new test of the
paragraph above now answered first wherever the suite looked, and the
second bracket's `undefined` test, which only narrows a type. The other 70
had timed out there, in code 65ef842 did not touch: 44 in `glob.ts`, 14 in
`automaton.ts`, 8 in `links.ts`, and one each in `regex.ts`, `lines.ts`,
`scan.ts` and `charset.ts`. A mutant that times out counts as detected, so
these had only ever been detected by being slow, and no assertion held what
they change.

Every mutant main's sweep reported undetected, and every one that timed out
in either sweep - 774 - was replayed by hand against the whole suite, one
run each, with the clock the timing tests read held at 0 so that only an
assertion about an answer could kill; the survivors were run again on the
real clock.

- **Of the 73, killed 44**, each by a test of the decision it broke: an
  escaped brace or comma inside braces; a group closing inside a group; a
  class hiding its commas from the braces when negated or opened with `]`,
  and never reaching past a `/`; a refusal from a later group; `./` as the
  root; an extended glob at the start of a pattern, or with more than one
  character before its `|`; a trailing `/` or a `.` segment inside braces,
  which anchors no gitignore pattern; `[!]]`; two globstars in a row
  compiling to the automaton one does; the last code point one UTF-16 unit
  holds; the automaton's ceiling, as a refusal with its message and as the
  longest literal that fits filling it exactly; a range inside an earlier
  one merging into it; the line a comment closes on holding no definition;
  and a `]` that closes nothing opening no link.
- **Of the 73, equivalent 28**, each commented at the code: arrows and
  buffers whose first value is never read; the builder's guards against an
  empty sequence or alternation, which no glob asks for; bounds one step
  past an end, where `''` or NaN is read; `close >= 0` where `close` is -1
  or past the `[`; `refClose !== undefined`, which only narrows a type; a
  step back into a link's text that comes back where it was; `resume`'s
  first value; and `/` as a literal, which no segment holds.
- **Of the 73, one now loops without end**: `close > 0` made `true` in
  `splitOptions`, which no test reached until the refusal of a class that
  reaches past a `/` did.
- **Of the 468 that timed out in either sweep, 268 are killed** by an
  assertion. 19 of them by tests added here: a dot and U+2028 and U+2029;
  a definition indented past three columns under one, at every width from
  four to twelve; a title its paragraph never closes; a destination
  running onto a line a comment opens; a wiki link read once with a
  paragraph after it; a colon past a scheme's place; a witness only an
  unreadable character makes, and none when every character is avoided;
  and ten mutants of `serveLines` that left its promise unsettled, which
  the tests waited on until vitest gave up and now fail at once, by asking
  whether it settled by the next turn of the event loop. Four more are
  killed on the real clock by the checks of linear time already there: the
  stamp that marks a state visited, the memory of a failed search for a
  closing backtick run (twice), and the memory of a comment that never
  closes, whose answers do not change without them; the last took two
  minutes with the clock held. **23 are equivalent**, each commented: an
  early return, a clamp or a loop bound at a value that answers the same, a
  guard that only narrows a type. **177 still time out or run out of
  memory**, and every one is a loop that no longer ends: 127 were still
  running after 150 seconds on their own, where the whole suite takes about
  ten, and 50 filled the heap.
- **Of the 233 survivors the sweep of d5fab98 reported too, 74 are now
  killed**, by the tests above and by tests of the decisions beside them:
  the MCP revisions negotiated, written out; a cancellation for a request
  that finished or never began, and for `"1"` beside `1`; several messages
  in one chunk; a witness's budget, its refusal of `..` and NUL, and of an
  empty search; a title-case letter and `ß` ignoring case; the names of
  `GlobError`, `AutomatonTooLarge` and `ProtocolError`; and others. One
  more now loops without end.

On main's report with these verdicts, the next sweep reads 96.05%. Counting
every mutant still timing out as a survivor, the worst a runner fast enough
to finish them could do, it reads 92.66%, which does not clear 94.5: it
would take 98 more of them held by an assertion. But no runner finishes a
loop that does not end, so none of the 179 can survive, and counted as
Stryker counts them, these mutants give the projection on any runner.

**The `break` stays 94.5.**

### 2026-09-28: what only a clock held

The sweep of pull request 4, run 36392120706, read 96.33% over 5,287
mutants. Stryker names the first test that fails a mutant, so a mutant a
test of an answer failed first is held by that answer. 214 were not: 136
that timed out, and 78 that a test of time failed first - the scan of a
generated megabyte, the glob check held to 250 ms, the regular-expression
checks held to two seconds, or a check of linear time. Each was replayed by
hand against the whole suite with the clock the tests read held at 0.

- **91 are killed by an answer**: all 78 a test of time failed first, among
  them the six the regular-expression checks did - a class that matches
  every character, a case twin taken for any letter, the mark that a state
  was visited - and 13 of those that timed out. So no mutant depends on the
  two seconds those checks allow.
- **106 never end**: 93 were still running after 75 seconds and 13 filled
  the heap.
- **17 survive**, and were run again on the real clock. Three change cost
  alone and are held by checks of cost as they now are: the mark that a
  state was visited in the glob matcher, whose live states otherwise repeat
  as many times as there are ways to reach them - 12 ms for a name the
  engine matches in 20 microseconds, 11 seconds for the 121-character one -
  and, twice, the memory of a failed search for a closing backtick run. 14
  are equivalent, each commented at the code; the two in `findTables` were
  not, and now are.

The glob check and the megabyte check were bounds in milliseconds, and now
compare two sizes, as the amendment above has it. The megabyte check never
ran instrumented, so it held no mutant; one loaded run took 915 of its 1,000
ms. The checks of linear time compared one small scan with one large one:
documents of 80,000 lines read linear work as 16 to 25 times on an idle
machine, from collecting a heap sixteen times as full, and a machine running
six other suites took their margin to 1.68 - one failed with nothing wrong.
They now time sixteen small scans against one large one, taken in turn, on
documents a third to a tenth the size, and the least margin under the
same load is 2.33. They time the links, list items and directives mask too,
which the scan makes when first read and which no check had timed. Of the
mutants written by hand to change cost alone, eight are caught on the real
clock; the ninth, a search of every definition for the one on the line
above, costs a third of a nanosecond a step and hides under the allowance
at these sizes, as it did before, when no check timed links at all.

**The `break` stays 94.5.**
