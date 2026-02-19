---
id: 010
title: Integration and E2E tests
status: pending
type: feature
priority: 7
phase: phase-1
branch: feature/phase-1
created: 2026-02-19
---

# Integration and E2E tests

## Context
After all subsystems are built, we need integration tests that verify the full flow works end-to-end: user sends message → agent processes → tool executes → result returns. This validates that the pieces actually work together, not just in isolation.

## Approach
1. **Agent integration test**:
   - Create an Agent with a mock LLM that returns tool calls
   - Verify: message in → tool called → result appended → final response out
   - Test multi-turn conversation with memory injection
2. **Config + Router integration test**:
   - Create a temp SA_HOME with config files
   - Load config, initialize router, verify model switching works
3. **Tool chain test**:
   - Write a file → Read it back → Edit it → Read again → verify content
   - Bash command that creates a file → Read tool verifies it exists
4. **Memory persistence test**:
   - Save a memory → restart MemoryManager → load → verify memory is there
5. **E2E smoke test**:
   - Full Agent with real tools (in temp directory)
   - Send a message that triggers a tool call
   - Verify the complete round trip

## Files to change
- `tests/integration/agent-flow.test.ts` (create — full agent flow test)
- `tests/integration/config-router.test.ts` (create — config + router integration)
- `tests/integration/tool-chain.test.ts` (create — chained tool operations)
- `tests/integration/memory-persistence.test.ts` (create — memory across restarts)
- `tests/e2e/smoke.test.ts` (create — end-to-end smoke test)

## Verification
- Run: `bun test`
- Expected: all tests pass — unit, integration, and e2e
- Edge cases: test isolation (each test uses its own temp directory), cleanup after tests
