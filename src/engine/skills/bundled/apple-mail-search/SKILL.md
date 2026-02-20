---
name: apple-mail-search
description: Fast Apple Mail search via SQLite on macOS (~50ms results vs minutes with AppleScript).
---
# Apple Mail Search

Search Apple Mail via direct SQLite queries on the Envelope Index database. Results in ~50ms compared to 8+ minutes with AppleScript.

## Requirements

- macOS with Apple Mail.app
- `sqlite3` binary (pre-installed on macOS)

## Database Location

The Mail SQLite database is at:
```
~/Library/Mail/V*/MailData/Envelope\ Index
```

## Search Commands

### Search by subject
```bash
sqlite3 -header -separator '|' ~/Library/Mail/V*/MailData/Envelope\ Index \
  "SELECT m.ROWID, s.subject, a.address, datetime(m.date_sent + 978307200, 'unixepoch', 'localtime') as date
   FROM messages m
   JOIN subjects s ON m.subject = s.ROWID
   JOIN addresses a ON m.sender = a.ROWID
   WHERE s.subject LIKE '%search term%'
   ORDER BY m.date_sent DESC LIMIT 20"
```

### Search by sender
```bash
sqlite3 -header -separator '|' ~/Library/Mail/V*/MailData/Envelope\ Index \
  "SELECT m.ROWID, s.subject, a.address, datetime(m.date_sent + 978307200, 'unixepoch', 'localtime') as date
   FROM messages m
   JOIN subjects s ON m.subject = s.ROWID
   JOIN addresses a ON m.sender = a.ROWID
   WHERE a.address LIKE '%@example.com%'
   ORDER BY m.date_sent DESC LIMIT 20"
```

### List unread emails
```bash
sqlite3 -header -separator '|' ~/Library/Mail/V*/MailData/Envelope\ Index \
  "SELECT m.ROWID, s.subject, a.address, datetime(m.date_sent + 978307200, 'unixepoch', 'localtime') as date
   FROM messages m
   JOIN subjects s ON m.subject = s.ROWID
   JOIN addresses a ON m.sender = a.ROWID
   WHERE m.read = 0
   ORDER BY m.date_sent DESC LIMIT 20"
```

### Search by date range
```bash
sqlite3 -header -separator '|' ~/Library/Mail/V*/MailData/Envelope\ Index \
  "SELECT m.ROWID, s.subject, a.address, datetime(m.date_sent + 978307200, 'unixepoch', 'localtime') as date
   FROM messages m
   JOIN subjects s ON m.subject = s.ROWID
   JOIN addresses a ON m.sender = a.ROWID
   WHERE m.date_sent > (strftime('%s', '2025-01-01') - 978307200)
   ORDER BY m.date_sent DESC LIMIT 20"
```

### Email statistics
```bash
sqlite3 ~/Library/Mail/V*/MailData/Envelope\ Index \
  "SELECT COUNT(*) as total, SUM(CASE WHEN read = 0 THEN 1 ELSE 0 END) as unread FROM messages"
```

## Output Formats

- Default: pipe-separated with headers
- JSON: Use `-json` flag with sqlite3
- CSV: Use `-csv` flag with sqlite3

## Technical Notes

- Date epoch offset: Apple uses 978307200 (2001-01-01) as base
- Read-only access — cannot modify emails
- Tables: `messages`, `subjects`, `addresses`, `recipients`, `attachments`
- Metadata only — cannot read email body content via SQLite

## Why SQLite?

Spotlight indexing broke after Big Sur removed emlx import. AppleScript iteration takes 8+ minutes for large mailboxes. Direct SQLite queries return in ~50ms.
