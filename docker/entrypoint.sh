#!/usr/bin/env bash
set -euo pipefail

if [[ -n "${SANDBOX_USER:-}" ]]; then
	sandbox_group="${SANDBOX_GROUP:-agents}"
	sandbox_uid="${SANDBOX_UID:-1000}"
	sandbox_gid="${SANDBOX_GID:-1000}"

	# Ensure the target group and user exist with the correct UID/GID.
	# ubuntu:24.04 ships with 'ubuntu' at 1000:1000 which collides with
	# the default SANDBOX_UID/GID. Without eviction, groupadd/useradd
	# fail silently (|| true) and gosu crashes because the target user
	# was never created.
	#
	# Strategy: evict users before groups (groupdel refuses to remove a
	# group that is any user's primary group). Use usermod/groupmod to
	# fix collisions by name when possible, since the colliding entry
	# may have dependents that block deletion.

	# --- UID collision: different user occupying the target UID ---
	existing_user=$(getent passwd "$sandbox_uid" 2>/dev/null | cut -d: -f1 || true)
	if [[ -n "$existing_user" && "$existing_user" != "$SANDBOX_USER" ]]; then
		userdel -r "$existing_user" 2>/dev/null || true
	fi
	# --- Username collision: right name, wrong UID ---
	existing_uid=$(getent passwd "$SANDBOX_USER" 2>/dev/null | cut -d: -f3 || true)
	if [[ -n "$existing_uid" && "$existing_uid" != "$sandbox_uid" ]]; then
		userdel -r "$SANDBOX_USER" 2>/dev/null || true
	fi

	# --- GID collision: different group occupying the target GID ---
	existing_group=$(getent group "$sandbox_gid" 2>/dev/null | cut -d: -f1 || true)
	if [[ -n "$existing_group" && "$existing_group" != "$sandbox_group" ]]; then
		groupdel "$existing_group" 2>/dev/null || true
	fi
	# --- Group name collision: right name, wrong GID ---
	existing_gid=$(getent group "$sandbox_group" 2>/dev/null | cut -d: -f3 || true)
	if [[ -n "$existing_gid" && "$existing_gid" != "$sandbox_gid" ]]; then
		groupmod -g "$sandbox_gid" "$sandbox_group" 2>/dev/null || true
	fi

	# Create group and user (no-op if already correct)
	groupadd -g "$sandbox_gid" "$sandbox_group" 2>/dev/null || true
	useradd -u "$sandbox_uid" -g "$sandbox_gid" \
		-m -s /bin/bash "$SANDBOX_USER" 2>/dev/null || true

	# Ensure bind-mount points are group-accessible.
	# Only chmod the mount-point itself (not -R) to avoid mutating host
	# file permissions through bind-mounts.
	for dir in /data/vault /data/config /data/opencode-data /workspace; do
		if [[ -d "$dir" ]]; then
			chgrp "$sandbox_group" "$dir" 2>/dev/null || true
			chmod g+rwX "$dir" 2>/dev/null || true
		fi
	done

	# Set HOME for the target user
	export HOME="/home/$SANDBOX_USER"

	# Grant Docker socket access if mounted
	if [[ -S /var/run/docker.sock ]]; then
		docker_gid=$(stat -c '%g' /var/run/docker.sock)
		# Evict collisions (same pattern as sandbox group above)
		existing_docker_group=$(getent group "$docker_gid" 2>/dev/null | cut -d: -f1 || true)
		if [[ -n "$existing_docker_group" && "$existing_docker_group" != "docker" ]]; then
			groupdel "$existing_docker_group" 2>/dev/null || true
		fi
		existing_docker_gid=$(getent group docker 2>/dev/null | cut -d: -f3 || true)
		if [[ -n "$existing_docker_gid" && "$existing_docker_gid" != "$docker_gid" ]]; then
			groupmod -g "$docker_gid" docker 2>/dev/null || true
		fi
		groupadd -g "$docker_gid" docker 2>/dev/null || true
		usermod -aG docker "$SANDBOX_USER" 2>/dev/null || true
	fi
fi

# Bridge /data/config → $HOME/.config/opencode so opencode finds its config.
# Bridge /data/opencode-data → $HOME/.local/share/opencode for state/database.
# Must run after HOME is set (either /home/$SANDBOX_USER or default /root).
#
# AoE may bind-mount its own config sync directory directly onto
# /root/.config/opencode before the entrypoint runs. A bind mount cannot be
# replaced with a symlink, so we detect it and populate the mount with
# symlinks to the individual items in /data/config instead.
bridge_config() {
	local target="$1" source="$2"
	mkdir -p "$(dirname "$target")"
	if mountpoint -q "$target" 2>/dev/null; then
		# Target is a bind mount — symlink each item from source into it.
		# Existing files in the mount (e.g. opencode.json synced by AoE)
		# are left alone; only missing items are linked.
		local prev_nullglob
		prev_nullglob=$(shopt -p nullglob || true)
		shopt -s nullglob
		for item in "$source"/*; do
			local name
			name=$(basename "$item")
			if [[ ! -e "$target/$name" ]]; then
				ln -sfn "$item" "$target/$name"
			fi
		done
		$prev_nullglob
	else
		# No mount — replace with a single directory symlink.
		ln -sfn "$source" "$target"
	fi
}

bridge_config "$HOME/.config/opencode" /data/config
bridge_config "$HOME/.local/share/opencode" /data/opencode-data

# When SANDBOX_USER is set, HOME differs from /root. AoE's docker exec
# runs as root, so also bridge /root paths to ensure opencode works
# regardless of which user invokes it.
if [[ -n "${SANDBOX_USER:-}" ]]; then
	mkdir -p /root/.config /root/.local/share
	bridge_config /root/.config/opencode /data/config
	bridge_config /root/.local/share/opencode /data/opencode-data

	# Ensure the symlink parents are owned by the target user
	chown -R "${SANDBOX_UID}:${SANDBOX_GID}" "$HOME/.config" "$HOME/.local" 2>/dev/null || true

	# Re-exec as the target user via gosu
	exec gosu "$SANDBOX_USER" "$@"
fi

# No SANDBOX_USER set — run as root (backward-compatible)
exec "$@"
