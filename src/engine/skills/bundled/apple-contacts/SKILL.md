---
name: apple-contacts
description: Query macOS Contacts.app via AppleScript. Resolve phone numbers to names, search contacts, and look up contact info.
---
# Apple Contacts

Query macOS Contacts.app via AppleScript to resolve phone numbers to names, look up contact information, and search the address book.

## Quick Lookups

### Search by phone number
```bash
osascript -e 'tell application "Contacts" to get name of every person whose value of phones contains "+1XXXXXXXXXX"'
```

### Search by name
```bash
osascript -e 'tell application "Contacts" to get name of every person whose name contains "John"'
```

### List all contacts
```bash
osascript -e 'tell application "Contacts" to get name of every person'
```

## Full Contact Info

Get comprehensive details for a contact (avoids buggy `first person whose` syntax):

```bash
osascript -e '
tell application "Contacts"
  set matchList to every person whose name contains "John"
  set output to ""
  repeat with p in matchList
    set n to name of p
    set ph to value of phones of p
    set em to value of emails of p
    set output to output & n & ", " & ph & ", " & em & "\n"
  end repeat
  return output
end tell'
```

## Phone Lookup Notes

- Exact string match required — must match the stored format exactly
- `+1XXXXXXXXXX` will match, but `XXXXXXXXXX` without the prefix will not
- Try with `+1` prefix first, then fall back to a name-based search if no match

## Search Parameters

- Name search is case-insensitive
- `contains` for partial matching, `is` for exact matching
- Empty output means no matches (not an error)

## Output Format

Results are comma-separated: name, phones, emails. Multiple contacts return one per line.

## Notes

- macOS only — requires Contacts.app
- First run may prompt for automation permissions in System Settings
- Read-only access via AppleScript
