# Security

## Supported versions

spec-core is not published on its own: each spec-* tool carries a copy of the
modules it uses, held to spec-core's bytes by hash
([ADR-0001](docs/adr/0001-one-core-copied-by-hash.md)). A vulnerability in
spec-core is therefore a vulnerability in every tool that copies the module,
and it is fixed where those tools are fixed:

| Where | Fixed |
| --- | --- |
| spec-core `main` | yes |
| The latest minor release of each tool on npm (spec-brief, spec-graph, spec-guard, spec-harness) that copies the module | yes, in a patch release that copies the fix |
| Any older minor of a tool | no |

A tool's patch release cannot turn a passing run red under the family's
[versions policy](docs/adr/0009-versions-before-1-0.md). Older minors get no
fixes: to take one, upgrade the tool to its latest minor.

## Reporting a vulnerability

Report it privately, through GitHub: open this repository's **Security** tab
and choose **Report a vulnerability**. If you found it through a tool, reporting
it on that tool's repository is just as good. Say which tool and version you
ran, and include the smallest input that shows the problem - a Markdown file,
a pattern or a front matter block.

Do not open a public issue, pull request or discussion for a vulnerability.
That publishes it before there is a fix.

## What happens next

1. The report is acknowledged.
2. The fix lands on spec-core `main`, and each tool that copies the module
   ships it as a patch of its latest minor, with a GitHub security advisory
   that describes it.
3. You are credited in the advisories and the changelogs, if you want to be.
