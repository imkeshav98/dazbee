#!/usr/bin/env bash
# Sets up a Claude Code cloud session to build and test Dazbee as CI does: Node from .nvmrc with
# pnpm from package.json, Docker running the compose stack (Postgres, storage, API, sync), and
# Playwright's Chromium. Run it with bash from anywhere in the repo at the start of a session;
# running it again is safe. Afterwards begin each shell with `source .claude/cloud-env.sh`.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

# The cloud machine has Docker installed with its daemon stopped.
if ! docker info >/dev/null 2>&1; then
  (dockerd >/tmp/dockerd.log 2>&1 &)
  for _ in $(seq 1 30); do
    docker info >/dev/null 2>&1 && break
    sleep 1
  done
fi

# Node 22 is the machine's default; the repo wants .nvmrc's. pnpm goes in under it, because Turbo
# cannot start the machine's own pnpm.
# shellcheck disable=SC1091
source /opt/nvm/nvm.sh
nvm install "$(cat .nvmrc)" >/dev/null
npm install -g "$(node -p "require('./package.json').packageManager")" >/dev/null 2>&1

# shellcheck disable=SC1091
source .claude/cloud-env.sh
pnpm install --frozen-lockfile
docker compose up -d --wait
pnpm --filter @dazbee/e2e exec playwright install --with-deps chromium >/dev/null
echo "cloud setup done: node $(node -v), pnpm $(pnpm -v), running: $(docker compose ps --format '{{.Service}}' | tr '\n' ' ')"
