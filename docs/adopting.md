# Adopting the spec-* tools

Start with the smallest set that answers a question you already have. Each
tool is one package with no dependencies; adding the next one later changes
nothing about the first.

| You want to... | Install | Run in CI |
| --- | --- | --- |
| keep code honest to its ADRs | `@descent-vtt/spec-guard` | `npx spec-guard` |
| keep the documents consistent with each other | `@descent-vtt/spec-graph` | `npx spec-graph check` |
| run rounds of work from briefs, some in parallel | `@descent-vtt/spec-brief` | `npx spec-brief lint`, `npx spec-brief matrix` |
| let agents run those rounds inside the lines | all of the above and `@descent-vtt/spec-harness` | the above, plus `spec-harness init --write` once |

Node 22 or later, whatever language the repository is written in.

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

### GitHub Actions

```yaml
- run: npx spec-guard --format github
- run: npx spec-graph check --format sarif > spec-graph.sarif
- run: npx spec-brief lint --format github
- run: npx spec-brief matrix --format github
```

### GitLab CI

```yaml
spec:
  script:
    - npx spec-brief lint --format gitlab > gl-brief.json || true
    - npx spec-graph check --format gitlab > gl-graph.json || true
    - npx spec-brief lint && npx spec-graph check && npx spec-guard
  artifacts:
    reports:
      codequality: [gl-brief.json, gl-graph.json]
```

Every tool exits `0` when clean, `1` when it found something, and `2` when
its answer cannot be trusted - a configuration that did not load, a directory
that does not exist. Treat `2` as a failure of the pipeline, never as a pass.

## When agents write most of the code

The tools check that the work matches the documents. They cannot check that
the documents are right, and in a repository where agents write the code the
documents are files an agent can edit. Four settings close that gap:

1. **Protect the rule files with the forge**, not with the tools: ADRs, the
   tools' configuration files, the brief directory and
   `.github/allowed_signers` go under CODEOWNERS with required review by a
   person.
2. **Check a change against the base branch's rules**, not the ones the
   change carries, so a pull request cannot loosen a rule and break it at
   once:

   ```yaml
   - run: git worktree add ../base "origin/${{ github.base_ref }}"
   - run: npx spec-guard "$PWD/../base/docs/adr/**/*.md"
   ```

3. **Give the agent and the person different identities.** A ruling counts
   only when signed by a key in the base branch's allowed signers; keep the
   agent's account away from that key, or use a FIDO2 key whose signature
   needs a touch.
4. **Keep the two human gates**: a person approves each brief before its round
   starts - its scope and what it protects - and approves the archive when it
   ends. Everything between is the agent's, and every step of it is checked.

## What the tools do not do

- Decide whether the code is correct. That is the tests' job; the tools check
  that the code keeps the promises the documents make.
- Decide whether a brief asks for the right thing. That is the person's.
- Catch two rounds that touch different files and still conflict in meaning.
- Stop an agent that writes files through a shell. The hooks are guardrails;
  the audit and the archive, run on commits, are the gates.
