# Changelog

All notable changes to this library. It is not published; each tool that
copies a module names the spec-core commit in its own changelog.

## Unreleased

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
