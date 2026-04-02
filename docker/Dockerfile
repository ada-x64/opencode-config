FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive

# Base system packages
RUN apt-get update && apt-get install -y \
    curl \
    ca-certificates \
    git \
    build-essential \
    pkg-config \
    libssl-dev \
    ripgrep \
    fzf \
    sudo \
    && rm -rf /var/lib/apt/lists/*

# yq — install from GitHub releases (Ubuntu 24.04 package is a different tool)
RUN curl -fsSL https://github.com/mikefarah/yq/releases/latest/download/yq_linux_amd64 \
      -o /usr/local/bin/yq \
    && chmod +x /usr/local/bin/yq

# gh CLI (official Debian repo)
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
      -o /usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
      > /etc/apt/sources.list.d/github-cli.list \
    && apt-get update && apt-get install -y gh \
    && rm -rf /var/lib/apt/lists/*

# Node.js LTS (via nodesource)
RUN curl -fsSL https://deb.nodesource.com/setup_lts.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# bun
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:${PATH}"

# Rust (via rustup)
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
ENV PATH="/root/.cargo/bin:${PATH}"

# uv (Python package manager)
RUN curl -LsSf https://astral.sh/uv/install.sh | sh
ENV PATH="/root/.local/bin:${PATH}"

# opencode (latest from GitHub releases)
RUN curl -fsSL https://opencode.ai/install | bash

# Pre-create vault and workspace mount points
RUN mkdir -p /root/obsidian/agent.obs /workspace

WORKDIR /workspace
