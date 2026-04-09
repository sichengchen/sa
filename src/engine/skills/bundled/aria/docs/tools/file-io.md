# File I/O Tools

Three tools for reading and writing files on the local filesystem.

---

## read

Read file contents. Danger level: **safe**.

### Parameters

| Parameter | Type   | Required | Default | Description                        |
|-----------|--------|----------|---------|------------------------------------|
| file_path | string | yes      | —       | Absolute path to file              |
| offset    | number | no       | 1       | Starting line number (1-based)     |
| limit     | number | no       | —       | Number of lines to read            |

### Behavior

- Returns file content with line numbers prefixed (cat -n format).
- When `offset` and `limit` are omitted, reads the entire file.
- Binary files return an error.
- Non-existent files return an error with the path.

### Notes

- Path must be absolute. Relative paths are rejected.
- No danger approval required — read is a safe, read-only operation.

---

## write

Create or overwrite a file. Danger level: **moderate**.

### Parameters

| Parameter | Type   | Required | Default | Description                        |
|-----------|--------|----------|---------|------------------------------------|
| file_path | string | yes      | —       | Absolute path to file              |
| content   | string | yes      | —       | File content to write              |

### Behavior

- Creates the file if it does not exist.
- Overwrites the file if it already exists.
- **Creates parent directories automatically** if they do not exist.
- Returns confirmation with bytes written.

### Notes

- Path must be absolute.
- Classified as moderate because it mutates the filesystem. In "always"
  approval mode, the user is prompted before execution.

---

## edit

Exact string replacement in a file. Danger level: **moderate**.

### Parameters

| Parameter  | Type   | Required | Description                                    |
|------------|--------|----------|------------------------------------------------|
| file_path  | string | yes      | Absolute path to file                          |
| old_string | string | yes      | Text to find (must appear exactly once)        |
| new_string | string | yes      | Replacement text                               |

### Behavior

- Finds `old_string` in the file and replaces it with `new_string`.
- **Fails if `old_string` is not found** or appears more than once.
- The match is exact (case-sensitive, whitespace-sensitive).
- Returns a diff-style confirmation showing the change.

### Notes

- Path must be absolute.
- The uniqueness constraint ensures edits are unambiguous. If the target
  string appears multiple times, include more surrounding context to make
  it unique.
- Classified as moderate because it mutates file content.
