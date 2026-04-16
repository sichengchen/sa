export const PROJECTS_ENGINE_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS projects_projects (
  project_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS projects_servers (
  server_id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  primary_base_url TEXT,
  secondary_base_url TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS projects_workspaces (
  workspace_id TEXT PRIMARY KEY,
  host TEXT NOT NULL,
  server_id TEXT,
  label TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (server_id) REFERENCES projects_servers(server_id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS projects_environments (
  environment_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  label TEXT NOT NULL,
  mode TEXT NOT NULL,
  kind TEXT NOT NULL,
  locator TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES projects_workspaces(workspace_id) ON DELETE CASCADE,
  FOREIGN KEY (project_id) REFERENCES projects_projects(project_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS projects_repos (
  repo_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  name TEXT NOT NULL,
  remote_url TEXT NOT NULL,
  default_branch TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects_projects(project_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS projects_tasks (
  task_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  repo_id TEXT,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects_projects(project_id) ON DELETE CASCADE,
  FOREIGN KEY (repo_id) REFERENCES projects_repos(repo_id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS projects_threads (
  thread_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  task_id TEXT,
  repo_id TEXT,
  title TEXT NOT NULL,
  status TEXT NOT NULL,
  thread_type TEXT,
  workspace_id TEXT,
  environment_id TEXT,
  environment_binding_id TEXT,
  agent_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects_projects(project_id) ON DELETE CASCADE,
  FOREIGN KEY (task_id) REFERENCES projects_tasks(task_id) ON DELETE SET NULL,
  FOREIGN KEY (repo_id) REFERENCES projects_repos(repo_id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS projects_jobs (
  job_id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  author TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (thread_id) REFERENCES projects_threads(thread_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS projects_thread_environment_bindings (
  binding_id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  environment_id TEXT NOT NULL,
  attached_at INTEGER NOT NULL,
  detached_at INTEGER,
  is_active INTEGER NOT NULL,
  reason TEXT,
  FOREIGN KEY (thread_id) REFERENCES projects_threads(thread_id) ON DELETE CASCADE,
  FOREIGN KEY (project_id) REFERENCES projects_projects(project_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS projects_dispatches (
  dispatch_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  task_id TEXT,
  thread_id TEXT NOT NULL,
  job_id TEXT,
  repo_id TEXT,
  worktree_id TEXT,
  status TEXT NOT NULL,
  requested_backend TEXT,
  requested_model TEXT,
  execution_session_id TEXT,
  summary TEXT,
  error TEXT,
  created_at INTEGER NOT NULL,
  accepted_at INTEGER,
  completed_at INTEGER,
  FOREIGN KEY (project_id) REFERENCES projects_projects(project_id) ON DELETE CASCADE,
  FOREIGN KEY (task_id) REFERENCES projects_tasks(task_id) ON DELETE SET NULL,
  FOREIGN KEY (thread_id) REFERENCES projects_threads(thread_id) ON DELETE CASCADE,
  FOREIGN KEY (job_id) REFERENCES projects_jobs(job_id) ON DELETE SET NULL,
  FOREIGN KEY (repo_id) REFERENCES projects_repos(repo_id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS projects_worktrees (
  worktree_id TEXT PRIMARY KEY,
  repo_id TEXT NOT NULL,
  thread_id TEXT,
  dispatch_id TEXT,
  path TEXT NOT NULL,
  branch_name TEXT NOT NULL,
  base_ref TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER,
  pruned_at INTEGER,
  FOREIGN KEY (repo_id) REFERENCES projects_repos(repo_id) ON DELETE CASCADE,
  FOREIGN KEY (thread_id) REFERENCES projects_threads(thread_id) ON DELETE SET NULL,
  FOREIGN KEY (dispatch_id) REFERENCES projects_dispatches(dispatch_id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS projects_reviews (
  review_id TEXT PRIMARY KEY,
  dispatch_id TEXT NOT NULL,
  thread_id TEXT NOT NULL,
  review_type TEXT NOT NULL,
  status TEXT NOT NULL,
  summary TEXT,
  artifact_json TEXT,
  created_at INTEGER NOT NULL,
  resolved_at INTEGER,
  FOREIGN KEY (dispatch_id) REFERENCES projects_dispatches(dispatch_id) ON DELETE CASCADE,
  FOREIGN KEY (thread_id) REFERENCES projects_threads(thread_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS projects_publish_runs (
  publish_run_id TEXT PRIMARY KEY,
  dispatch_id TEXT NOT NULL,
  thread_id TEXT NOT NULL,
  repo_id TEXT NOT NULL,
  branch_name TEXT NOT NULL,
  remote_name TEXT NOT NULL,
  status TEXT NOT NULL,
  commit_sha TEXT,
  pr_url TEXT,
  metadata_json TEXT,
  created_at INTEGER NOT NULL,
  completed_at INTEGER,
  FOREIGN KEY (dispatch_id) REFERENCES projects_dispatches(dispatch_id) ON DELETE CASCADE,
  FOREIGN KEY (thread_id) REFERENCES projects_threads(thread_id) ON DELETE CASCADE,
  FOREIGN KEY (repo_id) REFERENCES projects_repos(repo_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS projects_external_refs (
  external_ref_id TEXT PRIMARY KEY,
  owner_type TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  system TEXT NOT NULL,
  external_id TEXT NOT NULL,
  external_key TEXT,
  session_id TEXT,
  metadata_json TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_projects_tasks_project_status
  ON projects_tasks(project_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_projects_threads_project_status
  ON projects_threads(project_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_projects_environments_workspace_project
  ON projects_environments(workspace_id, project_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_projects_thread_bindings_thread_active
  ON projects_thread_environment_bindings(thread_id, is_active, attached_at);
CREATE INDEX IF NOT EXISTS idx_projects_jobs_thread_created
  ON projects_jobs(thread_id, created_at);
CREATE INDEX IF NOT EXISTS idx_projects_dispatches_thread_status
  ON projects_dispatches(thread_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_projects_worktrees_repo_status
  ON projects_worktrees(repo_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_projects_external_refs_lookup
  ON projects_external_refs(system, external_id, external_key);
`;
