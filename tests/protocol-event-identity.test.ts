import { describe, expect, test } from "bun:test";

import {
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
});
