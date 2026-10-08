# Adopting the spec-* tools

Start with the smallest set that answers a question you already have. Each
tool is one package with no dependencies; adding the next one later changes
nothing about the first.

| You want to... | Install | Run in CI |
| --- | --- | --- |
| keep code honest to its ADRs | `@descent-vtt/spec-guard` | `spec-guard` |
| keep the documents consistent with each other | `@descent-vtt/spec-graph` | `spec-graph check` |
| run rounds of work from briefs, some in parallel | `@descent-vtt/spec-brief` | `spec-brief lint`, `spec-brief matrix` |
| let agents run those rounds inside the lines | all of the above and `@descent-vtt/spec-harness` | the above and `spec-harness premises`, plus `spec-harness init --write` once |

Node 22 or later, whatever language the repository is written in. A
repository with no JavaScript of its own, such as a .NET solution, keeps a
`package.json` with `"private": true` and the tools as its only
`devDependencies`, commits the lockfile, and ignores `node_modules/`.

The documents may be written in any language, with the status in English -
`status: accepted` in front matter, or `Accepted` under a `## Status`
heading - which is the one set of status words every tool reads
([ADR-0005](adr/0005-the-family-contract.md#documents-and-state)).

Give `npx` the package's full name, and `--no-install` wherever the project
has installed the tool: `npx --no-install @descent-vtt/spec-guard`. The
command's name alone is not this project's on npm; [Names](#names) has what
that costs and what was measured.

The tools install and run the same under npm 10, 11 and 12. Each is one
package with no dependencies and no install script, so npm 12, which runs a
dependency's install script only where `allowScripts` in `package.json` names
the package, blocks nothing of theirs and asks you to approve nothing. Under
npm 12, `npx` writes two `npm notice run` lines to stderr before a tool
starts; what the tool prints, in every `--format`, is on stdout as before.

The words these pages use - brief, round, wave, ruling, base - are defined in
[concepts](concepts.md), and the [tutorial](tutorial.md) runs the whole loop
on a small repository, with the output of every step.

## The whole loop, once

```bash
npm install --save-dev @descent-vtt/spec-brief @descent-vtt/spec-guard @descent-vtt/spec-graph @descent-vtt/spec-harness
npx --no-install @descent-vtt/spec-harness init            # read the plan
npx --no-install @descent-vtt/spec-harness init --write    # apply it
```

`init` makes the tools agree from the first day: spec-brief's brief and
archive directories, spec-graph reading the archive as history (an archived
brief is a record, not a retired decision), the base branch rounds are
measured from, the Claude Code hooks and MCP server. It merges into files you
have and changes nothing until `--write`.

## Names

Each tool is published under the `@descent-vtt` scope and installs a command
named without it:

| Package: the name to install, and to give `npx` | The command it installs |
| --- | --- |
| `@descent-vtt/spec-brief` | `spec-brief` |
| `@descent-vtt/spec-graph` | `spec-graph` |
| `@descent-vtt/spec-guard` | `spec-guard` |
| `@descent-vtt/spec-harness` | `spec-harness` |

The same names without the scope are not this project. On npm, `spec-harness`
is another publisher's package, and `spec-brief`, `spec-graph`, `spec-guard`
and `spec-core` belonged to nobody on 2026-10-07: whoever registers one
decides what it runs.

That matters because of what `npx` does with a name. Where the project has
the tool installed, it runs that install. Where it has not - a fresh clone, a
linked worktree before `npm ci`, a CI job without the install step - it
fetches the package of that name from the registry and runs it, and without a
terminal, as in CI or under an agent, it does not ask first. So these pages
give `npx` the package's full name, in one of two forms:

- **`npx --no-install @descent-vtt/spec-guard`** in a project that installed
  the tool: in CI, in a script, in what an agent is told to run. It runs the
  project's install, the version the lockfile pins, and where there is none
  it stops with an error that names this package, having fetched nothing.
  Run it from the directory whose `package.json` lists the tools: npm reads
  the install of the nearest `package.json`, or of the workspace root above
  it.
- **`npx @descent-vtt/spec-guard`**, without `--no-install`, where nothing is
  installed: it fetches this package, its latest release, and runs it.

<!-- bare-name: the two forms below are shown as what not to write -->
Never `npx spec-guard`, the command's name alone. And
`npx --no-install spec-guard` is not the fix: measured under npm 10.9.9,
11.20.0 and 12.2.0, `--no-install` stops a download and nothing else. npm
still runs a copy of the bare name's package that an earlier `npx` left in
its cache, and where nothing is installed it asks the registry about the bare
name and reports that package, with its version, as the one that is missing.

If one of the bare names was ever run through `npx` on a machine, in a tree
where the tool was not installed, empty npm's cache of fetched commands
there. It is the `_npx` directory below the path `npm config get cache`
prints; npm 11.20.0 and 12.2.0 list it with `npm cache npx ls` and remove an
entry with `npm cache npx rm <key>`, which npm 10.9.9 does not have. With the
entry gone, `--no-install` in front of the bare name stops again.

A repository can have npm refuse the fetch for every command it runs through
`npx`, the tools' and any other, with one line in an `.npmrc` committed
beside its `package.json`:

```ini
yes=false
```

Measured under npm 10.9.9, 11.20.0 and 12.2.0 with made-up names, and no
terminal attached:

- **What it does.** `npx <name>` and `npm exec <name>` run the project's
  install as before, and where there is none they stop, exit 1, with
  `npx canceled due to missing packages and no YES option` and the package
  they did not fetch, whether or not `CI` is set. `npm init <initializer>`,
  which is `npx create-<initializer>`, stops the same way, and so does
  `npx @descent-vtt/spec-guard` without `--no-install`, until the project
  has installed the tool.
- **Where.** In the directory of that `package.json`, in a plain
  subdirectory of it and in a workspace of it. Not in a directory below it
  that has a `package.json` of its own and is no workspace: npm reads the
  `.npmrc` beside the nearest one, and from there it fetches as if the line
  were not written.
- **What it leaves alone.** `npm install`, `npm ci`, `npm run` and
  `npm pack` do not read the key: in npm's own commands only `npm exec`,
  `npm init` and, where npm has it, `npm trust` do. A script is handed one
  more variable, `npm_config_yes`, empty. npm packs no `.npmrc` into a
  tarball.
- **What undoes it.** `--yes` on the command, and `npm_config_yes=true` in
  the environment, which outranks the file. `--no-install` on the command
  outranks the environment in turn, so the commands on these pages keep it.
- **What it does not do.** Like `--no-install`, it stops a download and
  nothing else: a package an earlier `npx` left in npm's cache of fetched
  commands still runs, exit 0. Empty that cache as above, and npm stops
  again.

A `package.json` script names the command alone - `"specs": "spec-guard"` -
because npm runs a script with the project's `node_modules/.bin` first on the
path and never fetches for it. The hooks and the MCP server that
`spec-harness init` writes go through neither: they run `node` with the path
of the installed file.

## CI

Every tool exits `0` when clean, `1` when it found something, and `2` when
its answer cannot be trusted - a configuration that did not load, an unknown
key, a directory that does not exist, a question it could not decide, an
output its reader closed before all of it was written, or an error the tool
did not expect, which it reports on stderr as `<tool>: unexpected error:`
with its stack ([ADR-0005](adr/0005-the-family-contract.md#runs)). Treat `2`
as a failure of the pipeline, never as a pass.

Each tool writes its findings in the forge's own format:

| Command | GitHub | GitLab |
| --- | --- | --- |
| `spec-guard` | `--format github`: annotations, no upload | `--format gitlab` |
| `spec-graph check` | `--format sarif`, uploaded to code scanning | `--format gitlab` |
| `spec-brief lint`, `spec-brief matrix` | `--format github` | `--format gitlab` |
| `spec-harness premises` | its exit code and log | its exit code and log |

`spec-harness premises` names the round's brief from the branch, as every
spec-harness command does. A CI checkout is usually on no branch, so on a
detached HEAD it reads the branch the forge's CI names:
`GITHUB_HEAD_REF`, `GITHUB_REF_NAME` on a branch push,
`CI_MERGE_REQUEST_SOURCE_BRANCH_NAME` or `CI_COMMIT_BRANCH`
([ADR-0004](https://github.com/DescentVTT/spec-harness/blob/main/docs/adr/0004-the-active-brief-is-named-not-guessed.md)).
The jobs below rely on that and need spec-harness 0.7.0 or later: with 0.6, a
round's own merge request reports the premise it set out to retire as stale.

### GitHub Actions

```yaml
name: specs
on:
  pull_request:
  push:
    branches: [main]

jobs:
  specs:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      security-events: write # the SARIF upload
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          persist-credentials: false
      - uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0
        with:
          node-version: '24'
          cache: npm
      - run: npm ci
      - run: npx --no-install @descent-vtt/spec-guard --format github
      - if: ${{ !cancelled() }}
        run: npx --no-install @descent-vtt/spec-brief lint --format github
      - if: ${{ !cancelled() }}
        run: npx --no-install @descent-vtt/spec-brief matrix --format github
      - if: ${{ !cancelled() }}
        run: npx --no-install @descent-vtt/spec-harness premises
      - if: ${{ !cancelled() }}
        run: npx --no-install @descent-vtt/spec-graph check --format sarif > spec-graph.sarif
      - if: ${{ !cancelled() }}
        uses: github/codeql-action/upload-sarif@2892aa5e19bbd11bc0cff5427e3b750a04d9e3c2 # v4.38.2
        with:
          sarif_file: spec-graph.sarif
          category: spec-graph
```

- The actions are pinned to commits, with the version beside each, because a
  tag can be moved and a commit cannot; Dependabot's `github-actions` updates
  keep pins like these current.
- A step stops the job when it fails; `if: ${{ !cancelled() }}` runs every
  check once whatever failed before it, and the job still fails if any did.
- `--format github` writes workflow commands, which annotate the pull request
  from the job's log. spec-graph writes no `github` format, so its SARIF goes
  to code scanning through `upload-sarif@v4` (v3 is deprecated in December
  2026). Code scanning takes an upload in a public repository, and in a
  private one where GitHub Code Security is enabled; a private repository's
  job also needs `actions: read`. Without code scanning, write
  `npx --no-install @descent-vtt/spec-graph check --format markdown >> "$GITHUB_STEP_SUMMARY"`
  and drop the upload and `security-events: write` with it.
- Node 24 is the Active LTS until 20 October 2026; Node 26 becomes the Active
  LTS on 28 October 2026.

### GitLab CI

```yaml
spec:
  image: node:24
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH
  script:
    - npm ci
    # The job stops at the first command that fails, so every tool runs once,
    # the worst exit code is kept, and the job ends with it.
    - worst=0
    - npx --no-install @descent-vtt/spec-guard --format gitlab > gl-spec-guard.json || worst=$(( $? > worst ? $? : worst ))
    - npx --no-install @descent-vtt/spec-graph check --format gitlab > gl-spec-graph.json || worst=$(( $? > worst ? $? : worst ))
    - npx --no-install @descent-vtt/spec-brief lint --format gitlab > gl-spec-brief-lint.json || worst=$(( $? > worst ? $? : worst ))
    - npx --no-install @descent-vtt/spec-brief matrix --format gitlab > gl-spec-brief-matrix.json || worst=$(( $? > worst ? $? : worst ))
    - npx --no-install @descent-vtt/spec-harness premises || worst=$(( $? > worst ? $? : worst ))
    - exit $worst
  artifacts:
    when: always
    reports:
      codequality:
        - gl-spec-guard.json
        - gl-spec-graph.json
        - gl-spec-brief-lint.json
        - gl-spec-brief-matrix.json
```

- `node:24` is the Active LTS image, and the full one: spec-brief and
  spec-harness read git, which the `-slim` and `-alpine` images do not carry.
- The job ends with the worst code, so `allow_failure: exit_codes: [1]` lets
  findings through while you adopt a tool, and a run that cannot be trusted
  (`2`) still fails the pipeline. It names `1` alone and never `2`: a tool
  that crashes exits `2` since spec-brief 0.6.0, spec-graph 0.13.0,
  spec-guard 0.20.0 and spec-harness 0.11.0, where an earlier release left
  Node's exit `1`, which this setting lets through as findings.
- GitLab combines several Code Quality reports into one. The merge request's
  Code Quality widget is in every tier, Free included, and compares the merge
  request's report with one from the **target branch's** latest pipeline: the
  job runs on the default branch for that, and a merge request into another
  branch needs a pipeline there too. Without a report on the target branch the
  widget shows nothing. Findings in the pipeline view are Premium, and on the
  lines of the diff Ultimate.
- Leave out the lines of a tool you have not installed.

## When agents write most of the code

The tools check that the work matches the documents. They cannot check that
the documents are right, and in a repository where agents write the code the
documents are files an agent can edit. Four settings close that gap.

### 1. Protect the rule files with the forge

The rule files are the ADRs, the tools' configuration files, the brief
directory, the allowed signers file (`.github/allowed_signers` by default,
whatever the forge), and the CI configuration that runs the checks
(`.github/workflows/`, `.gitlab-ci.yml`): a change can otherwise delete the job
that would have failed it. The requirement, on any forge: **nothing reaches the
base branch without a person merging or approving it, and a person reads every
change to a rule file before it does.**

- **GitHub.** Protect the base branch (a branch protection rule or a ruleset):
  require a pull request, require review from code owners, and require the
  `specs` job as a status check, and list a person for the rule files in
  `CODEOWNERS`. A required check that a pull request deletes never reports,
  so the pull request cannot merge. GitHub Free offers code owners and branch
  protection in public repositories; a private repository needs GitHub Pro,
  Team or Enterprise.
- **GitLab Premium and Ultimate.** Code Owners for the rule files, with
  *Require approval from code owners* on the protected base branch.
- **GitLab Free** has neither Code Owners approval nor required approval
  rules: approvals there are optional and do not stop a merge. Protect the
  base branch with *Allowed to push and merge* set to **No one** and *Allowed
  to merge* set to **Maintainers**, give each agent's account the **Developer**
  role, and turn on *Pipelines must succeed* (Settings > Merge requests >
  Merge checks). Every change then reaches the base branch through a merge a
  person makes; Free cannot name who must review which path, so the person
  merging is the reviewer of the rule files. *Pipelines must succeed* names no
  job, and a merge request that removes one from `.gitlab-ci.yml` still has a
  passing pipeline, which is why that file is a rule file here.

### 2. Check a change against the base branch's rules

Run spec-guard with the ADRs as the base branch has them, not as the change
carries them, so a change cannot loosen a rule and break it at once. Both
forges check out only the commit being built, so the job fetches the base
first. Unchanged rules pass as they do in the main job; a rule the change
removed or weakened fails here.

GitHub, a step after `npm ci` in the job above:

```yaml
      - name: Check the change against the base branch's ADRs
        if: ${{ !cancelled() && github.event_name == 'pull_request' }}
        run: |
          git fetch --no-tags --depth=1 origin "$GITHUB_BASE_REF"
          git worktree add --detach "$RUNNER_TEMP/base" FETCH_HEAD
          npx --no-install @descent-vtt/spec-guard "$RUNNER_TEMP/base/docs/adr/**/*.md"
```

The job's checkout keeps no credentials, and a public repository's fetch
needs none. In a private repository, check out with `fetch-depth: 0` instead
and add the worktree from `"origin/$GITHUB_BASE_REF"`.

GitLab, a job of its own in merge request pipelines:

```yaml
spec-base-rules:
  image: node:24
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
  script:
    - npm ci
    - git fetch --depth 1 origin "$CI_MERGE_REQUEST_TARGET_BRANCH_NAME"
    - base="$(mktemp -d)"
    - git worktree add --detach "$base" FETCH_HEAD
    - npx --no-install @descent-vtt/spec-guard "$base/docs/adr/**/*.md"
```

A merge request pipeline fetches only the pipeline's own ref, and a new
project clones 20 commits deep (`GIT_DEPTH`, or *Git shallow clone* in the
project's CI/CD settings), so the target branch is not there until the job
fetches it. `CI_MERGE_REQUEST_TARGET_BRANCH_NAME` names it: the rules the
change will merge under. `CI_MERGE_REQUEST_DIFF_BASE_SHA` is the commit the
merge request's diff starts from, whose rules may be older, and
`CI_MERGE_REQUEST_TARGET_BRANCH_SHA` is set only in merged results pipelines,
a Premium feature.

### 3. Give the agent and the person different identities

A ruling counts only when signed by a key in the base branch's allowed
signers; keep the agent's account away from that key, or use a FIDO2 key
(`ed25519-sk`) whose signature needs a touch. On the forge, the agent works
from an account of its own that can push branches and open merge requests
but not merge them: on GitLab the Developer role, on GitHub an account the
branch protection above holds to pull requests.

### 4. Keep the two human gates

A person approves each brief before its round starts - its scope and what it
protects - and approves the archive when it ends. Everything between is the
agent's, and every step of it is checked.

### Merge settings that keep rulings

A ruling counts while the commit that last changed its row carries the
person's signature ([ADR-0006](https://github.com/DescentVTT/spec-harness/blob/main/docs/adr/0006-a-ruling-is-a-signed-commit.md)).
A merge that rewrites the round's commits drops it: the row then belongs to a
commit the forge made, unsigned or signed with the forge's own key, which no
allowed signers file lists. Rulings verify on the branch before the merge, so
run `spec-harness audit` and `spec-brief archive` there, as the
[tutorial](tutorial.md) does; after the merge they verify on the base branch
only where the merge kept the commits.

| Forge | Keeps the signature | Drops it |
| --- | --- | --- |
| GitHub | *Create a merge commit* | *Squash and merge*: one new commit, signed with GitHub's own key; *Rebase and merge*: new commits, unsigned |
| GitLab | Merge method *Merge commit*; *Fast-forward merge* and *Merge commit with semi-linear history* while the branch needs no rebase | Squashing; a rebase on the server - the *Rebase* button, `/rebase`, *Enable automatic rebase prior to merge* - which removes signatures |

- **GitHub:** in the repository's settings, allow merge commits and turn off
  squash merging and rebase merging. Leave *Require linear history* off in
  the branch protection: it refuses merge commits.
- **GitLab:** Settings > Merge requests: merge method *Merge commit*,
  *Squash commits when merging* set to **Do not allow**, and *Enable automatic
  rebase prior to merge* off.

A rebase on a workstation re-creates the commits too: the ruling counts again
once the person signs the rewritten commit that holds its row.

## What the tools do not do

- Decide whether the code is correct. That is the tests' job; the tools check
  that the code keeps the promises the documents make.
- Decide whether a brief asks for the right thing. That is the person's.
- Catch two rounds that touch different files and still conflict in meaning.
- Stop an agent that writes files through a shell. The hooks are guardrails;
  the audit and the archive, run on commits, are the gates.
