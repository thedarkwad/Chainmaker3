#!/bin/bash

set -a
source <(tr -d '\r' < "$(dirname "$0")/.env")
set +a


export HOST=localhost
export PORT=3000
export PATH="/root/.nvm/versions/node/v24.14.1/bin:$PATH"

# Start server
exec node "$(dirname "$0")/.output/server/index.mjs"
