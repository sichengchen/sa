import { describe, expect, test } from "bun:test";

import {
  THREAD_TYPES,
  describeThreadType,
  resolveThreadType,
} from "@aria/projects";
import { ThreadTypeSchema } from "@aria/protocol";

describe("new architecture domain model", () => {
  test("project and protocol surfaces share the same explicit thread-type model", () => {
    expect(THREAD_TYPES).toEqual([
      "aria",
      "connector",
      "automation",
      "remote_project",
      "local_project",
    ]);

    expect([...ThreadTypeSchema.options]).toEqual([...THREAD_TYPES]);
    expect(resolveThreadType({ threadType: "aria" })).toBe("aria");
    expect(resolveThreadType({ threadType: null })).toBe("remote_project");
    expect(describeThreadType("local_project")).toBe("Local Project");
  });
});
