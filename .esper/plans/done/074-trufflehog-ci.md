---
id: 74
title: TruffleHog secret scanning in CI
status: done
type: feature
priority: 2
phase: 006-full-stack-polish
branch: feature/006-full-stack-polish
created: 2026-02-22
shipped_at: 2026-02-22
pr: https://github.com/sichengchen/sa/pull/12
---
# TruffleHog secret scanning in CI

## Context
Phase 5 completed a security audit (plans 058-060) covering secrets encryption, tRPC auth, and exec sandboxing. However, there's no automated secret scanning in CI to catch accidentally committed credentials, API keys, or tokens. TruffleHog is an open-source secret scanner that detects high-entropy strings, known credential patterns, and verified secrets.

SA's CI is GitHub Actions (`.github/workflows/ci.yml`). The repo handles sensitive material: API keys in `secrets.enc`, bot tokens, webhook secrets. A pre-commit or CI check prevents leaks before they reach the remote.

## Approach

### 1. Add TruffleHog to CI workflow
Add a step to `.github/workflows/ci.yml`:

```yaml
- name: Secret scan
  uses: trufflesecurity/trufflehog@main
  with:
    extra_args: --only-verified --results=json
```

Or use the CLI directly:
```yaml
- name: Install TruffleHog
  run: curl -sSfL https://raw.githubusercontent.com/trufflesecurity/trufflehog/main/scripts/install.sh | sh -s -- -b /usr/local/bin

- name: Scan for secrets
  run: trufflehog git file://. --only-verified --fail
```

### 2. Configure scan scope
- Scan the full git history (`git` scanner mode) on the default branch
- On PRs, scan only the diff (`--since-commit` with the base branch merge-base)
- Use `--only-verified` to reduce false positives (TruffleHog verifies secrets against real APIs)
- Add `--fail` flag to exit non-zero on findings (blocks the PR)

### 3. Add `.trufflehog-ignore` if needed
If there are known false positives (e.g., test fixtures with fake keys, example configs), create a `.trufflehog-ignore` file to suppress them.

### 4. Optional: pre-commit hook
Add TruffleHog as a pre-commit hook for local development:
```yaml
# .pre-commit-config.yaml
repos:
  - repo: https://github.com/trufflesecurity/trufflehog
    rev: main
    hooks:
      - id: trufflehog
        entry: trufflehog git file://. --since-commit HEAD --only-verified --fail
```

## Files to change
- `.github/workflows/ci.yml` (modify — add TruffleHog secret scanning step)
- `.trufflehog-ignore` (create if needed — false positive suppressions)

## Verification
- Run: CI pipeline on a PR
- Expected: TruffleHog step passes (no verified secrets in codebase)
- Negative test: Temporarily add a known test key pattern, verify TruffleHog catches it
- Edge cases: Large repo history (use `--max-depth` if scan is too slow); `.trufflehog-ignore` properly suppresses known false positives

## Progress
- Added `secret-scan` job to `.github/workflows/ci.yml` — runs as a separate parallel job
- Uses `trufflesecurity/trufflehog@main` action with `--only-verified --fail`
- fetch-depth: 0 for full git history scanning
- No `.trufflehog-ignore` needed (no known false positives)
- Modified: .github/workflows/ci.yml
- Verification: CI workflow syntax valid; will be tested when PR is opened
