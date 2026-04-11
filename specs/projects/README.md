# Projects Specs

## Projects Engine Role

`packages/projects-engine` owns durable tracked work state. Runtime owns live execution; Projects Engine owns why the work exists and what durable records describe it.

## Canonical Records

- `Project`
- `Repo`
- `Task`
- `Thread`
- `Job`
- `Dispatch`
- `Worktree`
- `Review`
- `PublishRun`
- `ExternalRef`

## Dispatch Rule

One project dispatch creates one runtime execution.

The dispatch record is the durable bridge between tracked work and a live `ExecutionSession`.

## Repo and Worktree Lifecycle

Repos are registered per project. Worktrees are durable records describing repo execution contexts and can move through:

- `active`
- `retained`
- `pruned`
- `failed`

Retention and pruning are durable workflow steps, not transient shell state.

## Review and Publish Lifecycle

Reviews and publish runs are first-class tracked workflow records.

- Reviews capture pending, approved, changes-requested, or dismissed states.
- Publish runs capture pending, pushed, PR-created, merged, failed, or cancelled states.

These records must remain queryable after the underlying live execution completes.

## External References

External systems are modeled through `ExternalRef` records. Linear, GitHub, git, and other systems attach through durable refs rather than hard-coded domain fields.

## Handoff

`packages/handoff` is the submission boundary between local/runtime-originated work and tracked Projects work.

Handoff requirements:

- idempotent submission key
- project-scoped validation
- ability to materialize thread, job, and dispatch records
- durable linkage from handoff to created dispatch

## Current Implementation Notes

- Projects Engine now has store/repository layers plus services for dispatch, planning, worktrees, reviews, and publish runs.
- Handoff can now materialize a pending submission into thread/job/dispatch records.
- `aria projects` now supports creation and mutation flows for core tracked-work records in addition to inspection commands.
