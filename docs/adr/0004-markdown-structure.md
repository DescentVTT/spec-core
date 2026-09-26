---
status: accepted
date: 2026-09-26
---

# ADR-0004: Markdown structure is exact about code and comments, and simple about the rest

## Context

Every tool in the family reads Markdown for the same reason: to find the
structure a person wrote - headings, list items, links, directives - and to
ignore everything that only looks like structure because it sits in a code
sample or a comment. The three scanners agreed on that goal and disagreed on
details, and each detail was a defect somewhere:

- spec-graph read `## Hidden` inside `<!-- -->` as a heading.
- spec-graph read `` `<!--` `` in a code span as the start of a comment and
  masked every link after it until the next `-->`.
- spec-guard opened a fence on ```` ```js`x ```` (CommonMark: not a fence),
  closed one on a line carrying an info string (CommonMark: not a closer), and
  did not see fences indented inside list items, so a directive shown as an
  example there executed.

## Decision

**Follow CommonMark wherever it decides what is code or a comment; stay a
scanner everywhere else.** One pass, offsets throughout, no AST, no rendering.

Exact:

- Fenced code: ``` or ~~~, three or more; an opener at any indentation outside
  indented code (list-nested fences are common); a backtick info string may not
  contain a backtick; a closer is the same character, at least as long, with
  nothing after it but whitespace; an unclosed fence runs to the end.
- Indented code outside lists, after a blank line, never interrupting a
  paragraph.
- `<script>`, `<pre>`, `<style>`, `<textarea>` blocks, whose content is not
  Markdown.
- Code spans and HTML comments resolved **left to right in one pass**:
  whichever opens first wins. A run of backticks opens a span only if a run of
  the same length closes it before the paragraph ends; an escaped backtick
  opens nothing. `<!-->` and `<!--->` are complete comments. An unclosed `<!--`
  at the start of a line runs to the end of the document (an HTML block); one
  in the middle of a line is text.

Deliberately simple: headings (ATX and setext), list items and their extent,
links in six forms, pipe tables, front matter in the flat YAML subset
documents use. None of these needs a full parser to be read correctly in the
documents the family meets, and none is ever read from inside code or a
comment.

**Three masks, one for each question a tool asks**, all preserving every
offset and line terminator:

| Mask | Blanked | Asked by |
| --- | --- | --- |
| `structure` | front matter, code, comments | "is this a heading, an item, a link?" |
| `prose` | front matter, comments | "does this section say anything?" |
| `directives` | front matter, code | "what does `<!-- @assert ... -->` say?" |

## Open questions

- **Slugs.** `slugify` keeps spec-graph's results, which drop `_` where
  GitHub's slugger keeps it. Matching GitHub exactly would change which
  anchors spec-graph resolves; it waits for a release that can say so.
- **Embeds.** `![[x]]` is reported as an image in the wiki form. A tool that
  drops images must keep wiki embeds if it reads them as references.
- **Inline comments.** A comment runs to the next `-->` across blank lines,
  as every scanner here always read it; CommonMark ends an inline comment
  with its paragraph. No document in the family's repositories differs.

## Consequences

Each tool moves to the shared scanner in its own release, with the behaviour
changes above in its changelog. The characterisation tests in
`tests/markdown/` run every old scanner beside the new one and name each
difference as a fix or as a dialect, so no difference arrives unexplained.
