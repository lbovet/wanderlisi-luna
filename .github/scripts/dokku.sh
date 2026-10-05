#!/usr/bin/env bash
set -uo pipefail

DOKKU_COMMAND="${1:?Usage: dokku.sh <command> <app> [arguments...]}"
shift

# Check if command is storage:create (doesn't take app as second arg)
if [ "$DOKKU_COMMAND" = "storage:create" ]; then
  DOKKU_APP=""
else
  DOKKU_APP="${1:?Usage: dokku.sh <command> <app> [arguments...]}"
  shift
fi

if [ -n "$DOKKU_APP" ]; then
  exec ssh -o StrictHostKeyChecking=no "dokku@cloudbox.chee.li" "${DOKKU_COMMAND} ${DOKKU_APP} $@" || true
else
  exec ssh -o StrictHostKeyChecking=no "dokku@cloudbox.chee.li" "${DOKKU_COMMAND} $@" || true
fi
