#!/bin/sh
# Run the server under Litestream when a Blob container is configured, otherwise on its own (local Docker,
# or a host with a persistent volume at /data).
set -e
SERVER="node --disable-warning=ExperimentalWarning src/index.ts"
if [ -n "$LITESTREAM_CONTAINER" ]; then
  exec litestream replicate -exec "$SERVER"
fi
exec $SERVER
