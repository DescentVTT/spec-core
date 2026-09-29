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
- `**` inside a name (`docs/**.md`, `a**b`) is an error. `.gitignore`, bash
  and minimatch read it as `*`; the tools this replaces read it as any depth,
  as one level, and as ripgrep does. Taking one of those readings quietly
  would narrow some scope that used to reach nested files, so the pattern is
  refused with the two ways to say what was meant, written from the pattern
  as given: `docs/**.md` is told `docs/**/*.md` for any depth or `docs/*.md`
  for one level, `src/a**` `src/a*/**` or `src/a*`, `a**b` `a*/**/*b` or
  `a*b`. Only the runs of stars change; braces, classes and escapes are kept
  as written, and a run beside a brace keeps a star on that side too, so the
  advice always compiles. *Amended 2026-09-27*: the refusal gave
  `docs/**/*.md` and `*.md` whatever was written.
- `*`, `?` and classes never match `/`; `*` matches a leading dot.
- Characters are code points.
- **Case is required**, `caseSensitive: true | false`, with no default. The
  family's rule for paths is case-sensitive everywhere: git's paths are, and a
  result must not depend on the host.
- Malformed is an error in every dialect: an unclosed `[` or `{`, an extended
  glob, a `..`, a `\` before a letter (a Windows separator typed by mistake,
  unless the caller asks for `backslash: 'separator'`). A lone `}` is a literal:
  it cannot mean anything else. An extended glob is a group holding a `|`
  after `*`, `?`, `+`, `@` or `!`, which is what one is written for; without
  a `|`, `C++(notes).md` and `*(2017).md` are names with parentheses in them,
  as ripgrep and `.gitignore` read them, and as the tools did before.
- The empty pattern is an error: it names nothing, and a list holding one is
  more likely a mistake in a configuration file than a wish to match nothing.
- A pattern too large to compile is refused as a malformed one is: braces
  that expand to more than 256 patterns, or an automaton past 65,536 states.
  *Amended 2026-09-28*: `parseGlob`, which says why it cannot compile a
  pattern, threw the second as `AutomatonTooLarge`, and `compileGlob`, which
  throws a `GlobError` naming the pattern, threw it too; both now give it as
  they give every other reason. What a caller's `literal` function throws
  still goes on up: it is the caller's failure, not the pattern's.
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

Also shared, found when the three engines were run beside this one
(`tests/pattern/differential.test.ts`, below):

- A `.` segment names nothing and is dropped; a pattern left naming no path,
  or climbing out of its root with `..`, is an error. *Amended 2026-09-29*:
  a trailing slash is read after that, so it cannot make a pattern that
  names no path name the contents of `.`. `/./` and `/.//` were the root's
  contents in the `path` and `ripgrep` dialects, every rooted path, where
  `/` and `/.` are refused; they are refused as `/.` is. `gitignore`, which
  drops the slash, refused them already.
- A directory's contents do not include the directory: `dir/`, `dir/**`, and
  a literal read as a directory all match what is beneath it, never `dir`
  itself. A trailing slash always means contents, glob syntax or not.
- Braces expand before anything else is decided, so `src/{a.ts,lib}` is two
  literals, each read as a file, a directory or either, as a literal without
  braces would be. *Amended 2026-09-28*: that includes the trailing slash.
  An alternative ending in `/` is read as that alternative written alone,
  so `{src/,lib}` is `src/**` or `lib` in the `path` and `ripgrep`
  dialects, the contents of `src` matched against the whole path, as `src/`
  and `{src,lib}/` already were. The slash was read before the braces were
  expanded, and only at the end of the whole pattern, so inside braces it
  was dropped: `{src/,lib}` named `src` itself, as a literal in `path` and
  as a name at any depth in `ripgrep`. In `gitignore` a trailing slash is
  dropped wherever it stands and the directory is excluded with everything
  in it, as git excludes a directory a slash names; `{build/,dist}` reads
  as it did. *Amended 2026-09-29*: an alternative that names no path -
  only `.` and empty segments, or nothing - is refused in every dialect, as
  that text written alone is, before its slash is read, and the refusal
  names it as the braces gave it:
  `the braces expand to "./", which names no path`, and for `{,a}`, as the
  empty pattern is refused, `the braces expand to an empty pattern`. Read
  after its slash, the `./` in `{./,a}` was the contents of `.`, so the
  `path` and `ripgrep` dialects matched every path, and `{./}`, `{.,a}/`
  and `.{/,a}` the same, where `./` alone is refused. `gitignore` refused
  them already, and every dialect `{.,a}`, `{/,a}` and `{,a}`, in the words
  a whole pattern is refused in, which did not say which alternative was
  meant. What stands beside the dots and slashes still counts:
  `src/{./,a}` is the contents of `src` or `src/a`, `a{,.ts}` is `a` or
  `a.ts`, and a leading `./` on a longer alternative is dropped, as on a
  whole pattern, so `{./a,b}` reads as `{a,b}` - in `ripgrep`, `a` at any
  depth, as `./a` is. *Amended 2026-09-29*: braces expand before a leading
  slash is read, too. An alternative that starts with `/` reads as that
  text written alone, in each dialect's terms: in `path` and `ripgrep` it is
  rooted at the filesystem's root, and in `gitignore` it is anchored at the
  repository root, as git reads a leading slash. So `{/docs,x}` is `/docs`
  or `x`. The pattern's own leading slash was read before the braces were
  expanded, and one an alternative gave was read after, as an empty
  segment, which names nothing: `{/docs,x}` read `docs`, a literal relative
  to the root in `path`, a name at any depth in `ripgrep` and `gitignore`.
  A `/` before the braces still roots every alternative, `/{docs,x}` being
  `/docs` or `/x`; and a `/` after a segment starts no text the braces
  give: `a/{/b,c}` is `a//b` or `a/c`, and `a//b` is `a/b`, its empty
  segment naming nothing, as it read before. A leading `./` is dropped
  first, from an alternative as from a whole pattern, so `{.//docs,x}` is
  `/docs` or `x`, as `.//docs` is `/docs`. An alternative that names no
  path is refused before its slash is read, as it was: `{/,a}` is
  `the braces expand to "/", which names no path`. *Amended 2026-09-30*: a
  leading `./` goes with the slashes after it, as POSIX reads `.//docs` as
  `./docs`, so `.//docs` is `docs` in every dialect, relative as `./docs`
  is, and `{.//docs,x}` is `docs` or `x`. The run of slashes was left to
  lead what the `./` left, and rooted it: `.//docs` was `/docs`, rooted at
  the filesystem's root in `path` and `ripgrep`, which no relative path is
  under, and anchored at the repository root in `gitignore`, where `./docs`
  excludes every `docs`. A slash the braces give after the pattern's `./`
  is one of those slashes, since braces expand first: `./{/docs,x}` is
  `.//docs` or `./x` and roots neither, where it rooted `/docs`. A `/`
  before the `./` still roots the pattern, `/.//docs` being `/docs`, as a
  run of slashes alone still names the root. A `./` followed by nothing but
  slashes and `./` is refused as `./` is,
  `the pattern names the root itself, not a path under it`, where `.//./`
  was refused as `/./` is, `the pattern names no path`.

*Amended 2026-09-30*: **a pattern typed below the root is rebased onto it by
`rebaseGlob`, braces first.** A tool run in a subdirectory that matches whole
paths from the root reads what was typed from where it was typed - spec-graph
re-anchors it (its ADR-0018) - and joining the directory to the pattern as
strings did that without reading braces: `{/docs,x}` typed in `sub` read
`sub/docs` or `sub/x` while `/docs` alone stayed rooted, `!/docs` became
`!sub//docs`, and `{/,x}`, refused at the root, read the contents of `sub`.
`rebaseGlob` reads the pattern as the `path` dialect does and rebases each
alternative the braces give as that text written alone would be. One with a
leading `/` is rooted at the filesystem's root, which no directory moves, and
is kept; any other gets the directory in front, a leading `..` climbing out of
it. So `{/docs,x}` typed in `sub` is `{/docs,sub/x}`, `{../a,b}` typed in
`sub/deep` is `{sub/a,sub/deep/b}`, and `{/,x}` is `{/,sub/x}`, refused as it
is at the root. When every alternative is rebased alike the braces stay as
written, `{a,b}` being `sub/{a,b}`, and a `!` before the pattern stays before
it, as a list reads one. What cannot be rebased faithfully is refused with a
reason rather than written: a `..` that climbs above the root, in the words a
pattern climbing out is refused in; a directory whose name a pattern would
read as syntax - a `*`, `?`, `[`, `{` or `\` in it, or a `!` or a space it
starts with; and alternatives that must be written out and hold a `,` or a
`}`, which would read as braces. The other two dialects are not rebased: a
`ripgrep` or `gitignore` pattern without a slash matches at any depth, and git
anchors a leading slash at the directory that holds the `.gitignore`, readings
of their own that no tool run in a subdirectory asks for.

*Amended 2026-09-30*: **`globAlternatives` gives a pattern's alternatives as
they are read.** spec-brief refuses a rooted alternative, and spec-guard
anchors one, hands each alternative to ripgrep and writes braces again around
them; each expanded the braces and read a leading `./` and `/` again itself,
and each copy fell behind the reading here. spec-guard took a `./` off before
spec-core was asked, which left `./!a` a negation, and both tools read
`.//docs` as rooted once this reading had stopped. `globAlternatives`
expands the braces as `parseGlob` does and gives, for each alternative,
whether it is rooted - by the pattern's own leading `/`, or by its own with
no `./` of the pattern's before it - and its text without the `./` and the
slashes it starts with, each `}` or `,` no group took written as a class of
that one character so that the text reads the same inside braces again; and
whether the pattern itself is rooted. It refuses only what stops it reading
an alternative, in `parseGlob`'s words, and gives one `parseGlob` refuses as
read. What a tool does with a rooted alternative, and what a trailing `/`
means to it, stay the tool's.

## How the differences were found

`tests/pattern/differential.test.ts` runs each tool's matcher, copied
verbatim from its main branch into `tests/pattern/reference/`, beside the
dialect that replaces it, over 400 patterns - generated, and the awkward ones
written by hand - against every path of a small alphabet up to three
segments. Every answer that differs must fall into a named category, or the
test fails and prints it. The categories are the changes below, and nothing
else differs.

## Consequences for each tool

Adopting the core changes what users see, and each tool's changelog says so:

- **spec-graph**: path globs stop folding case on Windows. `**` inside a
  segment becomes an error. An unclosed `[` becomes an error.
- **spec-guard**: the 28-second match is gone. `**` inside a segment, an
  unclosed `[` or `{`, and an extended glob change from literal or regex
  readings to errors, which the directive reports as a
  directive error rather than a rule that silently matches nothing.
- **spec-brief**: a trailing `/**` no longer matches the directory itself, so
  a collision witness is a file. `**` inside a name becomes an error. A literal path's reading is supplied by the
  tree (ADR-0005 there), and protected paths can be subtracted from a scope
  exactly, so "all of `src/` except the schema" can be written.

The regular-expression matcher from spec-graph (its ADR-0017) moves here
unchanged as `compileRegex`, JavaScript's dialect without `u`, held to
`RegExp` by a differential test.
