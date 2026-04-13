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
// Flow-array parsing
// ---------------------------------------------------------------------------

/**
 * Parse a YAML flow-array value like `[a, b, c]` into a string array.
 * Returns `null` if the value is not a flow array (i.e. a plain scalar).
 */
export function parseFlowArray(value: string): string[] | null {
  const trimmed = value.trim();
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) return null;
  const inner = trimmed.slice(1, -1).trim();
  if (inner === "") return [];
  return inner
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s !== "");
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

/** Valid estimate values (t-shirt sizes). */
export const ESTIMATE_VALUES = ["XS", "S", "M", "L", "XL"];

/** Soft vocabulary for task tags — unknown tags produce warnings, not errors. */
export const TAG_VOCABULARY = [
  "ci",
  "bug",
  "feature",
  "enhancement",
  "refactor",
  "docs",
  "tooling",
  "infra",
  "test",
  "security",
  "release",
];

/**
 * Validate a frontmatter key/value pair for a given file path.
 *
 * Validates `status`, `priority`, `estimate`, `tags`, and `repo` keys for files inside `$AGENT_VAULT`.
 * Returns an error message string if invalid, `null` if valid or not applicable.
 */
export function validateFmValue(
  filePath: string,
  key: string,
  value: string,
): string | null {
  // Only validate known keys
  if (!["status", "priority", "estimate", "tags", "repo"].includes(key))
    return null;

  // Read AGENT_VAULT — skip validation if unset or file is outside vault
  const vault = process.env.AGENT_VAULT;
  if (!vault) return null;
  // Ensure exact prefix match with separator guard (avoids /vault-extra matching /vault)
  const vaultPrefix = vault.endsWith("/") ? vault : vault + "/";
  if (!filePath.startsWith(vaultPrefix)) return null;

  const relPath = filePath.slice(vaultPrefix.length);

  if (key === "priority") {
    // Priority validation only applies to task schemas
    if (!relPath.startsWith("tasks/")) return null;
    if (!PRIORITY_VALUES.includes(value)) {
      return `invalid priority '${value}' — valid values: ${PRIORITY_VALUES.join(", ")}`;
    }
    return null;
  }

  if (key === "estimate") {
    // Estimate validation only applies to task schemas
    if (!relPath.startsWith("tasks/")) return null;
    if (!ESTIMATE_VALUES.includes(value)) {
      return `invalid estimate '${value}' — valid values: ${ESTIMATE_VALUES.join(", ")}`;
    }
    return null;
  }

  if (key === "tags") {
    // Tags use soft vocabulary — fm_write never rejects.
    // Lint handles vocabulary warnings.
    return null;
  }

  if (key === "repo") {
    const repoPattern = /^[^/\s]+\/[^/\s]+$/;
    const arr = parseFlowArray(value);
    if (arr !== null) {
      for (const elem of arr) {
        if (!repoPattern.test(elem)) {
          return `invalid repo element '${elem}' — expected 'owner/repo' format`;
        }
      }
      return null;
    }
    // Scalar — validate format
    if (!repoPattern.test(value)) {
      return `invalid repo '${value}' — expected 'owner/repo' format`;
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
