# Changelog

All notable changes to this library. It is not published; each tool that
copies a module names the spec-core commit in its own changelog.

## Unreleased

### Changed since 119345e

What the tools that copied 119345e see when they copy again.

- `markdown`: a link reference definition cannot interrupt a paragraph, as
  CommonMark has it. `[r]: r.md` on the line under a paragraph's text, a
  lazy continuation line in a block quote or a list item included, is that
  text: it is no longer listed, no reference link is read through it, and
  its brackets are the paragraph's. A definition is still read at the start
  of the document, after a blank line, a heading, a thematic break, code,
  front matter or an HTML block a comment opens, in a block quote opened on
  its line, and under another definition (ADR-0004).
- `markdown`: a definition's label holds no unescaped bracket and at most
  999 characters, as CommonMark's link label does. `[[r]: r.md](z.md)` is a
  link to `z.md` with the text `[r]: r.md`, where it was a definition of
  `r.md](z.md)`, and a label of 1000 characters defines nothing. A label
  with an escaped `]`, `[a\]b]: x`, is now read (ADR-0004).
- `markdown`: a second bracket holding a bracket or more than 999 characters
  is no label, and the bracket before it is read as a shortcut: with `[r]`
  defined, `[r][a[b]c]` gives `r`'s destination and then reads `[b]`, where
  it gave nothing for `[r]` (ADR-0004).

### Changed since 8840d36

What the tools that copied 8840d36 see when they copy again.

- `markdown`: a link inside a link's text is the link, and the brackets
  around it and what follows them are text, as CommonMark reads it:
  `[a [b](inner.md) c](outer.md)` gives `inner.md`, and no longer
  `outer.md`, at any depth and in every bracket form - with `[ref]` defined,
  `[a [ref] c](x.md)` gives the shortcut alone. A link in an image's alt text
  leaves the image an image, and a link may still hold an image (ADR-0004).
- `markdown`: `MarkdownScan.unclosedFrontMatter` gives the kind, line and
  offsets of front matter opened on the first line and never closed, which
  the scan reads as no front matter, so a tool can say so. The rest of the
  document is read as before (ADR-0004).
- `markdown`: `Block.tag` names an HTML block's element, lowercased -
  `script`, `pre`, `style` or `textarea` - and is `null` for code (ADR-0004).
- Both fields are new and every other field is as it was; a caller that
  builds a `Block` or a `MarkdownScan` itself, as a test double might, adds
  them.
- `pattern`: `**` inside a name is refused with advice written from the
  pattern: `docs/**.md` is told `docs/**/*.md` for any depth or `docs/*.md`
  for one level, `src/a**` `src/a*/**` or `src/a*`, where every such pattern
  was told `docs/**/*.md` or `*.md`. The message's first clause is as it was
  (ADR-0003).

### Changed since cbe2223

What the tools that copied cbe2223 see when they copy again.

- `markdown`: an image inside a link's text is read, after the link - a badge
  wrapped in a link, `[![build](badge.svg)](actions)`, gives both
  destinations, where the image went unread (ADR-0004).
- `markdown`: links, list items and the `directives` mask are made the
  first time each is read. A caller reading none of them - spec-guard's
  query - scans 28% faster; every answer is identical (ADR-0004).

### Added

- `path`: repository paths that refuse to leave the repository, POSIX
  arithmetic independent of the host, link destinations.
- `text`: line tables for LF, CRLF and CR; offset-preserving masks.
- `pattern`: globs in three named dialects (`path`, `ripgrep`, `gitignore`)
  compiled to one non-backtracking automaton; `globWitness` (a shortest path
  every scope matches and no protected scope does, or a proof there is none);
  `globCovers`; `parseGlobList` with `!` entries; the regex matcher from
  spec-graph as `compileRegex`. `**` inside a name is refused rather than
  read one of the three ways the tools read it (ADR-0003).
- `markdown`: one pass exact about code and comments per CommonMark, three
  masks, headings, list items, links, tables, front matter.
- `jsonrpc`: MCP over JSON-RPC 2.0 for both protocol eras, with tools,
  resources and prompts, and line framing with cancellation.
- `scripts/vendor.mjs`: copy modules into a tool with a SHA-256 per file, and
  check a tool's copy.
- The mutation gate: `break` at 94, under the first two full sweeps (95.37%
  at cbe2223, 94.89% at 8840d36). Tests pin what the second sweep found
  unpinned - list item columns, the items a marker leaves open, images in a
  link's text, the JSON-RPC error codes and `_meta` keys - and the
  equivalent mutants carry comments (ADR-0007).
