import type { RepoRecord } from "./types.js";
import type { ProjectsEngineRepository } from "../../projects/src/repository.js";

export class ProjectsRepoService {
  constructor(private readonly repository: ProjectsEngineRepository) {}

  registerRepo(repo: RepoRecord): void {
    this.repository.upsertRepo(repo);
  }

  getRepo(repoId: string): RepoRecord | undefined {
    return this.repository.getRepo(repoId);
  }

  listRepos(projectId?: string): RepoRecord[] {
    return this.repository.listRepos(projectId);
  }
}
