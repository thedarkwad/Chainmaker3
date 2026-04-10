#!/bin/bash

set -a
source <(tr -d '\r' < "$(dirname "$0")/.env")
set +a


export HOST=localhost
export PORT=3000
export PATH="/root/.nvm/versions/node/v24.14.1/bin:$PATH"

# Check for updates
git fetch

LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse @{u})

if [ "$LOCAL" != "$REMOTE" ]; then
  echo "Updates found. Pulling and rebuilding..."

  git pull
  npm install
  npm run build
else
  echo "No updates found."
fi

# Start server
exec node "$(dirname "$0")/.output/server/index.mjs"
