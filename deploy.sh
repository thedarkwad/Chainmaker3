#!/usr/bin/env bash

set -euo pipefail

if [[ -f "$(dirname "$0")/deploy.env" ]]; then
  source "$(dirname "$0")/deploy.env"
fi

SSH_HOST="${DEPLOY_SSH_HOST:?Set DEPLOY_SSH_HOST (e.g. root@1.2.3.4)}"
REMOTE_DIR="${DEPLOY_REMOTE_DIR:-/root/chainmaker}"
SERVICE="${DEPLOY_SERVICE:-chainmaker}"

echo "==> Building..."
npm run build

echo "==> Syncing to ${SSH_HOST}:${REMOTE_DIR}/.output/ ..."
rsync -az --delete --info=progress2 .output/ "${SSH_HOST}:${REMOTE_DIR}/.output/"

echo "==> Restarting ${SERVICE}..."
ssh "${SSH_HOST}" systemctl restart "${SERVICE}"

echo "==> Done."
