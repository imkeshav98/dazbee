#!/usr/bin/env bash
# Sets up a Claude Code cloud session to build and test Dazbee as CI does: Node from .nvmrc with
# pnpm from package.json, Docker running compose's Postgres and storage, and Playwright's
# Chromium. Run it with bash from anywhere in the repo at the start of a session;
# running it again is safe. Afterwards begin each shell with `source .claude/cloud-env.sh`.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

# Commits made in the session carry the owner's name and GitHub address, not the machine's own.
git config user.name "Keshav"
git config user.email "97694772+imkeshav98@users.noreply.github.com"

# The cloud machine has Docker installed with its daemon stopped.
if ! docker info >/dev/null 2>&1; then
  (dockerd >/tmp/dockerd.log 2>&1 &)
  for _ in $(seq 1 30); do
    docker info >/dev/null 2>&1 && break
    sleep 1
  done
fi

# Node 22 is the machine's default; the repo wants .nvmrc's. pnpm goes in under it, because Turbo
# cannot start the machine's own pnpm. nvm's script stops under set -eu, so it runs without them.
set +eu
# shellcheck disable=SC1091
source /opt/nvm/nvm.sh
nvm install "$(cat .nvmrc)" >/dev/null
nvm alias default "$(cat .nvmrc)" >/dev/null
set -eu
npm install -g "$(node -p "require('./package.json').packageManager")" >/dev/null 2>&1

# shellcheck disable=SC1091
source .claude/cloud-env.sh
pnpm install --frozen-lockfile
# Postgres and storage only: off CI the browser tests start their own API and sync server
# (tests/e2e/support/local-servers.ts), and compose's need the node image, whose pulls Docker Hub
# rate-limits for these machines.
docker compose up -d --wait postgres storage
pnpm --filter @dazbee/e2e exec playwright install --with-deps chromium >/dev/null
# The browser tests serve the built web app: build it again after changing the app.
pnpm turbo run build --filter=@dazbee/web >/dev/null
echo "cloud setup done: node $(node -v), pnpm $(pnpm -v), running: $(docker compose ps --format '{{.Service}}' | tr '\n' ' ')"
