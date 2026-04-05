/**
 * Read a frontmatter value from file content.
 * Parses the YAML block between the first pair of `---` delimiters.
 * Returns the value of `key`, or `defaultValue` if absent.
 * Strips surrounding single/double quotes from the value.
 */
export function fmRead(
  content: string,
  key: string,
  defaultValue = "",
): string {
  const lines = content.split("\n");

  // First line must be ---
  if (lines[0]?.trim() !== "---") return defaultValue;

  // Find the closing ---
  let endIndex = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i]?.trim() === "---") {
      endIndex = i;
      break;
    }
  }

  if (endIndex === -1) return defaultValue;

  // Search within frontmatter block for the key
  const keyPrefix = `${key}:`;
  for (let i = 1; i < endIndex; i++) {
    const line = lines[i];
    if (line !== undefined && line.startsWith(keyPrefix)) {
      // Strip the key: prefix and any leading whitespace
      let value = line.slice(keyPrefix.length).trimStart();
      // Strip surrounding single or double quotes
      if (
        (value.startsWith("'") && value.endsWith("'")) ||
        (value.startsWith('"') && value.endsWith('"'))
      ) {
        value = value.slice(1, -1);
      }
      return value;
    }
  }

  return defaultValue;
}

/**
 * Return new file content with the first occurrence of `key: ...`
 * inside the frontmatter replaced by `key: value`.
 * If the key does not exist in the frontmatter, returns content unchanged.
 */
export function fmWrite(content: string, key: string, value: string): string {
  const lines = content.split("\n");

  // First line must be ---
  if (lines[0]?.trim() !== "---") return content;

  // Find the closing ---
  let endIndex = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i]?.trim() === "---") {
      endIndex = i;
      break;
    }
  }

  if (endIndex === -1) return content;

  // Find and replace the FIRST matching key line within the frontmatter block
  const keyPrefix = `${key}:`;
  for (let i = 1; i < endIndex; i++) {
    const line = lines[i];
    if (line !== undefined && line.startsWith(keyPrefix)) {
      const newLines = [...lines];
      newLines[i] = `${key}: ${value}`;
      return newLines.join("\n");
    }
  }

  // Key not found in frontmatter — return unchanged
  return content;
}
