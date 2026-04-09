# Automation Runtime

Automation is a first-class Aria subsystem. It shares the same runtime, prompt engine, tool runtime, and interaction protocol as operator-initiated work.

## Supported Triggers

- scheduled tasks
- event-driven tasks
- webhook-triggered tasks
- future protocol-native events emitted by other Aria surfaces

## Automation Contract

Each automation declares:

- trigger definition
- task prompt or task template
- session scope
- allowed toolsets
- optional skill injection
- delivery targets
- retry policy
- operator visibility settings

## Execution Model

1. A trigger creates a durable task run.
2. The runtime resolves session scope or creates an automation-scoped session.
3. The prompt engine applies automation overlays and scoped tool policies.
4. The tool runtime executes under the automation's capability envelope.
5. Results, summaries, retries, and deliveries are persisted.
6. Operators can inspect, pause, rerun, cancel, or mute the automation from any frontend surface.

## Current Runtime Behavior

- Cron and webhook tasks can declare retry policy with `maxAttempts` and `delaySeconds`.
- Each attempt gets its own durable automation run record.
- The final attempt records delivery target, delivery status, and delivery error.
- Operator surfaces can inspect retries and delivery history through the shared automation queries.

## Operator Experience

Automation results surface as inbox-style runtime items rather than hidden log files. Operators can inspect:

- recent runs
- current status
- last success or failure
- retries
- next scheduled execution
- delivery history

Automation should feel native to Aria, not like a bolt-on cron wrapper.
