# Sourced before each command in a Claude Code cloud session, after .claude/cloud-setup.sh: puts the
# Node of .nvmrc (and the pnpm installed under it) first on the PATH, and leaves the app on the
# development sign-in, as CI's browser tests run, whatever WorkOS keys the cloud environment holds.
dazbee_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
dazbee_node="$(ls -d /opt/nvm/versions/node/v"$(cat "$dazbee_root/.nvmrc")".*/bin 2>/dev/null | sort -V | tail -1)"
if [ -n "$dazbee_node" ]; then export PATH="$dazbee_node:$PATH"; fi
unset WORKOS_API_KEY WORKOS_CLIENT_ID WORKOS_REDIRECT_URI dazbee_root dazbee_node
