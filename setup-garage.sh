#!/usr/bin/env bash
set -euo pipefail

# Check if openssl and htpasswd are installed
if ! command -v openssl &> /dev/null; then
    echo "openssl is required but not installed. Please install openssl and try again."
    exit 1
fi
if ! command -v htpasswd &> /dev/null; then
    echo "htpasswd is required but not installed. Please install htpasswd (part of Apache HTTP Server) and try again."
    exit 1
fi

RPC_SECRET=$(openssl rand -hex 32)
ADMIN_TOKEN=$(openssl rand -hex 32)

mkdir -p garage/

# If garage.toml is a folder, remove it
if [ -d garage/garage.toml ]; then
    rm -rf garage/garage.toml
fi

cat <<EOT > garage/garage.toml
metadata_dir = "/var/lib/garage/meta"
data_dir     = "/var/lib/garage/data"
db_engine    = "sqlite"
replication_factor = 1

rpc_bind_addr   = "[::]:3901"
rpc_public_addr = "garage:3901"
rpc_secret      = "$RPC_SECRET"

[s3_api]
s3_region    = "garage"
api_bind_addr = "[::]:3900"

[admin]
api_bind_addr = "[::]:3903"
admin_token   = "$ADMIN_TOKEN"
EOT


echo "garage/garage.toml created"
echo "  rpc_secret:  $RPC_SECRET"
echo "  admin_token: $ADMIN_TOKEN"

# --- Provision S3 API key ---
# Garage must be running for this step. Start it, then wait for the admin API.
echo ""
echo "Starting Garage to provision S3 credentials..."
docker compose up -d garage
GARAGE_ADMIN="http://localhost:3903"

echo "Waiting for Garage admin API..."
for i in $(seq 1 30); do
    if curl -sf -H "Authorization: Bearer $ADMIN_TOKEN" "$GARAGE_ADMIN/v2/GetClusterStatus" > /dev/null 2>&1; then
        break
    fi
    sleep 1
done

# Apply cluster layout (single-node: assign all capacity to the only node)
NODE_ID=$(curl -sf -H "Authorization: Bearer $ADMIN_TOKEN" "$GARAGE_ADMIN/v2/GetClusterStatus" | python3 -c "import sys,json; print(json.load(sys.stdin)['nodes'][0]['id'])")
curl -sf -X POST -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d "[{\"id\": \"$NODE_ID\", \"zone\": \"dc1\", \"capacity\": 1000000000, \"tags\": [\"dev\"]}]" \
    "$GARAGE_ADMIN/v2/UpdateClusterLayout" > /dev/null

curl -sf -X POST -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"version": 1}' \
    "$GARAGE_ADMIN/v2/ApplyClusterLayout" > /dev/null

echo "Cluster layout applied."

# Create an API key for the SvelteKit app
KEY_RESPONSE=$(curl -sf -X POST -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"name": "jump-app"}' \
    "$GARAGE_ADMIN/v2/CreateKey")

S3_ACCESS_KEY_ID=$(echo "$KEY_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin)['accessKeyId'])")
S3_SECRET_ACCESS_KEY=$(echo "$KEY_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin)['secretAccessKey'])")

# Write S3 credentials to .env
if [ -f .env ]; then
    sed -i '' '/^S3_ENDPOINT=/d;/^S3_REGION=/d;/^S3_ACCESS_KEY_ID=/d;/^S3_SECRET_ACCESS_KEY=/d' .env
fi
cat >> .env <<EOF
S3_ENDPOINT=http://localhost:3900
S3_REGION=garage
S3_ACCESS_KEY_ID=$S3_ACCESS_KEY_ID
S3_SECRET_ACCESS_KEY=$S3_SECRET_ACCESS_KEY
EOF

echo ""
echo "S3 credentials added to .env"
echo "  access_key_id:     $S3_ACCESS_KEY_ID"
echo "  secret_access_key: $S3_SECRET_ACCESS_KEY"
