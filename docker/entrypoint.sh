#!/usr/bin/env bash
set -euo pipefail

if [[ -n "${SANDBOX_USER:-}" ]]; then
    sandbox_group="${SANDBOX_GROUP:-agents}"
    sandbox_uid="${SANDBOX_UID:-1000}"
    sandbox_gid="${SANDBOX_GID:-1000}"

    # Create group (ignore if exists)
    groupadd -g "$sandbox_gid" "$sandbox_group" 2>/dev/null || true

    # Create user with home directory (ignore if exists)
    useradd -u "$sandbox_uid" -g "$sandbox_gid" \
        -m -s /bin/bash "$SANDBOX_USER" 2>/dev/null || true

    # Ensure bind-mount points are group-accessible.
    # Uses the sandbox group for shared access without changing host ownership.
    for dir in /data/vault /data/config /data/opencode-data /workspace; do
        if [[ -d "$dir" ]]; then
            chgrp -R "$sandbox_group" "$dir" 2>/dev/null || true
            chmod -R g+rwX "$dir" 2>/dev/null || true
        fi
    done

    # Set HOME for the target user
    export HOME="/home/$SANDBOX_USER"

    # Re-exec as the target user via gosu
    exec gosu "$SANDBOX_USER" "$@"
fi

# No SANDBOX_USER set — run as root (backward-compatible)
exec "$@"
