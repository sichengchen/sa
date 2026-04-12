import type { ProjectsEngineRepository } from "../../projects/src/repository.js";
import { ProjectsRepoService } from "../../workspaces/src/repos.js";
import {
  ProjectsWorktreeService,
  buildBranchName,
  sanitizeWorktreeSegment,
} from "../../workspaces/src/worktrees.js";

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

export {
  ProjectsRepoService,
  ProjectsWorktreeService,
  buildBranchName,
  sanitizeWorktreeSegment,
};
export type { RepoRecord, WorktreeRecord, WorktreeStatus } from "../../workspaces/src/types.js";
