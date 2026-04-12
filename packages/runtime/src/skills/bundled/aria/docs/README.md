# Esperta Aria Docs

This tree is organized by reader intent, not by the old code layout.

## Start Here

- Product overview: [product/overview.md](./product/overview.md)
- Getting started as an operator: [operator/getting-started.md](./operator/getting-started.md)
- System map: [architecture/README.md](./architecture/README.md)
- Security model: [security/README.md](./security/README.md)
- Contributing and shipping: [development/README.md](./development/README.md)

## Documentation Map

### Target Architecture

- [new-architecture/README.md](./new-architecture/README.md)
- [new-architecture/overview.md](./new-architecture/overview.md)
- [new-architecture/deployment.md](./new-architecture/deployment.md)
- [new-architecture/relay.md](./new-architecture/relay.md)
- [new-architecture/server.md](./new-architecture/server.md)
- [new-architecture/desktop-and-mobile.md](./new-architecture/desktop-and-mobile.md)
- [new-architecture/tech-decisions.md](./new-architecture/tech-decisions.md)
- [new-architecture/domain-model.md](./new-architecture/domain-model.md)
- [new-architecture/packages.md](./new-architecture/packages.md)

### Product

- [product/README.md](./product/README.md)
- [product/overview.md](./product/overview.md)
- [product/areas.md](./product/areas.md)
- [product/glossary.md](./product/glossary.md)

### Architecture

- [architecture/README.md](./architecture/README.md)
- [architecture/monorepo.md](./architecture/monorepo.md)
- [architecture/runtime.md](./architecture/runtime.md)
- [architecture/storage-and-recovery.md](./architecture/storage-and-recovery.md)
- [architecture/prompt-engine.md](./architecture/prompt-engine.md)
- [architecture/tool-runtime.md](./architecture/tool-runtime.md)
- [architecture/projects-engine.md](./architecture/projects-engine.md)
- [architecture/relay.md](./architecture/relay.md)
- [architecture/handoff.md](./architecture/handoff.md)
- [architecture/providers.md](./architecture/providers.md)
- [architecture/interaction-protocol.md](./architecture/interaction-protocol.md)

### Operator Guides

- [operator/README.md](./operator/README.md)
- [operator/getting-started.md](./operator/getting-started.md)
- [operator/cli.md](./operator/cli.md)
- [operator/configuration.md](./operator/configuration.md)
- [operator/automation.md](./operator/automation.md)
- [operator/sessions.md](./operator/sessions.md)
- [operator/projects.md](./operator/projects.md)
- [operator/relay.md](./operator/relay.md)
- [operator/skills.md](./operator/skills.md)
- [operator/subagents.md](./operator/subagents.md)

### Security

- [security/README.md](./security/README.md)
- [security/auth.md](./security/auth.md)
- [security/approval-flow.md](./security/approval-flow.md)
- [security/content-framing.md](./security/content-framing.md)
- [security/exec-classifier.md](./security/exec-classifier.md)
- [security/exec-fence.md](./security/exec-fence.md)
- [security/sandbox.md](./security/sandbox.md)
- [security/secrets-vault.md](./security/secrets-vault.md)
- [security/security-modes.md](./security/security-modes.md)
- [security/url-policy.md](./security/url-policy.md)
- [security/audit-log.md](./security/audit-log.md)

### Reference

- [reference/README.md](./reference/README.md)
- [reference/tools/README.md](./reference/tools/README.md)

### Development

- [development/README.md](./development/README.md)
- [development/setup.md](./development/setup.md)
- [development/testing.md](./development/testing.md)
- [development/release.md](./development/release.md)
- [development/migration.md](./development/migration.md)
- [development/package-extraction-ledger.md](./development/package-extraction-ledger.md)
- [development/phase-2-extraction-ledger.md](./development/phase-2-extraction-ledger.md)
- [development/phase-4-server-package-seams-ledger.md](./development/phase-4-server-package-seams-ledger.md)
- [development/phase-5-server-app-seam-ledger.md](./development/phase-5-server-app-seam-ledger.md)
- [development/phase-6-client-app-seams-ledger.md](./development/phase-6-client-app-seams-ledger.md)

## Documentation Rule

When behavior changes, update the most specific page in this tree in the same change. Product and architecture pages define the model; operator pages describe workflows; development pages describe how the repo is built and maintained.
