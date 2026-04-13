import { describe, expect, test } from "bun:test";

import {
  createEngineEventEnvelope,
  createEventCorrelationIdentity,
  hasLocalProjectEventIdentity,
  hasRemoteProjectEventIdentity,
  hasServerHostedEventIdentity,
} from "@aria/protocol";

describe("protocol event identity", () => {
  test("normalizes server-hosted event identity fields", () => {
    const identity = createEventCorrelationIdentity({
      serverId: " home-server ",
      threadId: "thread-1",
      sessionId: "session-1",
      runId: "run-1",
      agentId: "aria-agent",
      actorId: "operator-1",
    });

    expect(identity).toEqual({
      serverId: "home-server",
      threadId: "thread-1",
      sessionId: "session-1",
      runId: "run-1",
      agentId: "aria-agent",
      actorId: "operator-1",
    });
    expect(hasServerHostedEventIdentity(identity)).toBe(true);
    expect(hasRemoteProjectEventIdentity(identity)).toBe(false);
    expect(hasLocalProjectEventIdentity(identity)).toBe(false);
  });

  test("distinguishes remote and local project execution identities", () => {
    const remoteProjectIdentity = createEventCorrelationIdentity({
      serverId: "home-server",
      workspaceId: "workspace-1",
      projectId: "project-1",
      environmentId: "env-remote",
      threadId: "thread-2",
      jobId: "job-1",
      runId: "run-2",
      agentId: "codex",
    });
    const localProjectIdentity = createEventCorrelationIdentity({
      projectId: "project-1",
      environmentId: "env-local",
      threadId: "thread-2",
      runId: "run-3",
      agentId: "codex",
    });

    expect(hasRemoteProjectEventIdentity(remoteProjectIdentity)).toBe(true);
    expect(hasServerHostedEventIdentity(remoteProjectIdentity)).toBe(false);
    expect(hasLocalProjectEventIdentity(localProjectIdentity)).toBe(true);
    expect(hasRemoteProjectEventIdentity(localProjectIdentity)).toBe(false);
  });

  test("creates protocol-owned event envelopes with normalized identity defaults", () => {
    const event = createEngineEventEnvelope(
      {
        type: "text_delta",
        delta: "hello",
      },
      {
        sessionId: " session-1 ",
        connectorType: "engine",
        source: "chat.stream",
        session: {
          id: "thread-1",
          connectorId: "operator-1",
          connectorType: "engine",
        },
        serverId: " home-server ",
        defaultAgentId: "aria-agent",
        timestamp: 123,
      },
    );

    expect(event).toMatchObject({
      type: "text_delta",
      delta: "hello",
      serverId: "home-server",
      threadId: "thread-1",
      sessionId: "session-1",
      connectorType: "engine",
      source: "chat.stream",
      threadType: "aria",
      agentId: "aria-agent",
      actorId: "operator-1",
      timestamp: 123,
    });
  });

  test("preserves explicit project-thread metadata in protocol-owned envelopes", () => {
    const event = createEngineEventEnvelope(
      {
        type: "tool_start",
        name: "exec",
        id: "tool-1",
      },
      {
        sessionId: "session-2",
        connectorType: "cron",
        source: "automation.run",
        runId: "run-2",
        threadId: "thread-2",
        threadType: "remote_project",
        workspaceId: "workspace-1",
        projectId: "project-1",
        environmentId: "env-1",
        environmentBindingId: "binding-1",
        jobId: "job-1",
        agentId: "codex",
        actorId: "automation:nightly",
        serverId: "server-1",
        timestamp: 456,
      },
    );

    expect(event).toMatchObject({
      type: "tool_start",
      name: "exec",
      id: "tool-1",
      serverId: "server-1",
      workspaceId: "workspace-1",
      projectId: "project-1",
      environmentId: "env-1",
      environmentBindingId: "binding-1",
      threadId: "thread-2",
      sessionId: "session-2",
      runId: "run-2",
      jobId: "job-1",
      connectorType: "cron",
      source: "automation.run",
      threadType: "remote_project",
      agentId: "codex",
      actorId: "automation:nightly",
      timestamp: 456,
    });
  });
});
