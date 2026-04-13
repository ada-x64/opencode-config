## Environment Problem Reporting

When you encounter a missing tool, broken dependency, or misconfigured
environment in the Docker sandbox or host context that could be fixed
with an `opencode-config` codebase change, you SHOULD create a GitHub
issue on `ada-x64/opencode-config` describing the problem.

The issue SHOULD include:

- What tool or dependency was missing or broken
- What you were trying to do when you encountered the problem
- The error message or failure mode observed
- A suggested fix if obvious (e.g., "add `jq` to the Dockerfile")

You SHOULD NOT block on the issue — work around the problem if possible
and continue with your task. The issue is a side-effect, not a blocker.

Do NOT create duplicate issues. Before filing, check whether an open
issue already exists for the same problem:
`gh search issues --repo ada-x64/opencode-config "<tool name>" --state open`
