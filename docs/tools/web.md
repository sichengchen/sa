# Web Tools

Two tools for fetching and searching the web.

---

## web_fetch

Fetch content from a URL with automatic format conversion.

### Parameters

| Parameter | Type   | Required | Default | Description                     |
|-----------|--------|----------|---------|---------------------------------|
| url       | string | yes      | —       | URL to fetch                    |
| maxLength | number | no       | 50000   | Max response length (chars)     |
| headers   | object | no       | {}      | Additional HTTP request headers |

### Content Handling

| Content-Type      | Processing                          |
|-------------------|-------------------------------------|
| HTML              | Converted to Markdown               |
| JSON              | Returned as-is                      |
| Plain text        | Returned as-is                      |
| XML               | Returned as-is                      |

HTML-to-Markdown conversion strips navigation, scripts, styles, and other
non-content elements to produce a clean readable document.

### URL Policy

All URLs are checked against Esperta Aria's SSRF protection before fetching:
- Blocks private/internal IP ranges (127.0.0.0/8, 10.0.0.0/8, 172.16.0.0/12,
  192.168.0.0/16, ::1, fc00::/7)
- Blocks file:// and other non-HTTP(S) schemes
- Follows redirects but re-checks each hop

Full details: `docs/security/url-policy.md`.

---

## web_search

Search the web using Brave Search or Perplexity.

### Parameters

| Parameter | Type   | Required | Default | Description                              |
|-----------|--------|----------|---------|------------------------------------------|
| query     | string | yes      | —       | Search query                             |
| count     | number | no       | 5       | Number of results                        |
| backend   | string | no       | "auto"  | `"brave"`, `"perplexity"`, or `"auto"`   |

### Backend Selection

When `backend` is `"auto"` (default), the engine selects based on configured
API keys:

| Condition                        | Backend selected |
|----------------------------------|------------------|
| `BRAVE_API_KEY` set              | Brave Search     |
| `PERPLEXITY_API_KEY` set         | Perplexity       |
| Both set                         | Brave Search     |
| Neither set                      | Error            |

### Brave Search

Returns structured results with:
- Title, URL, snippet for each result
- Optional news and video results

### Perplexity

Returns a synthesized answer with source citations. The `count` parameter
maps to the number of source references requested.

### Config

API keys are stored in `secrets.enc`:

```
BRAVE_API_KEY=brv_...
PERPLEXITY_API_KEY=pplx-...
```

Set via the `set_env_secret` tool or `aria config`.
