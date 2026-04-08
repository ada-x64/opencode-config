---
name: vault-init
description: >
  Initialize or verify the agent vault directory structure.
---

# Vault Init Skill

## When to use

Use this skill at the start of every session. 

## Usage

Use the `vault_init` tool:

```
vault_init()                                   # uses $AGENT_VAULT
vault_init({ vault_path: "/path/to/vault" })   # explicit path
```

## After init

Set the `AGENT_VAULT` environment variable to the vault path if it is not
already set. The init script prints the path at the end.
