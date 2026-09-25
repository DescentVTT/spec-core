---
status: accepted
date: 2026-09-26
---

# ADR-0002: Pure and total

## Context

Everything in this library is run by every spec-* tool, in CI, next to
secrets, over files anyone can write: a Markdown document, a glob in a brief's
front matter, a pattern in a configuration file, a message on an MCP pipe.
Two properties are therefore not preferences.

## Decision

1. **Pure.** No module performs I/O or reads the clock, the environment or the
   platform. A function's answer depends on its arguments and nothing else, so
   a result computed on Windows is the result computed in Linux CI.
   `serveLines` takes its byte source and its writer as arguments for this
   reason.
2. **Total, and bounded by its input.** No function takes longer than a
   stated function of the size of what it reads, whatever that input says:
   - No user-supplied string is compiled to a `RegExp`
     (`tests/boundaries.test.ts` refuses the constructor anywhere in `src/`).
     Globs and regular expressions run on automata that keep a set of live
     states, so a match costs at most the pattern's size times the subject's
     length.
   - Where a question has no such bound - the witness search over automata a
     scope must avoid, which tracks subsets of their states - the search has a
     budget and answers `undecided` when it meets it. `undecided` is never
     read as yes or as no by a tool; it is reported.
   - Every loop ends by construction, and the scanner makes one pass over a
     document plus work proportional to what it finds.
3. **Refuse rather than guess.** A malformed pattern, an unsupported YAML
   construct, a protocol message in the wrong shape - each is an error with a
   reason, never a best-effort reading. A typo read as a literal is a scope
   that matches nothing and reports clean.

## Consequences

The tools keep their edges (disk, git, process) and gain nothing that could
surprise a security review. Tests here never touch the disk except
`tests/boundaries.test.ts`, which reads the sources it checks.
