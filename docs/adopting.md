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

Run each tool from the project's install, `npx --no-install spec-guard`.
Without `--no-install`, `npx` fetches a package from the registry when none is
installed, and the unscoped name `spec-guard` belongs to a different package.

The words these pages use - brief, round, wave, ruling, base - are defined in
[concepts](concepts.md), and the [tutorial](tutorial.md) runs the whole loop
on a small repository, with the output of every step.

## The whole loop, once

```bash
npm install --save-dev @descent-vtt/spec-brief @descent-vtt/spec-guard @descent-vtt/spec-graph @descent-vtt/spec-harness
npx spec-harness init            # read the plan
npx spec-harness init --write    # apply it
```

`init` makes the tools agree from the first day: spec-brief's brief and
archive directories, spec-graph reading the archive as history (an archived
brief is a record, not a retired decision), the base branch rounds are
measured from, the Claude Code hooks and MCP server. It merges into files you
have and changes nothing until `--write`.

## CI

Every tool exits `0` when clean, `1` when it found something, and `2` when
its answer cannot be trusted - a configuration that did not load, a directory
that does not exist. Treat `2` as a failure of the pipeline, never as a pass.

Each tool writes its findings in the forge's own format:

| Command | GitHub | GitLab |
| --- | --- | --- |
| `spec-guard` | `--format github`: annotations, no upload | `--format gitlab` |
| `spec-graph check` | `--format sarif`, uploaded to code scanning | `--format gitlab` |
| `spec-brief lint`, `spec-brief matrix` | `--format github` | `--format gitlab` |
| `spec-harness premises` | its exit code and log | its exit code and log |

`spec-harness premises` names the round's brief from the branch, as every
spec-harness command does, and a CI checkout is usually on no branch: without
one, a round's own merge request reports the premise it set out to retire as
stale. Each job below checks out the branch by name first.

### GitHub Actions

```yaml
name: specs
on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read
  security-events: write # the SARIF upload

jobs:
  specs:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v6
        with:
          node-version: '24'
          cache: npm
      - run: npm ci
      - run: git checkout -q -B "${GITHUB_HEAD_REF:-$GITHUB_REF_NAME}"
      - run: npx --no-install spec-guard --format github
      - if: ${{ !cancelled() }}
        run: npx --no-install spec-brief lint --format github
      - if: ${{ !cancelled() }}
        run: npx --no-install spec-brief matrix --format github
      - if: ${{ !cancelled() }}
        run: npx --no-install spec-harness premises
      - if: ${{ !cancelled() }}
        run: npx --no-install spec-graph check --format sarif > spec-graph.sarif
      - if: ${{ !cancelled() }}
        uses: github/codeql-action/upload-sarif@v4
        with:
          sarif_file: spec-graph.sarif
          category: spec-graph
```

- A step stops the job when it fails; `if: ${{ !cancelled() }}` runs every
  check once whatever failed before it, and the job still fails if any did.
- `--format github` writes workflow commands, which annotate the pull request
  from the job's log. spec-graph writes no `github` format, so its SARIF goes
  to code scanning through `upload-sarif@v4` (v3 is deprecated in December
  2026). Code scanning takes an upload in a public repository, and in a
  private one where GitHub Code Security is enabled; a private repository's
  workflow also needs `actions: read`. Without code scanning, write
  `npx --no-install spec-graph check --format markdown >> "$GITHUB_STEP_SUMMARY"`
  and drop the upload.
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
    - git checkout -q -B "${CI_MERGE_REQUEST_SOURCE_BRANCH_NAME:-$CI_COMMIT_BRANCH}"
    # The job stops at the first command that fails, so every tool runs once,
    # the worst exit code is kept, and the job ends with it.
    - worst=0
    - npx --no-install spec-guard --format gitlab > gl-spec-guard.json || worst=$(( $? > worst ? $? : worst ))
    - npx --no-install spec-graph check --format gitlab > gl-spec-graph.json || worst=$(( $? > worst ? $? : worst ))
    - npx --no-install spec-brief lint --format gitlab > gl-spec-brief-lint.json || worst=$(( $? > worst ? $? : worst ))
    - npx --no-install spec-brief matrix --format gitlab > gl-spec-brief-matrix.json || worst=$(( $? > worst ? $? : worst ))
    - npx --no-install spec-harness premises || worst=$(( $? > worst ? $? : worst ))
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
  (`2`) still fails the pipeline.
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
          npx --no-install spec-guard "$RUNNER_TEMP/base/docs/adr/**/*.md"
```

The fetch uses the credentials `actions/checkout` leaves behind; with
`persist-credentials: false` in a private repository, check out with
`fetch-depth: 0` instead and add the worktree from `"origin/$GITHUB_BASE_REF"`.

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
    - npx --no-install spec-guard "$base/docs/adr/**/*.md"
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
