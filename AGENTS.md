## Branch and Worktree Naming

Agent-created branches follow `<prefix>/<TASK-ID>-<slug>`, default prefix `pi/`
(for example `pi/PI-026-define-enforce-worktree-branch-naming`); work with no task
uses `pi/wip-<slug>`. Never type the name by hand — derive it:

```shell
node ~/.pi/agent/skills/git-wt/scripts/branch-name.mjs --task PI-026
```

The name is fixed at creation and never renamed afterwards. Operational rules live in
the git-wt skill (`agent/skills/git-wt/SKILL.md`); the full specification is in
`backlog/docs/worktree-branch-naming/`.
