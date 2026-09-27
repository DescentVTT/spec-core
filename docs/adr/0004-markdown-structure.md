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

- Fenced code: ``` or ~~~, three or more; an opener up to three columns past
  the text of the list item it is in, or past the margin outside a list
  (list-nested fences are common); a backtick info string may not contain a
  backtick; a closer is the same character, at least as long, with nothing
  after it but whitespace; an unclosed fence runs to the end. A fence line
  deeper than that is indented code or a paragraph's text, so a lone one in an
  item's example no longer hides the rest of the document.
- Indented code four columns past the text of the list item it is in, or past
  the margin outside a list, after a blank line, never interrupting a
  paragraph. An item's text starts past its marker and the one to four spaces
  after it; a line left of that after a blank line is outside the item.
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

A link's text is read again for images, which CommonMark renders there: a
badge wrapped in a link, `[![build](badge.svg)](actions)`, has two
destinations, and a tool that rewrites or checks relative paths needs both.
Nothing else is read there. An image whose destination runs past the text's
`]` is not in the text, and an image's own text is alt text, with nothing in
it to follow. *Amended 2026-09-26*: until then the text was skipped, and the
image went unread.

**Links may not contain links**, at any depth, as CommonMark has it: in
`[a [b](inner.md) c](outer.md)` the inner pair is the link, and the brackets
around it and `(outer.md)` are text. The link inside may be of any bracket
form: with `[ref]` defined, `[a [ref] c](x.md)` is text around a shortcut,
and in `[foo [bar](/u)][ref]` the second label, left behind, is read as a
shortcut of its own. An image is not made text by a link in its alt text,
though the brackets around the image are, and a link may hold an image. What
a link or an image has read past its `]` - a destination, a title, a second
label - holds no link, so `[![b][badge]][ci]` stays a link by reference
around an image by reference. A wiki link is not CommonMark's and makes
nothing text. The pairs of a paragraph are read innermost first, as
CommonMark reads them at their `]`, before the paragraph is read for links,
so this costs one more pass over the pairs and no search. *Amended
2026-09-27*: the outer pair was the link and the inner one went unread, on
the view that no document the family meets writes one; a tool reading links
now sees the inner destination and not the outer, and spec-brief no longer
needs to read each link's text again to find it.

**Three masks, one for each question a tool asks**, all preserving every
offset and line terminator:

| Mask | Blanked | Asked by |
| --- | --- | --- |
| `structure` | front matter, code, comments | "is this a heading, an item, a link?" |
| `prose` | front matter, comments | "does this section say anything?" |
| `directives` | front matter, code | "what does `<!-- @assert ... -->` say?" |

**What a caller does not read is not made.** Links, list items and the
`directives` mask are made the first time each is read, and kept; the
`structure` and `prose` masks, headings and tables are made with the scan,
since headings are read from both masks and every tool reads headings.
*Amended 2026-09-26*: all of it was made for every document, and a spec-guard
query, which reads none of the three, spent most of its time on them - 23 ms
a query against the 20 ms spec-guard's ADR-0012 allows. Over the family's own
Markdown, scanning took 28% less for what spec-guard reads and 34% less for
what spec-harness reads, 5% less for spec-graph, which reads everything, with
every answer identical.

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
