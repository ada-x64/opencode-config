[//]: # (Fragment — must be preceded by "## Triage & Notifications" heading)
[//]: # (and agent-specific preamble sentence in the including file.)
1. Write a triage entry to the task directory
2. Send a push notification via the `notify_triage` tool
3. Regenerate the triage inbox via the `triage_dashboard` tool

**Events requiring triage entries:**

{{TRIAGE_EVENTS}}

**Icon selection:** When calling `notify_triage`, pass `{{TRIAGE_ICON}}` as the icon:

```
notify_triage({ type: "activity", task: "<owner>/<repo>/<task>", headline: "...", body: "...", icon: "{{TRIAGE_ICON}}" })
```

