import { describe, test, expect } from "bun:test";

describe("clawhub skill", () => {
  test("SkillRegistry loads clawhub skill", async () => {
    const { SkillRegistry } = await import("@aria/engine/skills/index.js");
    const registry = new SkillRegistry();
    await registry.loadAll();

    const content = await registry.getContent("clawhub");
    expect(content).toBeTruthy();
    expect(content).toContain("clawhub search");
    expect(content).toContain("clawhub install");
    expect(content).toContain("--workdir");
  });
});
