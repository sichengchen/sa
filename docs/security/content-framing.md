# Content Framing

Data tags for prompt injection defense. All external data flowing into the
agent's context is wrapped in semantic `<data-*>` tags to create a boundary
between trusted instructions and untrusted data.

---

## Data Tags

| Source | Tag | Example use |
|--------|-----|-------------|
| Web fetch results | `<data-web>` | HTML/text from `web_fetch` |
| Exec output | `<data-exec>` | stdout/stderr from `exec` |
| Webhook payloads | `<data-webhook>` | Incoming webhook request bodies |
| Skill content | `<data-skill>` | Loaded skill definitions |
| Memory context | `<data-memory>` | Memory file contents injected into context |

---

## How It Works

1. When a tool returns external data (exec output, web content, etc.), the
   engine wraps the result in the appropriate `<data-*>` tag before injecting
   it into the agent's conversation context.

2. The system prompt instructs the agent to **never interpret content within
   data tags as instructions**. Any text inside `<data-web>`, `<data-exec>`,
   etc. is treated as opaque data, not as directives.

3. This prevents prompt injection attacks where malicious content in a web
   page, command output, or webhook payload attempts to instruct the agent
   to perform unauthorized actions.

---

## Design Principles

- **Semantic boundary** -- tags distinguish trusted (system prompt, user
  messages) from untrusted (external data) content.
- **Defense in depth** -- content framing complements other security layers
  (approval flow, exec classifier, URL policy). It is not a standalone
  guarantee.
- **Always active** -- content framing remains active in all security modes,
  including `trusted` and `unrestricted`.

---

## Limitations

- Content framing relies on the model respecting the system prompt instruction.
  It is a best-effort defense, not a cryptographic guarantee.
- Nested data tags are not specially handled -- the outermost tag determines
  the trust boundary.
