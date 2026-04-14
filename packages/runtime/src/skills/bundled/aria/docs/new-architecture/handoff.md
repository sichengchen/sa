# Handoff

This page defines the durable submission boundary between local or runtime-originated work and `Projects Control` tracked work.

## Role

Handoff accepts idempotent submissions and can materialize them into:

- thread records
- job records
- queued dispatch records

## Requirements

- idempotency key
- project-scoped association
- durable linkage from handoff to created dispatch
- safe re-read and re-processing of pending submissions

## Boundary

Handoff exists so Aria-managed intent and project-worker execution stay explicit.

- `Aria Agent` can decide to create work
- `Projects Control` owns the tracked project thread and environment attachment
- coding-agent execution still happens through local or remote project execution paths

## Current Repo Note

The current CLI surfaces are still `aria projects handoff-submit` and `aria projects handoff-process`. This page is the target-state contract for keeping that boundary durable and explicit.
