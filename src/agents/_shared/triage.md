1. Write a triage entry to the task directory
2. Send a push notification via the `notify_triage` tool

**Events requiring triage entries:**

{{TRIAGE_EVENTS}}

**Icon selection:** When calling `notify_triage`, pass `{{TRIAGE_ICON}}` as the icon.

## Status String Safety

**All status values written via `fm_write` MUST use the exact emoji-prefixed strings documented below. Never write bare status values like `todo`, `in progress`, `complete`, `pending`, etc.**

- **Task:** `📋 todo` / `🔨 in-progress` / `🔍 in-review` / `✅ complete` / `🚫 closed`
- **Review:** `📋 todo` / `🔨 in-progress` / `✅ complete`
- **Triage:** `⏳ pending` / `✅ addressed` / `🚫 dismissed`
- **Design:** `📝 draft` / `🟢 active` / `✅ complete` / `📦 archived`
- **Draft:** `📝 draft` / `📤 promoted`
- **Audit:** `🔨 in-progress` / `✅ complete`
