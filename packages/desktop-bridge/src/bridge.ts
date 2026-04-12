import { createCodingAgentBackendRegistry } from "../../agents-coding/src/registry.js";
import type { RuntimeBackendAdapter } from "../../agents-coding/src/contracts.js";
import { ProjectsPlanningService } from "../../projects/src/planning.js";
import type { ProjectsEngineRepository } from "../../projects/src/repository.js";
import { createDesktopGitBridge, type DesktopGitBridge } from "../../desktop-git/src/git.js";

export interface DesktopBridgeOptions {
  readonly repository: ProjectsEngineRepository;
  readonly codingAgents?: Map<string, RuntimeBackendAdapter>;
}

export interface DesktopBridge {
  readonly planning: ProjectsPlanningService;
  readonly git: DesktopGitBridge;
  readonly codingAgents: Map<string, RuntimeBackendAdapter>;
}

export function createDesktopBridge(options: DesktopBridgeOptions): DesktopBridge {
  return {
    planning: new ProjectsPlanningService(options.repository),
    git: createDesktopGitBridge(options.repository),
    codingAgents: options.codingAgents ?? createCodingAgentBackendRegistry(),
  };
}

export { createCodingAgentBackendRegistry };
export { createDesktopGitBridge } from "../../desktop-git/src/git.js";
export { ProjectsPlanningService } from "../../projects/src/planning.js";
export type { RuntimeBackendAdapter } from "../../agents-coding/src/contracts.js";
