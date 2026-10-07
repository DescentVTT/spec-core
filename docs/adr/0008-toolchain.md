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
*Amended 2026-10-07*: Vitest 5 has had them, and they are not what it waits
for; see below.

## Amended 2026-10-07: vitest is held on 4 until Stryker's runner reads 5

Vitest 5.0.0 is from 3 September and 5.0.3 from 30 September, and on
2026-10-06 Dependabot proposed 5 in all five repositories. It is not taken,
and its age is not why.

**What breaks.** Vitest 5 matches `testNamePattern` against a test's full
name with ` > ` between its suites and its own name, where 4 put a space
(its migration guide, "`testNamePattern` Matches the `>`-Joined Full Name").
Stryker's vitest runner runs a mutant against the tests that cover it by
setting that pattern, built from names it joins with a space. On vitest 5
the pattern matches no test that sits in a `describe`, the run executes
nothing, and the mutant is scored as survived. Nothing errors: the suite
passes, Stryker's dry run passes, the runner's peer range is
`vitest >=2.0.0`, and the sweep prints a score. This is
[stryker-js #6210](https://github.com/stryker-mutator/stryker-js/issues/6210),
open since 2026-09-04, in `@stryker-mutator/vitest-runner` 10.0.0, the newest
release there is. Two pull requests there, #6214 and #6220, give the runner
the separator of the vitest it finds; neither has a maintainer's review, and
neither is merged or released. spec-guard met the symptom on 2026-09-07 and
pinned vitest then.
[Its ADR-0003](https://github.com/DescentVTT/spec-guard/blob/main/docs/adr/0003-mutation-testing.md)
has the evidence: over one function, the runner on vitest 4 and Stryker's
`command` runner both killing five mutants of eight, and over the whole
source, 3.54% on vitest 5.

**What it measured.** The sweep of Dependabot's branch here, run
37528529991, beside main's sweep of the same source, run 37556549438:

| Vitest | Score | Mutants | Killed | Timed out | Survived | No coverage |
| --- | --- | --- | --- | --- | --- | --- |
| 4.1.11 | 96.36% | 5,546 | 5,091 | 253 | 195 | 7 |
| 5.0.0 | 4.00% | 5,546 | 221 | 1 | 5,317 | 7 |

Under vitest 5, 5,313 mutants are survived, covered by a test, and ran none
(`testsCompleted` is 0 in the report); under 4, none is. The 222 detected
are static mutants, which run the whole suite under no pattern. They are
also why the line Stryker prints is no check: "Ran 6.67 tests per mutant on
average" for `links.ts`, where main printed 7.12, because 226 static mutants
carry the average. spec-harness's core sweep read 3.83% over 4,862 mutants
the same day, where its main reads 98.13%. In the other three the bump
passed its mutation checks or met none: spec-brief sweeps main and no pull
request, spec-graph's sweep of a pull request is incremental and reused
8,381 of 8,385 verdicts, and spec-guard's reused 12,218 of 12,294. Of the
three, spec-guard's pull request alone failed, and on the assertion in its
ADR-0003, not on a sweep.

**The decision.** `vitest` and `@vitest/coverage-v8` stay on the 4 line in
all five repositories until a released `@stryker-mutator/vitest-runner`
reads vitest 5 and the check below has passed with it. Two things hold
them. Dependabot proposes no major of `vitest` or of an `@vitest` package
(`.github/dependabot.yml`); minors and patches of 4 still come, and a
security update is not held back by that rule. And `tests/boundaries.test.ts`
fails when `package.json` admits a vitest that is not a 4, with a message
that names the issue and this amendment, so a bump made by hand fails
`npm test` with its reason, before any sweep and where there is none.
spec-brief, spec-graph and spec-harness have the same test, and spec-guard
its assertion.

**Vitest 4 while it is held.** Vitest's release policy (vitest.dev/releases,
read on 2026-10-07) gives regular fixes to the current minor, 5.0, and
"important fixes and security patches" to the last minor of the previous
major, 4.1; everything older, 3.2 included, is unsupported. So 4.1 is a
supported line, for what its maintainers judge important and no longer for
an ordinary bug: 4.1.11 of 2026-08-18 is its newest release, and since
5.0.0 its branch has taken documentation only. The standing is real - 3.2
had three releases in June and July 2026, while 4 was current - and it has
no date. It ends when vitest 6 is released, and majors have come nine to
eleven months apart (3.0 in January 2025, 4.0 in October 2025, 5.0 in
September 2026). The hold has no date either. If vitest 6 comes first, 4.1
leaves support and holding it stops being free: this decision is reopened
then.

**Lifting it.** Stryker publishes every package at one version, and its
`master` has taken a feature since 10.0.0, so the fix is expected in
`@stryker-mutator/vitest-runner` 10.1.0 or later, with
`@stryker-mutator/core` at the same version, which the runner's peer range
asks for exactly. The number is not the test: the release's notes must name
#6210, #6214 or #6220. Then, here first, because this repository's sweep
runs in full on every pull request and takes about nine minutes:

1. On a branch of spec-core, in one commit: both Stryker packages to the
   fixed release; `vitest` and `@vitest/coverage-v8` to a 5 chosen by hand
   (see the cooldown, below); the hold taken out, which is the test in
   `tests/boundaries.test.ts` and the two vitest entries under `ignore` in
   `.github/dependabot.yml`. Nothing under `src/` and no other test, so that
   the sweep compares two runners over one suite.
2. `npm run lint`, `npm test` and `npm run build` pass. A test that fails
   there is vitest 5's own change, listed in its migration guide, and is
   fixed in a commit of its own.
3. Open the pull request and wait for its `mutation` job. Accept only if
   both of these hold.
   - The merged score is within half a point of main's last sweep, 96.36%
     as this is written. Sharded sweeps of one source have read 96.20 to
     96.38% (ADR-0007), the lowest of them the sweep of this amendment. A
     wider gap is read mutant by mutant, as that record reads one, before
     anything is accepted.
   - No mutant in the merged report is survived, covered and untested:

     ```bash
     gh run download <run> --repo DescentVTT/spec-core --name mutation --dir reports/lift
     node -e "const r=JSON.parse(require('node:fs').readFileSync('reports/lift/mutation.json','utf8'));let n=0;for(const f of Object.values(r.files))for(const m of f.mutants)if(m.status==='Survived'&&(m.coveredBy??[]).length>0&&(m.testsCompleted??0)===0)n+=1;console.log(n)"
     ```

     It prints 0 for main's sweep and 5,313 for run 37528529991.

   A score near 4%, or one such mutant, is a runner that still does not
   read vitest 5: close the pull request and leave the hold.
4. Merge, then make the same change in the four tools, a pull request each.
   Only spec-harness's pull request runs a sweep that measures the bump,
   its core sweep. spec-graph's and spec-guard's are incremental and reuse
   the verdicts vitest 4 gave, and spec-brief sweeps main. So before one is
   merged, dispatch `mutation.yml` on its branch, which is the full sweep in
   each of the four (in spec-brief with `full` ticked, which is not its
   default), and hold that sweep to the same two conditions against the
   repository's last sweep of main.
5. Each of those changes takes its own hold out - spec-guard's is the pin
   and the assertion in its ADR-0003 - and amends its ADR to say so.

**What the cooldown proposed.** Dependabot waits thirty days for a major
(`semver-major-days`), and applies the wait to each version, not to the
line. Its log of 2026-10-06, run 37528308897, reads "Filtered out 3 versions
due to cooldown" - 5.0.1, 5.0.2 and 5.0.3, then 21, 11 and 6 days old - and
"Latest version is 5.0.0", which was 33. So the first proposal of a major
is its `.0.0`, the release of that line with the fewest fixes, and while
patches keep coming the proposal stays a month behind them. The cooldown
keeps out a release withdrawn in its first days, which is what it is for;
it does not choose a patched one. A major is therefore taken by hand, at a
version read from the registry: the newest patch that has had the week
this family asks of a patch, on a line that has had its month.
