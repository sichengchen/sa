import { describe, expect, test } from "bun:test";

import {
  buildAccessClientTargetRoster,
  buildClientExecutionHierarchySummary,
} from "@aria/access-client";
import { createProjectEnvironmentListItem, createProjectServerRoster } from "@aria/projects/client";

describe("client execution hierarchy seams", () => {
  test("@aria/access-client summarizes server, workspace, and environment hierarchy for clients", () => {
    expect(
      buildClientExecutionHierarchySummary(
        {
          workspaceId: "workspace-home",
          label: "Home Workspace",
          serverId: "server-home",
        },
        {
          environmentId: "environment-sandbox",
          label: "sandbox/pr-128",
          mode: "remote",
          kind: "sandbox",
          locator: "sandbox/pr-128",
        },
        {
          serverId: "server-home",
          label: "Home Server",
        },
      ),
    ).toEqual({
      serverId: "server-home",
      serverLabel: "Home Server",
      workspaceId: "workspace-home",
      workspaceLabel: "Home Workspace",
      environmentId: "environment-sandbox",
      environmentLabel: "sandbox/pr-128",
      environmentMode: "remote",
      environmentKind: "sandbox",
      locator: "sandbox/pr-128",
    });
  });

  test("@aria/projects formats project environment options for shell selectors", () => {
    expect(
      createProjectEnvironmentListItem(
        {
          workspaceId: "workspace-local",
          label: "This Device",
        },
        {
          environmentId: "environment-main",
          label: "main",
          mode: "local",
          kind: "main",
          locator: "main",
        },
      ),
    ).toEqual({
      id: "environment-main",
      label: "main",
      hostLabel: "This Device",
      mode: "local",
      kind: "main",
      locator: "main",
    });
  });

  test("@aria/access-client and @aria/projects keep active server selection stable for clients", () => {
    const roster = buildAccessClientTargetRoster(
      [
        { serverId: "primary", baseUrl: "https://primary.aria.test/" },
        { serverId: "secondary", baseUrl: "https://secondary.aria.test/" },
      ],
      "missing",
    );

    expect(roster.selectedServerId).toBe("primary");
    expect(roster.selectedTarget?.serverId).toBe("primary");
    expect(createProjectServerRoster(roster.targets)).toEqual({
      selectedServerId: "primary",
      items: [
        {
          id: "primary",
          label: "primary",
          connectionLabel: "https://primary.aria.test",
          selectionLabel: "Selected",
          isSelected: true,
        },
        {
          id: "secondary",
          label: "secondary",
          connectionLabel: "https://secondary.aria.test",
          selectionLabel: "Available",
          isSelected: false,
        },
      ],
      selectedItem: {
        id: "primary",
        label: "primary",
        connectionLabel: "https://primary.aria.test",
        selectionLabel: "Selected",
        isSelected: true,
      },
    });
  });
});
