# Changelog

All notable changes to this library. It is not published; each tool that
copies a module names the spec-core commit in its own changelog.

## Unreleased

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
