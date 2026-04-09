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

// ---------------------------------------------------------------------------
// Validation enums (exported for use by vault_lint)
// ---------------------------------------------------------------------------

/** Valid status values per vault document type (keyed by vault-relative path prefix). */
export const STATUS_ENUMS: Record<string, string[]> = {
  "tasks/": [
    "📋 todo",
    "🔨 in-progress",
    "🔍 in-review",
    "✅ complete",
    "🚫 closed",
  ],
  "audits/": ["🔨 in-progress", "✅ complete"],
  "designs/": ["📝 draft", "🟢 active", "✅ complete", "📦 archived"],
  "drafts/": ["📝 draft", "📤 promoted"],
  "_misc/activity/": ["⏳ pending", "✅ addressed", "🚫 dismissed"],
};

/** Valid status values for review files (paths containing `/reviews/`). */
export const REVIEW_STATUSES = ["📋 todo", "🔨 in-progress", "✅ complete"];

/** Valid priority values (only enforced for `tasks/` paths). */
export const PRIORITY_VALUES = [
  "🔥 critical",
  "🔴 high",
  "🟡 medium",
  "🟢 low",
  "🟣 non-work",
];

/**
 * Validate a frontmatter key/value pair for a given file path.
 *
 * Only validates `status` and `priority` keys for files inside `$AGENT_VAULT`.
 * Returns an error message string if invalid, `null` if valid or not applicable.
 */
export function validateFmValue(
  filePath: string,
  key: string,
  value: string,
): string | null {
  // Only validate status and priority keys
  if (key !== "status" && key !== "priority") return null;

  // Read AGENT_VAULT — skip validation if unset or file is outside vault
  const vault = process.env.AGENT_VAULT;
  if (!vault || !filePath.startsWith(vault)) return null;

  const relPath = filePath.slice(vault.length + 1);

  if (key === "priority") {
    // Priority validation only applies to task schemas
    if (!relPath.startsWith("tasks/")) return null;
    if (!PRIORITY_VALUES.includes(value)) {
      return `invalid priority '${value}' — valid values: ${PRIORITY_VALUES.join(", ")}`;
    }
    return null;
  }

  // key === "status"
  // Review files take precedence — check before prefix matching
  if (relPath.includes("/reviews/")) {
    if (!REVIEW_STATUSES.includes(value)) {
      return `invalid status '${value}' — valid values: ${REVIEW_STATUSES.join(", ")}`;
    }
    return null;
  }

  // Match relPath against STATUS_ENUMS keys — longest prefix first
  const matchedKey = Object.keys(STATUS_ENUMS)
    .filter((prefix) => relPath.startsWith(prefix))
    .sort((a, b) => b.length - a.length)[0];

  if (!matchedKey) return null; // Unknown document type — skip validation

  const validStatuses = STATUS_ENUMS[matchedKey]!;
  if (!validStatuses.includes(value)) {
    return `invalid status '${value}' — valid values: ${validStatuses.join(", ")}`;
  }

  return null;
}
