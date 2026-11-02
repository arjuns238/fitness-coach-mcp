#!/usr/bin/env bash
# Deploy to Azure Container Apps, reusing an existing resource group, Container Apps environment, registry and
# storage account (names in deploy/azure.env; copy deploy/azure.env.example). Safe to re-run: every step skips
# what already exists, and each run builds and ships a new image.
#
# What it sets up:
#   * a user-assigned identity that can pull from the registry and read/write one Blob container, nothing else
#   * the Container App: one replica at most, scales to zero after COOLDOWN seconds without requests;
#     SQLite on the container's disk, restored from and streamed to Blob by Litestream (deploy/litestream.yml)
#   * a nightly job that saves a plain copy of the database to snapshots/day-DD.db (scripts/snapshot.ts)
#
# The API key is generated on first run and kept in $KEY_FILE, outside the repo. A free USDA FoodData Central key
# (https://fdc.nal.usda.gov/api-key-signup) in $USDA_KEY_FILE is used for label lookups when present; without it
# the app uses USDA's shared DEMO_KEY, which allows only about 10 lookups an hour.
#   ./deploy/azure.sh
set -euo pipefail
cd "$(dirname "$0")/.."
source deploy/azure.env
: "${AZ_RG:?}" "${AZ_ENV:?}" "${AZ_ACR:?}" "${AZ_STORAGE:?}"
APP="${APP:-fitness-coach}"
IDENTITY="${IDENTITY:-$APP}"
CONTAINER="${CONTAINER:-$APP}"          # Blob container for the Litestream replica and the snapshots
JOB="${JOB:-$APP-snapshot}"
USER_TIMEZONE="${USER_TIMEZONE:-America/Chicago}"
COOLDOWN="${COOLDOWN:-900}"             # seconds idle before scaling to zero
SNAPSHOT_CRON="${SNAPSHOT_CRON:-0 9 * * *}"  # UTC
KEY_FILE="${KEY_FILE:-$HOME/.config/fitness-coach/api-key}"
USDA_KEY_FILE="${USDA_KEY_FILE:-$HOME/.config/fitness-coach/usda-key}"
az() { command az "$@" --only-show-errors; }

echo "== identity $IDENTITY"
az identity show -n "$IDENTITY" -g "$AZ_RG" -o none 2>/dev/null || az identity create -n "$IDENTITY" -g "$AZ_RG" -o none
IDENTITY_ID=$(az identity show -n "$IDENTITY" -g "$AZ_RG" --query id -o tsv)
CLIENT_ID=$(az identity show -n "$IDENTITY" -g "$AZ_RG" --query clientId -o tsv)
PRINCIPAL_ID=$(az identity show -n "$IDENTITY" -g "$AZ_RG" --query principalId -o tsv)

echo "== blob container $AZ_STORAGE/$CONTAINER"
az storage container-rm show --storage-account "$AZ_STORAGE" -g "$AZ_RG" -n "$CONTAINER" -o none 2>/dev/null ||
  az storage container-rm create --storage-account "$AZ_STORAGE" -g "$AZ_RG" -n "$CONTAINER" --public-access off -o none

echo "== role assignments (can take a few minutes to apply)"
assign() {
  # Filter by principal id rather than --assignee: a brand-new identity isn't in the directory yet, so that
  # lookup fails.
  local existing
  existing=$(az role assignment list --role "$1" --scope "$2" --query "[?principalId=='$PRINCIPAL_ID'] | length(@)" -o tsv)
  if [ "$existing" = 0 ]; then
    az role assignment create --assignee-object-id "$PRINCIPAL_ID" --assignee-principal-type ServicePrincipal \
      --role "$1" --scope "$2" -o none
  fi
}
STORAGE_ID=$(az storage account show -n "$AZ_STORAGE" -g "$AZ_RG" --query id -o tsv)
assign "Storage Blob Data Contributor" "$STORAGE_ID/blobServices/default/containers/$CONTAINER"
assign AcrPull "$(az acr show -n "$AZ_ACR" --query id -o tsv)"

if [ ! -s "$KEY_FILE" ]; then
  echo "== new API key -> $KEY_FILE"
  mkdir -p "$(dirname "$KEY_FILE")"
  (umask 077 && openssl rand -hex 32 > "$KEY_FILE")
fi

TAG="$(git rev-parse --short HEAD)$(git diff --quiet HEAD || echo -dirty)-$(date -u +%Y%m%d%H%M%S)"
echo "== build $AZ_ACR.azurecr.io/$APP:$TAG (in the cloud, a few minutes)"
az acr build -r "$AZ_ACR" -t "$APP:$TAG" --platform linux/amd64 . -o none
# Run the exact image just built, by digest: a tag can be re-pushed, and every scale-up pulls the image again.
DIGEST=$(az acr repository show -n "$AZ_ACR" --image "$APP:$TAG" --query digest -o tsv)
IMAGE="$AZ_ACR.azurecr.io/$APP@$DIGEST"
echo "   $IMAGE"

ENV_ID=$(az containerapp env show -n "$AZ_ENV" -g "$AZ_RG" --query id -o tsv)
LOCATION=$(az containerapp env show -n "$AZ_ENV" -g "$AZ_RG" --query location -o tsv)
FQDN="$APP.$(az containerapp env show -n "$AZ_ENV" -g "$AZ_RG" --query properties.defaultDomain -o tsv)"
APP_YAML=$(mktemp) JOB_YAML=$(mktemp)
trap 'rm -f "$APP_YAML" "$JOB_YAML"' EXIT

# Shared by the app and the snapshot job.
COMMON="location: $LOCATION
identity:
  type: UserAssigned
  userAssignedIdentities:
    $IDENTITY_ID: {}"
REGISTRY="registries:
      - server: $AZ_ACR.azurecr.io
        identity: $IDENTITY_ID"
# The USDA key, as a secret, only when there is one.
FDC_SECRET="" FDC_ENV=""
if [ -s "$USDA_KEY_FILE" ]; then
  FDC_SECRET="
      - name: fdc-api-key
        value: \"$(tr -d '[:space:]' < "$USDA_KEY_FILE")\""
  FDC_ENV="
          - { name: FDC_API_KEY, secretRef: fdc-api-key }"
  echo "== using the USDA key in $USDA_KEY_FILE"
fi
STORAGE_ENV="- { name: AZURE_CLIENT_ID, value: $CLIENT_ID }
          - { name: LITESTREAM_ACCOUNT, value: $AZ_STORAGE }
          - { name: LITESTREAM_CONTAINER, value: $CONTAINER }"

cat > "$APP_YAML" <<EOF
$COMMON
properties:
  managedEnvironmentId: $ENV_ID
  workloadProfileName: Consumption
  configuration:
    activeRevisionsMode: Single
    ingress:
      external: true
      targetPort: 8080
      transport: auto
      allowInsecure: false
    $REGISTRY
    secrets:
      - name: mcp-api-key
        value: "$(cat "$KEY_FILE")"$FDC_SECRET
  template:
    # Litestream gets up to 30s on shutdown to push the last changes; leave it room.
    terminationGracePeriodSeconds: 60
    containers:
      - name: app
        image: $IMAGE
        resources: { cpu: 0.25, memory: 0.5Gi }
        env:
          - { name: MCP_API_KEY, secretRef: mcp-api-key }$FDC_ENV
          - { name: ALLOWED_HOSTS, value: $FQDN }
          - { name: USER_TIMEZONE, value: $USER_TIMEZONE }
          $STORAGE_ENV
    scale:
      # One replica at most: SQLite has a single writer, and Litestream must be the only one replicating.
      minReplicas: 0
      maxReplicas: 1
      cooldownPeriod: $COOLDOWN
      rules:
        - name: http
          http: { metadata: { concurrentRequests: "50" } }
EOF

echo "== container app $APP"
if az containerapp show -n "$APP" -g "$AZ_RG" -o none 2>/dev/null; then
  az containerapp update -n "$APP" -g "$AZ_RG" --yaml "$APP_YAML" -o none
else
  az containerapp create -n "$APP" -g "$AZ_RG" --yaml "$APP_YAML" -o none
fi

cat > "$JOB_YAML" <<EOF
$COMMON
properties:
  environmentId: $ENV_ID
  workloadProfileName: Consumption
  configuration:
    triggerType: Schedule
    replicaTimeout: 600
    replicaRetryLimit: 1
    scheduleTriggerConfig:
      cronExpression: "$SNAPSHOT_CRON"
      parallelism: 1
      replicaCompletionCount: 1
    $REGISTRY
  template:
    containers:
      - name: snapshot
        image: $IMAGE
        command: [node, --disable-warning=ExperimentalWarning, scripts/snapshot.ts]
        resources: { cpu: 0.25, memory: 0.5Gi }
        env:
          $STORAGE_ENV
EOF

echo "== nightly snapshot job $JOB ($SNAPSHOT_CRON UTC)"
if az containerapp job show -n "$JOB" -g "$AZ_RG" -o none 2>/dev/null; then
  az containerapp job update -n "$JOB" -g "$AZ_RG" --yaml "$JOB_YAML" -o none
else
  az containerapp job create -n "$JOB" -g "$AZ_RG" --yaml "$JOB_YAML" -o none
fi

echo
echo "MCP endpoint: https://$FQDN/mcp"
echo "Dashboard:    https://$FQDN/"
echo "API key:      $KEY_FILE"
