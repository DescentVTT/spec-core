---
status: accepted
date: 2026-09-26
---

# ADR-0003: Three named glob dialects on one automaton

## Context

The three tools read the same syntax against different things, and some of
the differences are the point:

- spec-brief and spec-graph match a pattern against the whole path.
- spec-guard's `glob=` follows ripgrep's `-g`: a pattern with no `/` is matched
  against the file name at any depth.
- spec-guard's `exclude=` follows `.gitignore`: `tests` excludes every `tests`
  directory and everything in it.

Others were accidents: `**` inside a segment crossed directories in two tools
and not the third; spec-graph folded case on Windows only; unclosed brackets
were literals in one tool and errors in another; spec-guard's `RegExp` took
seconds to fail a long name. And spec-brief needed something none had
generally: whether two scopes can name the same file (a collision), whether one
lies inside another, and a file both would write, as evidence.

## Decision

**The dialect is a named, required option; the syntax and the engine are one.**

| Dialect | Matched against | A pattern with no `/` | Everything beneath a match |
| --- | --- | --- | --- |
| `path` | the whole path, anchored | a literal names a file, a directory or either, as the caller says | only for a literal read as a directory, or `dir/` |
| `ripgrep` | the whole path, or the last segment when the pattern has no `/` | matches the file name at any depth | no |
| `gitignore` | the path or any directory above it | matches any segment at any depth | yes, always |

Shared by all three:

- `**` is a globstar only as a whole segment. In the middle or at the start it
  is zero or more whole directories; at the end it is **at least one**
  segment, so `docs/**` is the directory's contents and not the directory.
  This is `.gitignore`'s reading, and it is what makes a collision witness a
  file: `docs/adr/**` against itself yields `docs/adr/x`, never `docs/adr`.
  Elsewhere `**` is `*` (`**.md` is `*.md`), as in `.gitignore`, bash and
  minimatch.
- `*`, `?` and classes never match `/`; `*` matches a leading dot.
- Characters are code points.
- **Case is required**, `caseSensitive: true | false`, with no default. The
  family's rule for paths is case-sensitive everywhere: git's paths are, and a
  result must not depend on the host.
- Malformed is an error in every dialect: an unclosed `[` or `{`, an extended
  glob, a `..`, a `\` before a letter (a Windows separator typed by mistake,
  unless the caller asks for `backslash: 'separator'`). A lone `}` is a literal:
  it cannot mean anything else.
- `!` is a list concern, not a pattern's: `parseGlobList` reads entries in
  order, last match wins, as `.gitignore` does.

**One engine**: a Thompson automaton over code points, simulated with a set of
live states. Matching costs at most the automaton's size times the path's
length. The same automata answer the set questions by a breadth-first search
over their product, with the automata to avoid tracked as sets of live states:

- `globWitness(include, exclude)` - a shortest valid path every `include`
  matches and no `exclude` does, spelled with readable characters, or `none`
  as a proof that no path exists, or `undecided` at the budget.
- `globCovers(outer, inner)` - whether `inner` lies inside the union of
  `outer`: a witness search for `inner` avoiding `outer`.

A witness is a valid path: no empty, `.` or `..` segment, no NUL. Characters
are tried at the boundaries of every set in play, which meets every
combination of answers those sets can give, so `none` is exact. The set
questions are defined for case-sensitive globs only, which is every scope.

## Consequences for each tool

Adopting the core changes what users see, and each tool's changelog says so:

- **spec-graph**: path globs stop folding case on Windows. `**` inside a
  segment stops crossing directories. An unclosed `[` becomes an error.
- **spec-guard**: the 28-second match is gone. `**` inside a segment, an
  unclosed `[` or `{`, and an extended glob change from literal or regex
  readings to the shared ones and to errors, which the directive reports as a
  directive error rather than a rule that silently matches nothing.
- **spec-brief**: a trailing `/**` no longer matches the directory itself, so
  a collision witness is a file. A literal path's reading is supplied by the
  tree (ADR-0005 there), and protected paths can be subtracted from a scope
  exactly, so "all of `src/` except the schema" can be written.

The regular-expression matcher from spec-graph (its ADR-0017) moves here
unchanged as `compileRegex`, JavaScript's dialect without `u`, held to
`RegExp` by a differential test.
