import {
  ProjectsRepoService,
  ProjectsWorktreeService,
  buildBranchName,
  sanitizeWorktreeSegment,
  type RepoRecord,
  type WorktreeRecord,
  type WorktreeStatus,
} from "@aria/workspaces";
import type { ProjectsEngineRepository } from "@aria/projects";

export interface DesktopGitBridge {
  readonly repos: ProjectsRepoService;
  readonly worktrees: ProjectsWorktreeService;
}

export function createDesktopGitBridge(repository: ProjectsEngineRepository): DesktopGitBridge {
  return {
    repos: new ProjectsRepoService(repository),
    worktrees: new ProjectsWorktreeService(repository),
  };
}

export { ProjectsRepoService, ProjectsWorktreeService, buildBranchName, sanitizeWorktreeSegment };
export type { RepoRecord, WorktreeRecord, WorktreeStatus };
